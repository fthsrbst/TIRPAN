"""
Minimal telnetlib compatibility shim for Python 3.13+.
Provides the Telnet class used by legacy ExploitDB scripts.
Drop this in PYTHONPATH so scripts that do `from telnetlib import Telnet` still work.
"""
import socket
import time

DEBUGLEVEL = 0
TELNET_PORT = 23

IAC  = bytes([255])
DONT = bytes([254])
DO   = bytes([253])
WONT = bytes([252])
WILL = bytes([251])


class Telnet:
    def __init__(self, host=None, port=0, timeout=socket._GLOBAL_DEFAULT_TIMEOUT):
        self.sock = None
        self.rawq = b""
        self.eof = False
        if host:
            self.open(host, port, timeout)

    def open(self, host, port=0, timeout=socket._GLOBAL_DEFAULT_TIMEOUT):
        self.host = host
        self.port = port or TELNET_PORT
        self.timeout = timeout
        self.sock = socket.create_connection((host, self.port), timeout)

    def close(self):
        if self.sock:
            self.sock.close()
            self.sock = None
        self.eof = True

    def write(self, buffer: bytes):
        if self.sock:
            self.sock.sendall(buffer)

    def read_until(self, match: bytes, timeout=None) -> bytes:
        deadline = time.monotonic() + (timeout or self.timeout or 10)
        buf = b""
        while time.monotonic() < deadline:
            try:
                chunk = self.sock.recv(4096)
                if not chunk:
                    self.eof = True
                    break
                buf += chunk
                if match in buf:
                    break
            except socket.timeout:
                break
        return buf

    def read_all(self) -> bytes:
        buf = b""
        while not self.eof:
            try:
                chunk = self.sock.recv(4096)
                if not chunk:
                    self.eof = True
                    break
                buf += chunk
            except Exception:
                break
        return buf

    def read_eager(self) -> bytes:
        try:
            self.sock.setblocking(False)
            data = self.sock.recv(4096)
            self.sock.setblocking(True)
            return data or b""
        except BlockingIOError:
            return b""
        except Exception:
            return b""

    def interact(self):
        import sys
        while True:
            try:
                data = self.sock.recv(4096)
                if not data:
                    break
                sys.stdout.buffer.write(data)
                sys.stdout.flush()
            except Exception:
                break

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()
