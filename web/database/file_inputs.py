"""Stable file acquisition and cheap revalidation of imported analysis inputs."""
import hashlib
import os
from pathlib import Path
import stat

MAX_FILE_BYTES=4*1024*1024

def signature(value):
    return {'device':value.st_dev,'inode':value.st_ino,'size':value.st_size,
            'mtimeNs':value.st_mtime_ns,'ctimeNs':value.st_ctime_ns}

def read_stable(path):
    path=Path(path)
    try:
        descriptor=os.open(path,os.O_RDONLY|os.O_NONBLOCK|os.O_NOFOLLOW)
        with os.fdopen(descriptor,'rb') as source:
            before=os.fstat(source.fileno())
            if not stat.S_ISREG(before.st_mode) or before.st_size>MAX_FILE_BYTES:
                raise ValueError('文件不是普通文件或超出读取预算。')
            data=source.read(MAX_FILE_BYTES+1)
            after=os.fstat(source.fileno())
        current=path.stat()
    except OSError as error:
        raise ValueError('分析文件不存在或无法读取，请重新选择并导入。') from error
    if len(data)>MAX_FILE_BYTES or len(data)!=before.st_size or signature(before)!=signature(after) or signature(after)!=signature(current):
        raise ValueError('文件在读取期间发生变化，未保存不一致内容；请完成保存后重新导入。')
    return data,signature(after)

def dependencies(values):
    result={}
    for value in values:
        for item in value.get('fileDependencies',[]):
            key=(item['path'],item.get('sha256'))
            result[key]=item
    return list(result.values())

def check_files(values):
    for value in values:
        sources=[value.get('source',{}),*value.get('inputSources',[])]
        if any(source.get('kind')=='file' and source.get('path') for source in sources) and not value.get('fileDependencies'):
            raise ValueError('旧文件结果缺少源文件版本记录，请重新导入并计算；历史仍可查看下载。')
    for item in dependencies(values):
        try:
            current=signature(Path(item['path']).stat())
            if current==item.get('signature'):continue
            data,_=read_stable(item['path'])
            if hashlib.sha256(data).hexdigest()==item.get('sha256'):continue
        except (OSError,ValueError):pass
        raise ValueError('分析依赖文件“'+Path(item['path']).name+'”已修改、替换或删除；当前任务没有自动切换版本。请重新导入新文件并重新计算，历史结果仍可查看下载。')
