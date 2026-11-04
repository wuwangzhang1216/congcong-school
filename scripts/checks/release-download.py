"""Real HTTP regressions for interrupted/stalled release downloads (issue #65)."""
import contextlib
import hashlib
import importlib.util
import io
import socket
import tempfile
import threading
import time
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('installer', ROOT / 'scripts/install-release.py')
installer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer)
PAYLOAD = b'fixture release resource\n' * 8192
EXPECTED = {'bytes': len(PAYLOAD), 'sha256': hashlib.sha256(PAYLOAD).hexdigest()}


class DownloadTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.path = Path(self.temporary.name) / 'files.jsonl'
        self.requests = []
        self.mode = 'interrupt'
        owner = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def do_GET(self):
                owner.requests.append(self.headers.get('Range'))
                attempt = len(owner.requests)
                if owner.mode == 'missing' or (owner.mode == 'unavailable' and attempt == 1):
                    self.send_error(404 if owner.mode == 'missing' else 503)
                    return
                if owner.mode == 'range-rejected' and attempt == 1:
                    self.send_error(416)
                    return
                if owner.mode == 'stall':
                    self.send_response(200)
                    self.send_header('Content-Length', str(len(PAYLOAD)))
                    self.end_headers()
                    time.sleep(0.3)
                    return
                start = int(self.headers['Range'].removeprefix('bytes=').removesuffix('-')) if self.headers.get('Range') else 0
                if owner.mode == 'ignore-range':
                    start = 0
                self.send_response(206 if start else 200)
                if start:
                    offset = start + 1 if owner.mode == 'bad-range' and attempt == 1 else start
                    self.send_header('Content-Range', f'bytes {offset}-{len(PAYLOAD)-1}/{len(PAYLOAD)}')
                if owner.mode != 'no-length':
                    self.send_header('Content-Length', str(len(PAYLOAD) - start))
                self.end_headers()
                payload = PAYLOAD[start:]
                if (owner.mode == 'interrupt' and attempt == 1) or owner.mode == 'always-interrupt':
                    payload = payload[:1024]
                if owner.mode == 'corrupt' and attempt == 1:
                    payload = b'x' * len(payload)
                self.wfile.write(payload)
                self.wfile.flush()
                self.connection.shutdown(socket.SHUT_WR)

        self.server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        self.server.daemon_threads = True
        self.thread = threading.Thread(target=self.server.serve_forever, kwargs={'poll_interval': 0.01})
        self.thread.start()
        self.addCleanup(self.stop_server)
        self.url = f'http://127.0.0.1:{self.server.server_port}/files.jsonl'

    def stop_server(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()

    def download(self, **kwargs):
        options = dict(expected=EXPECTED, timeout=0.1, attempts=3, retry_delay=0, progress_interval=0)
        options.update(kwargs)
        log = io.StringIO()
        with contextlib.redirect_stdout(log):
            installer.download_file(self.url, self.path, **options)
        self.assertEqual(self.path.read_bytes(), PAYLOAD)
        self.assertFalse(self.path.with_name('files.jsonl.part').exists())
        return log.getvalue()

    def test_interrupted_download_resumes_and_reports_progress(self):
        log = self.download()
        self.assertEqual(self.requests, [None, 'bytes=1024-'])
        self.assertIn('Retry', log)
        self.assertIn('100.0%', log)

    def test_server_ignoring_range_restarts_safely(self):
        self.mode = 'ignore-range'
        self.path.with_name('files.jsonl.part').write_bytes(PAYLOAD[:1024])
        self.download()
        self.assertEqual(self.requests, ['bytes=1024-'])

    def test_wrong_range_is_discarded(self):
        self.mode = 'bad-range'
        self.path.with_name('files.jsonl.part').write_bytes(PAYLOAD[:1024])
        self.download()
        self.assertEqual(self.requests, ['bytes=1024-', None])

    def test_checksum_failure_restarts_from_zero(self):
        self.mode = 'corrupt'
        self.download()
        self.assertEqual(self.requests, [None, None])

    def test_corrupt_partial_is_detected_after_resume(self):
        self.mode = 'normal'
        self.path.with_name('files.jsonl.part').write_bytes(b'x' * 1024)
        self.download()
        self.assertEqual(self.requests, ['bytes=1024-', None])

    def test_rejected_range_restarts_from_zero(self):
        self.mode = 'range-rejected'
        self.path.with_name('files.jsonl.part').write_bytes(PAYLOAD[:1024])
        self.download()
        self.assertEqual(self.requests, ['bytes=1024-', None])

    def test_complete_partial_is_verified_before_publishing(self):
        self.path.with_name('files.jsonl.part').write_bytes(PAYLOAD)
        self.download()
        self.assertEqual(self.requests, [])

    def test_oversized_partial_is_discarded(self):
        self.mode = 'normal'
        self.path.with_name('files.jsonl.part').write_bytes(PAYLOAD + b'extra')
        self.download()
        self.assertEqual(self.requests, [None])

    def test_verified_cache_avoids_network(self):
        self.path.write_bytes(PAYLOAD)
        self.download()
        self.assertEqual(self.requests, [])

    def test_corrupt_cache_is_replaced(self):
        self.mode = 'normal'
        self.path.write_bytes(b'x' * len(PAYLOAD))
        self.download()
        self.assertEqual(self.requests, [None])

    def test_full_download_bypasses_verified_and_partial_cache(self):
        self.mode = 'normal'
        self.path.write_bytes(PAYLOAD)
        self.path.with_name('files.jsonl.part').write_bytes(PAYLOAD[:1024])
        self.download(reuse=False)
        self.assertEqual(self.requests, [None])

    def test_metadata_without_fingerprint_is_refreshed(self):
        self.mode = 'normal'
        self.path.write_bytes(b'old manifest')
        self.path.with_name('files.jsonl.part').write_bytes(b'stale partial')
        self.download(expected=None)
        self.assertEqual(self.requests, [None])

    def test_no_content_length_still_verifies_manifest_fingerprint(self):
        self.mode = 'no-length'
        self.download()

    def test_unfingerprinted_interruption_restarts_from_zero(self):
        self.download(expected=None)
        self.assertEqual(self.requests, [None, None])

    def test_transient_http_error_retries(self):
        self.mode = 'unavailable'
        self.download()
        self.assertEqual(self.requests, [None, None])

    def test_missing_release_fails_without_retry(self):
        self.mode = 'missing'
        with self.assertRaisesRegex(RuntimeError, 'files.jsonl'):
            self.download()
        self.assertEqual(self.requests, [None])

    def test_stalled_connection_has_bounded_attempts(self):
        self.mode = 'stall'
        start = time.monotonic()
        with self.assertRaisesRegex(RuntimeError, 'after 2 attempts'):
            self.download(attempts=2)
        self.assertLess(time.monotonic() - start, 2)
        self.assertEqual(len(self.requests), 2)
        self.assertFalse(self.path.exists())

    def test_failed_download_keeps_partial_for_next_invocation(self):
        self.mode = 'always-interrupt'
        with self.assertRaisesRegex(RuntimeError, 'after 2 attempts'):
            self.download(attempts=2)
        self.assertFalse(self.path.exists())
        partial_size = self.path.with_name('files.jsonl.part').stat().st_size
        self.assertEqual(partial_size, 2048)
        self.mode = 'normal'
        self.download()
        self.assertEqual(self.requests[-1], 'bytes=2048-')


if __name__ == '__main__':
    unittest.main()
