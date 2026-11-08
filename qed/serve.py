# serve.py — the local test server for QED HQ (same as sporthq3/serve.py).
#
# Same mini web server, with two differences:
# - it tells the browser "never keep a saved copy", so you always test the
#   latest files;
# - it also shows the hq home page (../hq-home/) at /_hq/, so the shared hq
#   login works on your computer: http://localhost:8001/_hq/ is the login page.
#
#   cd qed
#   python3 serve.py          -> http://localhost:8001
#
# Stop it with Ctrl + C.

import http.server
import os

HQ_HOME = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "hq-home")

PORT = 8001


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        # /_hq/... -> a file in hq-home/ (the login page and auth.js)
        if path == "/_hq" or path.startswith("/_hq/") or path.startswith("/_hq?"):
            rest = path[len("/_hq"):].split("?", 1)[0].split("#", 1)[0].lstrip("/")
            target = os.path.normpath(os.path.join(HQ_HOME, rest))
            if target.startswith(os.path.normpath(HQ_HOME)):
                return target
        return super().translate_path(path)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    http.server.ThreadingHTTPServer.allow_reuse_address = True
    with http.server.ThreadingHTTPServer(("", PORT), NoCacheHandler) as server:
        print(f"QED HQ running on http://localhost:{PORT}  (Ctrl + C to stop)")
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            print("\nStopped.")
