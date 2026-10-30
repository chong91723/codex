"""Transport semantics only: native WS masking, fragmented JSON and handshake."""
import base64,hashlib,io,json,socket,struct,sys,tempfile,threading,types,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from native_transport import WebSocket,connect_unix,GUID

class Sink:
    def __init__(self):self.data=bytearray()
    def sendall(self,data):self.data.extend(data)
    def shutdown(self,*args):pass

class NativeTransportTests(unittest.TestCase):
    def test_native_client_masks_fragmented_output_and_reassembles(self):
        sink=Sink();client=WebSocket(types.SimpleNamespace(rfile=io.BytesIO(),connection=sink),client=True,frame_limit=7)
        message={'id':'native-control','params':{'text':'中文'*10}}
        client.send(message)
        self.assertTrue(sink.data[1]&128)
        server=WebSocket(types.SimpleNamespace(rfile=io.BytesIO(sink.data),connection=Sink()))
        self.assertEqual(message,server.receive())
    def test_native_client_accepts_unmasked_and_rejects_masked_server(self):
        client=WebSocket(types.SimpleNamespace(rfile=io.BytesIO(b'\x81\x02{}'),connection=Sink()),client=True)
        self.assertEqual({},client.receive())
        client=WebSocket(types.SimpleNamespace(rfile=io.BytesIO(b'\x81\x82'),connection=Sink()),client=True)
        with self.assertRaisesRegex(ValueError,'frame'):client.receive()
    def test_handshake_preserves_first_frame_buffered_with_headers(self):
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'native.sock';listener=socket.socket(socket.AF_UNIX);listener.bind(str(path));listener.listen()
            errors=[]
            def serve():
                try:
                    connection,_=listener.accept()
                    with connection:
                        request=b''
                        while b'\r\n\r\n' not in request:request+=connection.recv(4096)
                        key=next(line.split(b':',1)[1].strip() for line in request.split(b'\r\n') if line.lower().startswith(b'sec-websocket-key:'))
                        accept=base64.b64encode(hashlib.sha1(key+GUID.encode()).digest())
                        connection.sendall(b'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: keep-alive, Upgrade\r\nSec-WebSocket-Accept: '+accept+b'\r\nX-Codex-WebSocket-Max-Unfragmented-Message-Bytes: 16\r\n\r\n\x81\x02{}')
                except BaseException as error:errors.append(error)
            thread=threading.Thread(target=serve);thread.start()
            wire=connect_unix(path)
            try:self.assertEqual({},wire.receive());self.assertEqual(16,wire.frame_limit)
            finally:wire.close();wire.reader.close();wire.sock.close();listener.close();thread.join()
            self.assertEqual([],errors)

if __name__=='__main__':unittest.main()
