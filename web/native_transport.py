"""JSON WebSocket framing shared by the browser bridge and native Unix client.

This is transport only. Native Codex owns requests, subscriptions and execution.
"""
import base64
import hashlib
import json
import secrets
import socket
import struct
import threading

MAX_MESSAGE = 32 * 1024 * 1024
GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'


class WebSocket:
    def __init__(self, handler, *, client=False, frame_limit=MAX_MESSAGE):
        self.reader, self.sock = handler.rfile, handler.connection
        self.client, self.frame_limit = client, frame_limit
        self.lock = threading.Lock()
        self.closed = False

    def exact(self, size):
        value = self.reader.read(size)
        if len(value) != size:
            raise EOFError()
        return value

    def send(self, value, opcode=1):
        payload = json.dumps(value, ensure_ascii=False).encode() if not isinstance(value, bytes) else value
        if len(payload) > MAX_MESSAGE:
            raise ValueError('Message exceeds 32 MiB')
        if opcode >= 8 and len(payload) > 125:
            raise ValueError('Invalid control frame')
        limit = self.frame_limit if opcode < 8 else 125
        offsets = range(0, max(1, len(payload)), limit)
        with self.lock:
            if self.closed:
                raise EOFError()
            for offset in offsets:
                part = payload[offset:offset+limit]
                header = bytes([(0x80 if offset+limit >= len(payload) else 0) | (opcode if offset == 0 else 0)])
                length, mask_bit = len(part), 0x80 if self.client else 0
                if length < 126:
                    header += bytes([mask_bit | length])
                elif length < 65536:
                    header += bytes([mask_bit | 126]) + struct.pack('!H', length)
                else:
                    header += bytes([mask_bit | 127]) + struct.pack('!Q', length)
                if self.client:
                    mask = secrets.token_bytes(4)
                    part = bytes(byte ^ mask[i % 4] for i, byte in enumerate(part))
                    header += mask
                self.sock.sendall(header + part)

    def receive(self):
        fragments, initial_opcode = bytearray(), None
        while True:
            first, second = self.exact(2)
            opcode, final = first & 15, bool(first & 128)
            length, masked = second & 127, bool(second & 128)
            if first & 0x70 or masked == self.client:
                raise ValueError('Invalid WebSocket frame')
            if length == 126:
                length = struct.unpack('!H', self.exact(2))[0]
                if length < 126:
                    raise ValueError('Invalid frame length')
            elif length == 127:
                length = struct.unpack('!Q', self.exact(8))[0]
                if length < 65536 or length >> 63:
                    raise ValueError('Invalid frame length')
            if length > MAX_MESSAGE or len(fragments) + length > MAX_MESSAGE:
                raise ValueError('Message exceeds 32 MiB')
            if opcode >= 8 and (not final or length > 125):
                raise ValueError('Invalid control frame')
            mask = self.exact(4) if masked else None
            payload = self.exact(length)
            if mask:
                payload = bytes(byte ^ mask[i % 4] for i, byte in enumerate(payload))
            if opcode == 8:
                if len(payload) == 1:
                    raise ValueError('Invalid close frame')
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


def connect_unix(path, timeout=15):
    """The native Unix listener uses ordinary, uncompressed WebSocket framing."""
    connection = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    reader = None
    try:
        connection.settimeout(timeout)
        connection.connect(str(path))
        key = base64.b64encode(secrets.token_bytes(16)).decode()
        connection.sendall(('GET / HTTP/1.1\r\nHost: localhost\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: '+key+'\r\nSec-WebSocket-Version: 13\r\n\r\n').encode())
        reader = connection.makefile('rb')
        lines, used = [], 0
        while True:
            line = reader.readline(16385-used)
            used += len(line)
            if not line or used > 16384:
                raise ValueError('原生连接握手响应无效。')
            if line == b'\r\n':
                break
            lines.append(line.decode('ascii').strip())
        headers = dict(line.split(':', 1) for line in lines[1:])
        headers = {key.lower(): value.strip() for key, value in headers.items()}
        expected = base64.b64encode(hashlib.sha1((key+GUID).encode()).digest()).decode()
        if (len(lines[0].split()) < 2 or lines[0].split()[1] != '101'
                or headers.get('sec-websocket-accept') != expected
                or headers.get('upgrade', '').lower() != 'websocket'
                or 'upgrade' not in {part.strip() for part in headers.get('connection', '').lower().split(',')}
                or headers.get('sec-websocket-extensions')):
            raise ValueError('原生连接握手校验失败。')
        cap = int(headers.get('x-codex-websocket-max-unfragmented-message-bytes', MAX_MESSAGE))
        if not 1 <= cap <= MAX_MESSAGE:
            raise ValueError('原生连接帧预算无效。')
        connection.settimeout(None)
        handler = type('NativeSocket', (), {'rfile': reader, 'connection': connection})()
        return WebSocket(handler, client=True, frame_limit=cap)
    except BaseException:
        if reader:
            reader.close()
        connection.close()
        raise
