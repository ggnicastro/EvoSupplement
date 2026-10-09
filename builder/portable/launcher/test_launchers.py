"""Runtime regression checks for the native Linux and Perl portable servers.

Run with Python 3 only during development, never on a recipient's computer:
    python3 builder/portable/launcher/test_launchers.py
"""
import concurrent.futures
import contextlib
import hashlib
import os
from pathlib import Path
import re
import selectors
import socket
import subprocess
import tempfile
import unittest

HERE = Path(__file__).resolve().parent
BINARY = HERE.parent / "bin/linux-amd64/evosupplement"


class RuntimeChecks(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix="runtime-check-", dir=HERE)
        cls.base = Path(cls.temp.name)
        cls.root = cls.base / "suplemento com espacos ç"
        cls.root.mkdir()
        (cls.root / "index.html").write_text("<html>SUPLEMENTO</html>")
        (cls.root / "app.js").write_text("const answer = 42;\n")
        (cls.root / "a b.tsv").write_bytes(b"name\tvalue\nalpha\t42\n")
        (cls.root / "dados-ç.txt").write_text("olá", encoding="utf-8")
        (cls.root / "empty.txt").write_bytes(b"")
        (cls.root / "files").mkdir()
        (cls.root / "files/analysis.py").write_bytes(b"print('supplementary source')\n")
        cls.payload = bytes(range(256)) * 8192
        (cls.root / "large.bin").write_bytes(cls.payload)
        (cls.root / "nested").mkdir()
        (cls.root / "nested/index.html").write_text("NESTED")
        (cls.root / "listing").mkdir()
        (cls.root / "listing/data.txt").write_text("NO DIRECTORY LISTING")
        (cls.root / ".hidden").write_text("SECRET")
        (cls.root / "_portable").mkdir()
        (cls.root / "_portable/launcher.cs").write_text("CONTROL FILE")
        (cls.root / "Abrir-suplemento.cmd").write_text("CONTROL FILE")
        (cls.base / "outside.txt").write_text("OUTSIDE SECRET")
        (cls.root / "outside-link.txt").symlink_to(cls.base / "outside.txt")
        (cls.root / "directory-link").symlink_to(cls.base, target_is_directory=True)

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    @contextlib.contextmanager
    def server(self, runtime):
        command = [str(BINARY), "--no-browser", "--root", str(self.root)] if runtime == "native" else ["perl", str(HERE / "server.pl"), str(self.root)]
        process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                   env={**os.environ, "EVOSUPPLEMENT_NO_BROWSER": "1"})
        try:
            selector = selectors.DefaultSelector()
            selector.register(process.stdout, selectors.EVENT_READ)
            chunks = b""
            for _ in range(30):
                if selector.select(0.2):
                    chunks += os.read(process.stdout.fileno(), 4096)
                    match = re.search(rb"http://127\.0\.0\.1:(\d+)", chunks)
                    if match:
                        self.port = int(match.group(1))
                        break
            else:
                self.fail("Server did not start: " + chunks.decode(errors="replace"))
            selector.close()
            yield
        finally:
            process.terminate()
            try:
                process.wait(timeout=4)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
                self.fail("Server ignored SIGTERM")
            self.assertEqual(process.returncode, 0)
            process.stdout.close()
            err = process.stderr.read().decode(errors="replace")
            process.stderr.close()
            self.assertEqual(err, "")
            with self.assertRaises(OSError):
                socket.create_connection(("127.0.0.1", self.port), timeout=0.3)

    def request(self, target="/", method="GET", headers=None, raw_headers=None):
        lines = [f"{method} {target} HTTP/1.1", f"Host: 127.0.0.1:{self.port}"]
        if headers:
            lines += [f"{k}: {v}" for k, v in headers.items()]
        if raw_headers is not None:
            lines = [lines[0]] + raw_headers
        data = ("\r\n".join(lines) + "\r\n\r\n").encode("ascii")
        with socket.create_connection(("127.0.0.1", self.port), timeout=3) as conn:
            conn.sendall(data)
            received = b""
            while True:
                chunk = conn.recv(65536)
                if not chunk:
                    break
                received += chunk
        head, body = received.split(b"\r\n\r\n", 1)
        rows = head.decode("ascii").split("\r\n")
        response_headers = dict(row.split(": ", 1) for row in rows[1:])
        return int(rows[0].split()[1]), response_headers, body

    def check_runtime(self, runtime):
        with self.server(runtime):
            with self.subTest("html"):
                code, hdr, body = self.request()
                self.assertEqual(code, 200)
                self.assertIn("text/html", hdr["Content-Type"])
                self.assertIn(b"SUPLEMENTO", body)
            with self.subTest("javascript mime"):
                self.assertIn("javascript", self.request("/app.js")[1]["Content-Type"])
            with self.subTest("supplementary scientific source is downloadable"):
                self.assertEqual(self.request("/files/analysis.py")[2], b"print('supplementary source')\n")
            with self.subTest("head and empty files"):
                code, hdr, body = self.request("/large.bin", method="HEAD")
                self.assertEqual((code, len(body)), (200, 0))
                self.assertEqual(int(hdr["Content-Length"]), len(self.payload))
                self.assertEqual(self.request("/empty.txt")[2], b"")
            with self.subTest("encoded names and query"):
                self.assertEqual(self.request("/a%20b.tsv?download=1")[0], 200)
                self.assertEqual(self.request("/dados-%C3%A7.txt")[2], "olá".encode())
            with self.subTest("large streaming"):
                self.assertEqual(hashlib.sha256(self.request("/large.bin")[2]).digest(), hashlib.sha256(self.payload).digest())
            with self.subTest("ranges"):
                code, hdr, body = self.request("/large.bin", headers={"Range": "bytes=10-19"})
                self.assertEqual((code, body), (206, self.payload[10:20]))
                self.assertEqual(hdr["Content-Range"], f"bytes 10-19/{len(self.payload)}")
                self.assertEqual(self.request("/large.bin", headers={"Range": "bytes=-7"})[2], self.payload[-7:])
                self.assertEqual(self.request("/large.bin", headers={"Range": f"bytes={len(self.payload)-8}-"})[2], self.payload[-8:])
                self.assertEqual(self.request("/large.bin", headers={"Range": "bytes=999999999-"})[0], 416)
            with self.subTest("directory redirect and no listing"):
                code, hdr, body = self.request("/nested")
                self.assertEqual(code, 301)
                self.assertEqual(hdr["Location"], f"http://127.0.0.1:{self.port}/nested/")
                self.assertEqual(self.request("/nested/")[2], b"NESTED")
                self.assertEqual(self.request("/listing/")[0], 404)
            with self.subTest("read only"):
                self.assertEqual(self.request(method="POST")[0], 405)
            for target in ["/.hidden", "/_portable/launcher.cs", "/Abrir-suplemento.cmd", "/../outside.txt", "/%2e%2e/outside.txt", "/outside-link.txt", "/directory-link/outside.txt"]:
                with self.subTest("confined path", target=target):
                    self.assertIn(self.request(target)[0], (400, 404))
            for target in ["/%00", "/%GG", "/..%5coutside.txt", "/C:%5cWindows", "/%"]:
                with self.subTest("invalid path", target=target):
                    self.assertIn(self.request(target)[0], (400, 404))
            with self.subTest("host and origin isolation"):
                self.assertEqual(self.request(raw_headers=["Host: evil.example"])[0], 403)
                self.assertEqual(self.request(headers={"Origin": "https://evil.example"})[0], 403)
                self.assertEqual(self.request(headers={"Sec-Fetch-Site": "cross-site"})[0], 403)
                self.assertEqual(self.request(headers={"Origin": f"http://127.0.0.1:{self.port}"})[0], 200)
            with self.subTest("concurrent requests with preconnected idle socket"):
                with socket.create_connection(("127.0.0.1", self.port), timeout=3):
                    with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
                        statuses = list(pool.map(lambda _: self.request("/app.js")[0], range(120)))
                    self.assertEqual(statuses, [200] * 120)

    def test_native(self):
        self.check_runtime("native")

    def test_perl(self):
        self.check_runtime("perl")


if __name__ == "__main__":
    unittest.main(verbosity=2)
