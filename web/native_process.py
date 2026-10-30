"""Bind a native process to its Web owner, without an Agent or polling loop.

Linux parent-death signals belong to the spawning *thread*. Launch on a
service-lifetime waiter, never the HTTP thread that goes away with a browser.
The bootstrap immediately execs the unchanged Codex binary with the same PID.
"""
import os
from pathlib import Path
import queue
import signal
import subprocess
import sys
import threading


def spawn_owned_native(command, **options):
    if not sys.platform.startswith('linux'):
        # Preserve other platforms' existing launch behaviour. Abrupt-owner
        # cleanup there needs an OS service/process group, not this Linux guard.
        return subprocess.Popen(command, **options)
    result = queue.Queue(maxsize=1)
    guarded = [sys.executable, '-I', str(Path(__file__).resolve()), str(os.getpid()), *command]

    def launch_and_wait():
        try:
            process = subprocess.Popen(guarded, **options)
        except Exception as error:
            result.put((None, error))
            return
        result.put((process, None))
        process.wait()  # Keep the Linux creating thread alive with its child.

    threading.Thread(target=launch_and_wait, name='native-process-owner', daemon=True).start()
    process, error = result.get()
    if error is not None:
        raise error
    return process


def main():
    if not sys.platform.startswith('linux') or len(sys.argv) < 3:
        raise RuntimeError('原生进程所有者守卫参数无效。')
    expected_parent = int(sys.argv[1])
    if expected_parent <= 1:
        raise RuntimeError('原生进程所有者无效。')
    import ctypes
    library = ctypes.CDLL(None, use_errno=True)
    library.prctl.argtypes = [ctypes.c_int, ctypes.c_ulong, ctypes.c_ulong, ctypes.c_ulong, ctypes.c_ulong]
    library.prctl.restype = ctypes.c_int
    if library.prctl(1, signal.SIGKILL, 0, 0, 0) != 0:  # PR_SET_PDEATHSIG
        raise OSError(ctypes.get_errno(), '无法绑定原生进程与 Web 所有者，未启动 Codex。')
    if os.getppid() != expected_parent:
        # Covers death before prctl; never adopt a replacement/subreaper owner.
        raise RuntimeError('Web 所有者已退出，未启动新的原生进程。')
    os.execvpe(sys.argv[2], sys.argv[2:], os.environ)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(70)
