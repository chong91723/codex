"""Local Skill package transport; discovery, parsing and enablement stay native.

Uploads are never executed or fetched. Only registered packages in this profile
may pass the Web product's Skill boundary; chat attachments remain image-only.
"""
from __future__ import annotations

import base64
import binascii
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import stat
import tempfile
import threading
import uuid
import zipfile

UPLOAD_BYTES = 8 * 1024 * 1024
EXPANDED_BYTES = 24 * 1024 * 1024
FILE_BYTES = 8 * 1024 * 1024
SKILL_BYTES = 256 * 1024
MAX_FILES = 256
HTTP_BYTES = ((UPLOAD_BYTES + 2) // 3) * 4 + 4096
BUILTIN_NAMES = frozenset(('openai-docs', 'review-agent', 'skill-creator', 'skill-installer'))
PACKAGE_ID = re.compile(r'^[0-9a-f]{32}$')
LIMITS = {'uploadBytes': UPLOAD_BYTES, 'expandedBytes': EXPANDED_BYTES,
          'fileBytes': FILE_BYTES, 'skillBytes': SKILL_BYTES, 'files': MAX_FILES,
          'pathBytes': 1024, 'pathDepth': 16}


def _safe_relative(name):
    if (not isinstance(name, str) or not name or '\\' in name or ':' in name or '\x00' in name
            or name.startswith('/') or any(part in ('', '.', '..') for part in name.rstrip('/').split('/'))):
        raise ValueError('技能包包含无效路径；不允许绝对路径、路径穿越或反斜杠。')
    try:
        components = name.rstrip('/').split('/')
        if (len(name.encode('utf-8')) > 1024 or len(components) > 16
                or any(len(component.encode('utf-8')) > 255 for component in components)):
            raise ValueError('技能包路径超过长度或层级限制。')
    except UnicodeEncodeError as error:
        raise ValueError('技能包路径必须是有效的 Unicode 文本。') from error
    return PurePosixPath(name.rstrip('/'))


def unpack_payload(payload):
    """Return bounded inert bytes; the native parser validates SKILL.md later."""
    filename, encoded = payload.get('filename'), payload.get('dataBase64')
    if not isinstance(filename, str) or not isinstance(encoded, str):
        raise ValueError('请提供技能文件名和 Base64 内容。')
    if len(filename) > 255 or '/' in filename or '\\' in filename:
        raise ValueError('技能文件名无效。')
    if len(encoded) > ((UPLOAD_BYTES + 2) // 3) * 4:
        raise ValueError('上传的技能包超过 8 MiB。')
    try:
        raw = base64.b64decode(encoded, validate=True)
    except (ValueError, binascii.Error) as error:
        raise ValueError('技能文件的 Base64 内容无效。') from error
    if not raw or len(raw) > UPLOAD_BYTES:
        raise ValueError('上传的技能包为空或超过 8 MiB。')
    if filename.casefold() == 'skill.md':
        files = {'SKILL.md': raw}
    elif filename.lower().endswith('.zip'):
        files, paths, total = {}, {}, 0
        try:
            with zipfile.ZipFile(io.BytesIO(raw)) as archive:
                infos = archive.infolist()
                if not infos or len(infos) > MAX_FILES:
                    raise ValueError('技能包最多包含 256 个文件和目录。')
                for info in infos:
                    if info.compress_type not in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED):
                        raise ValueError('技能包仅支持 ZIP Stored 或 Deflate 压缩方式。')
                    path = _safe_relative(info.orig_filename)
                    key = path.as_posix()
                    if key in paths:
                        raise ValueError('技能包存在重复路径。')
                    mode = info.external_attr >> 16
                    kind = stat.S_IFMT(mode)
                    directory = info.is_dir()
                    if (kind not in (0, stat.S_IFREG, stat.S_IFDIR)
                            or (kind == stat.S_IFDIR and not directory)
                            or (directory and kind == stat.S_IFREG)):
                        raise ValueError('技能包不允许符号链接、设备或特殊文件。')
                    if info.flag_bits & 1:
                        raise ValueError('不支持加密技能包。')
                    paths[key] = directory
                    if directory:
                        continue
                    if info.file_size > FILE_BYTES:
                        raise ValueError('技能包单个文件超过 8 MiB。')
                    chunks, size = [], 0
                    with archive.open(info) as source:
                        while chunk := source.read(min(65536, FILE_BYTES - size + 1, EXPANDED_BYTES - total + 1)):
                            size += len(chunk)
                            total += len(chunk)
                            if size > FILE_BYTES or total > EXPANDED_BYTES:
                                raise ValueError('技能包展开内容超过文件或总大小限制。')
                            chunks.append(chunk)
                    files[key] = b''.join(chunks)
                for key in paths:
                    if any(paths.get(parent.as_posix()) is False for parent in PurePosixPath(key).parents if str(parent) != '.'):
                        raise ValueError('技能包存在文件与目录路径冲突。')
        except (zipfile.BadZipFile, RuntimeError, NotImplementedError, EOFError) as error:
            raise ValueError('ZIP 技能包无效或使用了不支持的压缩方式。') from error
        documents = [key for key in files if PurePosixPath(key).name == 'SKILL.md']
        if len(documents) != 1:
            raise ValueError('一个技能包必须且只能包含一个 SKILL.md。')
        prefix = PurePosixPath(documents[0]).parent
        if str(prefix) != '.':
            if any(not PurePosixPath(key).is_relative_to(prefix) for key in paths):
                raise ValueError('ZIP 中所有内容必须位于同一个技能目录内。')
            files = {PurePosixPath(key).relative_to(prefix).as_posix(): value for key, value in files.items()}
    else:
        raise ValueError('仅支持 ZIP 技能包或单个 SKILL.md；聊天附件仍仅支持图片。')
    document = files.get('SKILL.md', b'')
    if not document or len(document) > SKILL_BYTES:
        raise ValueError('SKILL.md 不能为空且不能超过 256 KiB。')
    try:
        document.decode('utf-8')
    except UnicodeDecodeError as error:
        raise ValueError('SKILL.md 必须是有效的 UTF-8 文本。') from error
    return files


class SkillPackages:
    def __init__(self, home=None):
        self.home = Path(home or os.environ.get('CODEX_HOME', Path.home()/'.codex')).absolute()
        if '..' in self.home.parts:
            raise ValueError('CODEX_HOME 必须使用规范绝对路径。')
        self.root = self.home/'skills'/'web-uploaded'
        self.state = self.home/'web-skills'
        self.registry = self.state/'registry.json'
        self.lock = threading.RLock()

    def _path(self, path, *, directory=False, create=False):
        """Reject symlinks in every profile-owned component, including the root."""
        if not path.is_relative_to(self.home):
            raise ValueError('技能路径超出当前 CODEX_HOME。')
        current = Path(path.anchor)
        for component in path.parts[1:]:
            current = current/component
            try:
                info = current.lstat()
            except FileNotFoundError:
                if create:
                    current.mkdir(mode=0o700)
                    info = current.lstat()
                else:
                    return path
            if stat.S_ISLNK(info.st_mode):
                raise ValueError('技能存储路径不能包含符号链接。')
            if current != path and not stat.S_ISDIR(info.st_mode):
                raise ValueError('技能存储路径包含非目录组件。')
            if current == path and (not stat.S_ISDIR(info.st_mode) if directory else not stat.S_ISREG(info.st_mode)):
                raise ValueError('技能存储路径类型无效。')
        return path

    def _read(self):
        self._path(self.state, directory=True)
        self._path(self.registry)
        try:
            if self.registry.stat().st_size > 2 * 1024 * 1024:
                raise ValueError('技能注册表超过大小限制。')
            with os.fdopen(os.open(self.registry, os.O_RDONLY | os.O_NOFOLLOW), 'r', encoding='utf-8') as stream:
                value = json.load(stream)
        except FileNotFoundError:
            return []
        except (UnicodeError, json.JSONDecodeError) as error:
            raise ValueError('技能注册表不可读，请检查当前实例。') from error
        records = value.get('skills') if isinstance(value, dict) and value.get('format') == 1 else None
        if (not isinstance(records, list) or any(not isinstance(item, dict) or not PACKAGE_ID.fullmatch(str(item.get('id', '')))
                or not isinstance(item.get('name'), str) or not isinstance(item.get('manifest'), list) for item in records)
                or len({item['id'] for item in records}) != len(records)):
            raise ValueError('技能注册表格式无效。')
        return records

    def _write(self, records):
        self._path(self.state, directory=True, create=True)
        self._path(self.registry)
        content = json.dumps({'format': 1, 'skills': records}, ensure_ascii=False)
        if len(content.encode('utf-8')) > 2 * 1024 * 1024:
            raise ValueError('技能注册表超过 2 MiB，请先移除不用的上传技能。')
        descriptor, name = tempfile.mkstemp(prefix='.registry-', dir=self.state)
        try:
            with os.fdopen(descriptor, 'w', encoding='utf-8') as stream:
                stream.write(content)
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(name, self.registry)
        finally:
            Path(name).unlink(missing_ok=True)

    def _tree(self, package):
        root = self.root/package['id']
        self._path(root, directory=True)
        manifest = []
        if not root.is_dir():
            raise ValueError('上传技能的文件已丢失，请重新上传。')
        for directory, subdirs, names in os.walk(root, followlinks=False):
            for name in subdirs + names:
                path = Path(directory)/name
                info = path.lstat()
                if stat.S_ISLNK(info.st_mode) or not (stat.S_ISDIR(info.st_mode) or stat.S_ISREG(info.st_mode)):
                    raise ValueError('上传技能包含符号链接或特殊文件，已停止使用。')
                if stat.S_ISDIR(info.st_mode):
                    continue
                if info.st_size > FILE_BYTES or len(manifest) >= MAX_FILES:
                    raise ValueError('上传技能的文件超出限制。')
                digest = hashlib.sha256()
                with os.fdopen(os.open(path, os.O_RDONLY | os.O_NOFOLLOW), 'rb') as stream:
                    size = 0
                    while chunk := stream.read(65536):
                        size += len(chunk)
                        if size > FILE_BYTES:
                            raise ValueError('上传技能的文件超出限制。')
                        digest.update(chunk)
                manifest.append({'path': path.relative_to(root).as_posix(), 'bytes': size, 'sha256': digest.hexdigest()})
        manifest.sort(key=lambda item: item['path'])
        if sum(item['bytes'] for item in manifest) > EXPANDED_BYTES:
            raise ValueError('上传技能展开内容超出限制。')
        version = hashlib.sha256(json.dumps(manifest, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
        return manifest, version

    def _public(self, record):
        manifest, version = self._tree(record)
        intact = manifest == record['manifest']
        value = {'id': record['id'], 'name': record['name'], 'description': record.get('description', ''),
                 'path': str(self.root/record['id']/'SKILL.md'), 'version': version,
                 'files': len(manifest), 'bytes': sum(item['bytes'] for item in manifest),
                 'integrity': intact, 'origin': 'uploaded'}
        if not intact:
            value['error'] = '技能内容已变化，已停止使用；请移除后重新上传。'
        return value

    def _entry_state(self, identifier):
        """Fingerprint damaged entries without following any link or reading data.

        Broken entries are removable by a current CAS token, including a missing
        directory. Refuse unbounded/admin-created trees rather than traversing
        outside the registered directory or providing an incomplete CAS proof.
        """
        self._path(self.root, directory=True)
        root = self.root/identifier
        entries = []
        def visit(path, relative, depth):
            if depth > 32 or len(entries) >= 4096:
                raise ValueError('损坏的技能目录超出安全清理范围，请管理员检查。')
            try:
                info = path.lstat()
            except FileNotFoundError:
                entries.append({'path': relative, 'missing': True})
                return
            item = {'path': relative, 'mode': info.st_mode, 'dev': info.st_dev,
                    'ino': info.st_ino, 'bytes': info.st_size, 'mtime': info.st_mtime_ns,
                    'ctime': info.st_ctime_ns}
            entries.append(item)
            if stat.S_ISLNK(info.st_mode):
                item['link'] = hashlib.sha256(os.fsencode(os.readlink(path))).hexdigest()
            elif stat.S_ISDIR(info.st_mode):
                descriptor = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
                try:
                    opened = os.fstat(descriptor)
                    if (opened.st_dev, opened.st_ino) != (info.st_dev, info.st_ino):
                        raise ValueError('技能目录在检查期间变化，请刷新后重试。')
                    for name in sorted(os.listdir(descriptor)):
                        # O_NOFOLLOW directory opens and lstat prevent traversal
                        # of every link. An entry changing mid-scan is rejected.
                        child = Path('/proc/self/fd')/str(descriptor)/name
                        visit(child, relative+'/'+name, depth+1)
                    after = os.fstat(descriptor)
                    if (after.st_mtime_ns, after.st_ctime_ns) != (info.st_mtime_ns, info.st_ctime_ns):
                        raise ValueError('技能目录在检查期间变化，请刷新后重试。')
                finally:
                    os.close(descriptor)
        visit(root, '', 0)
        return entries

    def _status(self, record):
        try:
            return self._public(record)
        except (OSError, ValueError) as error:
            try:
                state = self._entry_state(record['id'])
                removable = True
            except (OSError, ValueError) as inspection_error:
                # Per-entry failure never invalidates the remaining registry.
                # A full current proof is still required before destructive work.
                state = {'uninspectable': str(inspection_error)}
                removable = False
            version = hashlib.sha256(json.dumps({'record': record, 'state': state},
                sort_keys=True, separators=(',', ':')).encode()).hexdigest()
            return {'id': record['id'], 'name': record['name'], 'description': record.get('description', ''),
                    'path': str(self.root/record['id']/'SKILL.md'), 'integrity': False,
                    'version': 'broken-'+version, 'files': 0, 'bytes': 0,
                    'origin': 'uploaded', 'error': str(error), 'removable': removable}

    def list(self):
        with self.lock:
            return {'skills': [self._status(record) for record in self._read()], 'limits': dict(LIMITS)}

    def allows(self, name, path):
        if not isinstance(path, str) or not Path(path).is_absolute():
            return False
        try:
            with self.lock:
                for record in self._read():
                    expected = self.root/record['id']/'SKILL.md'
                    if Path(path) != expected or (name is not None and name != record['name']):
                        continue
                    self._path(expected)
                    # Fail closed if an administrator altered an installed package.
                    manifest, _ = self._tree(record)
                    return manifest == record['manifest']
        except (OSError, ValueError, RuntimeError):
            return False
        return False

    @staticmethod
    def _idle(runtime):
        snapshot = runtime.status()['execution']
        if (snapshot['status'] != 'idle' or snapshot.get('pendingNativeAcks')
                or snapshot.get('cleanupHolds') or snapshot.get('activeTurns')
                or snapshot.get('pendingCount') or snapshot.get('ownerThreadId')
                or ('observerReady' in snapshot and snapshot['observerReady'] is not True)):
            raise ValueError('请先结束正在运行、等待审批或清理中的分析，再安装或移除技能。')

    @staticmethod
    def _native_skills(runtime, workspace):
        result = runtime.observer.call('skills/list', {'cwds': [str(workspace)], 'forceReload': True})
        groups = result.get('data') if isinstance(result, dict) else None
        if not isinstance(groups, list) or not groups:
            raise ValueError('原生技能列表返回无效，未确认安装。')
        return ([item for group in groups for item in group.get('skills', [])],
                [item for group in groups for item in group.get('errors', [])])

    def upload(self, payload, runtime, workspace):
        files = unpack_payload(payload)
        with runtime.control, self.lock:
            runtime.start()
            self._idle(runtime)
            records = self._read()
            existing, _ = self._native_skills(runtime, workspace)
            self._path(self.state, directory=True, create=True)
            self._path(self.root, directory=True, create=True)
            identifier = uuid.uuid4().hex
            destination = self.root/identifier
            document = destination/'SKILL.md'
            staging = Path(tempfile.mkdtemp(prefix='.upload-', dir=self.state))
            moved = False
            try:
                for relative, content in files.items():
                    target = staging/relative
                    target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
                    with target.open('xb') as stream:
                        stream.write(content)
                    target.chmod(0o600)
                # Disable the exact future path before exposing it to native discovery.
                disabled = runtime.observer.call('skills/config/write', {'path': str(document), 'enabled': False})
                if not isinstance(disabled, dict) or disabled.get('effectiveEnabled') is not False:
                    raise ValueError('当前原生配置不允许默认停用此技能，未安装。')
                staging.rename(destination)
                moved = True
                native, errors = self._native_skills(runtime, workspace)
                matching = [item for item in native if item.get('path') == str(document)]
                if len(matching) != 1:
                    detail = next((item.get('message', '') for item in errors if item.get('path') == str(document)), '')
                    raise ValueError('Codex 原生技能解析失败，未安装。' + (' '+detail if detail else ''))
                metadata = matching[0]
                name = metadata.get('name')
                if (not isinstance(name, str) or not name or name in BUILTIN_NAMES
                        or any(item.get('name') == name for item in existing)
                        or any(item['name'] == name for item in records)):
                    raise ValueError('技能名称与现有技能冲突，请修改 SKILL.md 中的名称后重试。')
                if metadata.get('enabled') is not False:
                    raise ValueError('新技能未被原生配置停用，安装已回滚。')
                record = {'id': identifier, 'name': name, 'description': metadata.get('description', ''), 'manifest': []}
                record['manifest'], _ = self._tree(record)
                public = self._public(record)
                self._write(records + [record])
                return {'skill': public, 'enabled': False}
            except Exception:
                if moved:
                    self._path(destination, directory=True)
                    shutil.rmtree(destination)
                    # Invalidate native cache after rollback; propagate failure honestly.
                    self._native_skills(runtime, workspace)
                raise
            finally:
                if staging.exists():
                    shutil.rmtree(staging)

    def remove(self, payload, runtime, workspace):
        identifier = payload.get('id')
        if not isinstance(identifier, str) or not PACKAGE_ID.fullmatch(identifier):
            raise ValueError('只能移除本实例中已登记的上传技能。')
        with runtime.control, self.lock:
            runtime.start()
            self._idle(runtime)
            records = self._read()
            record = next((item for item in records if item['id'] == identifier), None)
            if record is None:
                raise ValueError('上传技能不存在或已被移除，请刷新列表。')
            current = self._status(record)
            if not isinstance(payload.get('expectedVersion'), str) or payload['expectedVersion'] != current['version']:
                raise ValueError('技能文件已变化，请刷新列表后再移除；尚未删除。')
            if current.get('removable') is False:
                raise ValueError('损坏的技能目录暂时无法安全检查，请管理员检查；尚未删除。')
            was_enabled = False
            if current['integrity']:
                native, _ = self._native_skills(runtime, workspace)
                was_enabled = next((item.get('enabled') is True for item in native if item.get('path') == current['path']), False)
            runtime.observer.call('skills/config/write', {'path': current['path'], 'enabled': False})
            # Native RPCs may take time. Recheck the proof immediately before
            # renaming only the registered entry, including a symlink itself.
            if self._status(record)['version'] != payload['expectedVersion']:
                raise ValueError('技能文件在移除期间变化，请刷新列表后重试；尚未删除。')
            self._path(self.root, directory=True)
            self._path(self.state, directory=True, create=True)
            destination = self.root/identifier
            retired = self.state/('.removed-'+uuid.uuid4().hex)
            moved = False
            try:
                try:
                    destination.lstat()
                except FileNotFoundError:
                    pass  # Missing package: unregister it; no outside path is used.
                else:
                    destination.rename(retired)
                    moved = True
                remaining, _ = self._native_skills(runtime, workspace)
                if any(item.get('path') == current['path'] for item in remaining):
                    raise ValueError('原生技能缓存尚未移除该技能，请重试。')
                self._write([item for item in records if item['id'] != identifier])
            except Exception:
                if moved:
                    retired.rename(destination)
                runtime.observer.call('skills/config/write', {'path': current['path'], 'enabled': was_enabled})
                # A damaged package must not be followed just to restore its cache.
                if current['integrity']:
                    self._native_skills(runtime, workspace)
                raise
            if moved:
                if stat.S_ISDIR(retired.lstat().st_mode):
                    shutil.rmtree(retired)
                else:
                    retired.unlink()  # Links/devices/files: unlink only this entry.
            return {'removed': identifier}
