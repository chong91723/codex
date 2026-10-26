"""Request-scoped cancellation, independent of the unmodified Codex runtime."""
from contextlib import contextmanager
import threading


class Cancelled(ValueError):
    def __init__(self):
        super().__init__('查询已取消；未完成的数据不会作为完整结果返回。')


class Cancellation:
    def __init__(self):
        self.event = threading.Event()
        self.lock = threading.RLock()
        self.callbacks = {}

    def check(self):
        if self.event.is_set():
            raise Cancelled()

    @contextmanager
    def watch(self, callback):
        # Removal waits for a callback already in progress, before resources close.
        with self.lock:
            self.check()
            handle=object()
            self.callbacks[handle]=callback
        try:
            yield
        finally:
            with self.lock:
                self.callbacks.pop(handle,None)

    @contextmanager
    def commit(self):
        with self.lock:
            self.check()
            yield

    def cancel(self):
        self.event.set()
        with self.lock:
            for callback in tuple(self.callbacks.values()):
                try:
                    callback()
                except Exception:
                    # Transport/server timeouts remain a backstop; never return a
                    # successful partial result when a cancellation hook fails.
                    pass
