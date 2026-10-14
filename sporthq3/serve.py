# serve.py — the local test server (instead of "python3 -m http.server 8000").
#
# Same mini web server, with one difference: it tells the browser
# "never keep a saved copy", so you always test the latest files.
#
#   cd sporthq3
#   python3 serve.py          -> http://localhost:8000
#
# Stop it with Ctrl + C.

import http.server

PORT = 8000


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    http.server.ThreadingHTTPServer.allow_reuse_address = True
    with http.server.ThreadingHTTPServer(("", PORT), NoCacheHandler) as server:
        print(f"SportHQ3 running on http://localhost:{PORT}  (Ctrl + C to stop)")
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            print("\nStopped.")
