#!/usr/bin/env python3
"""Dependency-free local UI transport for the unmodified Codex executable.

The bridge does not implement agent behavior: JSON-RPC is forwarded verbatim.
Each browser connection owns one app-server process, including approvals.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import http.cookies
import json
import mimetypes
import os
from pathlib import Path
import secrets
import shutil
import signal
import socket
import struct
import subprocess
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parent
MAX_MESSAGE = 32 * 1024 * 1024


class WebSocket:
    """RFC 6455 framing, including fragmented browser messages and ping/pong."""

    def __init__(self, handler):
        self.reader, self.sock = handler.rfile, handler.connection
        self.lock = threading.Lock()
        self.closed = False

    def exact(self, size):
        result = self.reader.read(size)
        if len(result) != size:
            raise EOFError()
        return result

    def send(self, value, opcode=1):
        payload = json.dumps(value, ensure_ascii=False).encode() if not isinstance(value, bytes) else value
        length = len(payload)
        header = bytes([0x80 | opcode])
        if length < 126:
            header += bytes([length])
        elif length < 65536:
            header += bytes([126]) + struct.pack('!H', length)
        else:
            header += bytes([127]) + struct.pack('!Q', length)
        with self.lock:
            if not self.closed:
                self.sock.sendall(header + payload)

    def receive(self):
        fragments, initial_opcode = bytearray(), None
        while True:
            first, second = self.exact(2)
            opcode, final = first & 15, bool(first & 128)
            length, masked = second & 127, bool(second & 128)
            if first & 0x70 or not masked:
                raise ValueError('Invalid browser WebSocket frame')
            if length == 126:
                length = struct.unpack('!H', self.exact(2))[0]
            elif length == 127:
                length = struct.unpack('!Q', self.exact(8))[0]
            if length > MAX_MESSAGE or len(fragments) + length > MAX_MESSAGE:
                raise ValueError('Message exceeds 32 MiB')
            if opcode >= 8 and (not final or length > 125):
                raise ValueError('Invalid control frame')
            mask = self.exact(4)
            payload = bytes(byte ^ mask[i % 4] for i, byte in enumerate(self.exact(length)))
            if opcode == 8:
                self.send(payload, opcode=8)
                raise EOFError()
            if opcode == 9:
                self.send(payload, opcode=10)
                continue
            if opcode == 10:
                continue
            if opcode in (1, 2):
                if initial_opcode is not None:
                    raise ValueError('Nested fragmented message')
                initial_opcode = opcode
            elif opcode != 0 or initial_opcode is None:
                raise ValueError('Invalid continuation')
            fragments.extend(payload)
            if final:
                if initial_opcode != 1:
                    raise ValueError('Expected a JSON text message')
                return json.loads(fragments.decode('utf-8'))

    def close(self):
        self.closed = True
        try:
            self.sock.shutdown(socket.SHUT_RDWR)
        except OSError:
            pass


def stop_process(process):
    if process.poll() is None:
        try:
            os.killpg(process.pid, signal.SIGTERM)
            process.wait(timeout=3)
        except (OSError, subprocess.TimeoutExpired):
            try:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait(timeout=3)
            except (OSError, subprocess.TimeoutExpired):
                pass


def rpc_bridge(ws, settings):
    process = subprocess.Popen(
        [settings.codex, 'app-server', '--listen', 'stdio://'],
        cwd=settings.workspace, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
        stderr=subprocess.PIPE, start_new_session=True,
    )
    settings.register(process)

    def forward_output():
        try:
            for line in process.stdout:
                if line.strip():
                    # Parse only for framing. IDs, results, errors and methods stay native.
                    ws.send(json.loads(line))
            ws.send({'bridge': 'exit', 'code': process.wait()})
        except (OSError, ValueError):
            pass
        finally:
            ws.close()

    def forward_stderr():
        try:
            for line in process.stderr:
                ws.send({'bridge': 'stderr', 'text': line.decode(errors='replace')})
        except OSError:
            pass

    threading.Thread(target=forward_output, daemon=True).start()
    threading.Thread(target=forward_stderr, daemon=True).start()
    try:
        while True:
            message = ws.receive()
            if not isinstance(message, dict):
                raise ValueError('JSON-RPC message must be an object')
            process.stdin.write(json.dumps(message, ensure_ascii=False).encode() + b'\n')
            process.stdin.flush()
    finally:
        stop_process(process)
        settings.unregister(process)


def terminal_bridge(ws, settings, query):
    # A real PTY runs the original CLI; no reimplementation of its commands/TUI.
    import fcntl
    import pty
    import termios

    cwd = Path(query.get('cwd', [str(settings.workspace)])[0]).expanduser().resolve()
    if not cwd.is_dir():
        raise ValueError('Working directory does not exist')
    args = json.loads(query.get('args', ['[]'])[0])
    if not isinstance(args, list) or not all(isinstance(arg, str) for arg in args):
        raise ValueError('CLI arguments must be a JSON array of strings')
    master, slave = pty.openpty()
    fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack('HHHH', 32, 120, 0, 0))

    def terminal_session():
        os.setsid()
        fcntl.ioctl(0, termios.TIOCSCTTY, 0)

    process = subprocess.Popen(
        [settings.codex, *args], cwd=cwd, stdin=slave, stdout=slave, stderr=slave,
        env={**os.environ, 'TERM': 'xterm-256color', 'COLORTERM': 'truecolor'},
        preexec_fn=terminal_session,
    )
    os.close(slave)
    settings.register(process)

    def read_output():
        try:
            while data := os.read(master, 32768):
                ws.send({'data': base64.b64encode(data).decode()})
        except OSError:
            pass
        finally:
            try:
                ws.send({'exit': process.wait()})
            except OSError:
                pass
            ws.close()

    threading.Thread(target=read_output, daemon=True).start()
    try:
        while True:
            message = ws.receive()
            if 'data' in message:
                os.write(master, base64.b64decode(message['data'], validate=True))
            if 'cols' in message and 'rows' in message:
                cols = max(1, min(1000, int(message['cols'])))
                rows = max(1, min(1000, int(message['rows'])))
                fcntl.ioctl(master, termios.TIOCSWINSZ, struct.pack('HHHH', rows, cols, 0, 0))
    finally:
        stop_process(process)
        settings.unregister(process)
        os.close(master)


class Settings:
    def __init__(self, args):
        self.codex = shutil.which(args.codex) or args.codex
        if not Path(self.codex).is_file():
            raise ValueError('Build the latest source first: python3 web/scripts/build_native.py')
        native = ROOT.parent / 'native' / 'bin' / 'codex'
        self.provenance = None
        if Path(self.codex).resolve() == native.resolve():
            from scripts.verify_upstream import verify
            verify(native)
            self.provenance = json.loads((ROOT.parent / 'native' / 'provenance.json').read_text())
        self.workspace = Path(args.workspace).expanduser().resolve()
        self.workspace.mkdir(parents=True, exist_ok=True)
        self.bind, self.port = args.bind, args.port
        self.remote = args.bind not in ('127.0.0.1', 'localhost', '::1')
        self.token = os.environ.get('CODEX_WEB_TOKEN') or secrets.token_urlsafe(32)
        if self.remote and not os.environ.get('CODEX_WEB_TOKEN'):
            raise ValueError('Remote binding requires CODEX_WEB_TOKEN')
        self.children, self.lock = set(), threading.Lock()
        self.schema_dir = tempfile.TemporaryDirectory(prefix='codex-web-schema-')
        self.version = subprocess.check_output([self.codex, '--version'], text=True).strip()
        subprocess.run([self.codex, 'app-server', 'generate-json-schema', '--experimental', '--out', self.schema_dir.name], check=True)

    def register(self, process):
        with self.lock:
            self.children.add(process)

    def unregister(self, process):
        with self.lock:
            self.children.discard(process)

    def close(self):
        with self.lock:
            processes = list(self.children)
        for process in processes:
            stop_process(process)
        self.schema_dir.cleanup()

    def status(self):
        manifest = ROOT.parent / 'upstream-lock.json'
        baseline = json.loads(manifest.read_text()) if manifest.exists() else None
        return {'version': self.version, 'runtimePath': self.codex, 'workspace': str(self.workspace), 'baseline': baseline, 'build': self.provenance,
                'transport': 'stdio', 'pid': os.getpid()}


class Handler(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'

    def log_message(self, fmt, *args):
        # No request URLs: login query parameters must not be written to access logs.
        pass

    def send_bytes(self, status, payload, mime='application/json; charset=utf-8', cookie=None):
        self.send_response(status)
        self.send_header('Content-Type', mime)
        self.send_header('Content-Length', str(len(payload)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'no-referrer')
        self.send_header('X-Frame-Options', 'DENY')
        self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'")
        if cookie:
            self.send_header('Set-Cookie', f'codex_web={cookie}; HttpOnly; SameSite=Strict; Path=/')
        self.end_headers()
        self.wfile.write(payload)

    def reject(self, code, message):
        self.send_bytes(code, json.dumps({'error': message}).encode())

    def do_GET(self):
        settings = self.server.settings
        parsed = urlparse(self.path)
        host = self.headers.get('Host', '')
        hostname = urlparse('http://' + host).hostname
        if not settings.remote and hostname not in ('localhost', '127.0.0.1', '::1'):
            return self.reject(403, 'Invalid Host')
        origin = self.headers.get('Origin')
        if origin and urlparse(origin).netloc != host:
            return self.reject(403, 'Cross-origin request rejected')
        cookies = http.cookies.SimpleCookie()
        try:
            cookies.load(self.headers.get('Cookie', ''))
        except http.cookies.CookieError:
            return self.reject(403, 'Invalid session')
        token = cookies.get('codex_web')
        authorized = bool(token and secrets.compare_digest(token.value, settings.token))
        query = parse_qs(parsed.query)
        supplied = query.get('token', [''])[0]
        if not authorized and parsed.path == '/':
            if settings.remote and not secrets.compare_digest(supplied, settings.token):
                return self.reject(401, 'Open /?token=YOUR_CODEX_WEB_TOKEN once to sign in')
            authorized = True
            cookie = settings.token
        else:
            cookie = None
        if not authorized:
            return self.reject(401, 'Open the home page to establish a local session')
        try:
            if parsed.path == '/api/status':
                return self.send_bytes(200, json.dumps(settings.status()).encode())
            if parsed.path.startswith('/api/schema/'):
                name = parsed.path.removeprefix('/api/schema/')
                if not name.endswith('.json') or '/' in name or '\\' in name:
                    return self.reject(404, 'Schema not found')
                path = Path(settings.schema_dir.name) / name
                if not path.is_file():
                    return self.reject(404, 'Schema not found')
                return self.send_bytes(200, path.read_bytes())
            if parsed.path in ('/ws/rpc', '/ws/terminal'):
                if self.headers.get('Upgrade', '').lower() != 'websocket':
                    return self.reject(426, 'WebSocket required')
                key = self.headers.get('Sec-WebSocket-Key', '')
                try:
                    valid_key = len(base64.b64decode(key, validate=True)) == 16
                except ValueError:
                    valid_key = False
                if not valid_key or self.headers.get('Sec-WebSocket-Version') != '13':
                    return self.reject(400, 'Invalid WebSocket handshake')
                accept = base64.b64encode(hashlib.sha1((key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').encode()).digest()).decode()
                self.send_response(101)
                self.send_header('Upgrade', 'websocket')
                self.send_header('Connection', 'Upgrade')
                self.send_header('Sec-WebSocket-Accept', accept)
                self.end_headers()
                self.close_connection = True
                ws = WebSocket(self)
                try:
                    (rpc_bridge(ws, settings) if parsed.path == '/ws/rpc'
                     else terminal_bridge(ws, settings, query))
                except (EOFError, BrokenPipeError, ConnectionResetError):
                    pass
                except Exception as error:
                    try:
                        ws.send({'bridge': 'error', 'message': str(error)})
                    except OSError:
                        pass
                finally:
                    ws.close()
                return
            relative = 'index.html' if parsed.path == '/' else parsed.path.lstrip('/')
            path = (ROOT / 'public' / relative).resolve()
            if not path.is_relative_to(ROOT / 'public') or not path.is_file():
                return self.reject(404, 'Not found')
            mime = mimetypes.guess_type(path.name)[0] or 'application/octet-stream'
            return self.send_bytes(200, path.read_bytes(), mime, cookie)
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception as error:
            self.reject(500, str(error))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--bind', default='127.0.0.1')
    parser.add_argument('--port', type=int, default=8765)
    parser.add_argument('--codex', default=os.environ.get('CODEX_BIN', str(ROOT.parent / 'native' / 'bin' / 'codex')))
    parser.add_argument('--workspace', default=str(ROOT.parent / 'workspaces' / 'default'))
    args = parser.parse_args()
    settings = Settings(args)
    server = ThreadingHTTPServer((args.bind, args.port), Handler)
    server.daemon_threads = True
    server.settings = settings
    print(f'Codex Web: http://{args.bind}:{server.server_port}', flush=True)
    print(f'Native runtime: {settings.version} | workspace: {settings.workspace}', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        settings.close()


if __name__ == '__main__':
    main()
