#!/usr/bin/env python3
"""Dev server with SPA fallback for /partnerportal-* tab routes only."""

import http.server
import os
import re

PARTNER_TAB_PATH = re.compile(
    r"^/partnerportal-[A-Za-z0-9_-]+(?:/(?:overview|submitlead|leads|commissions)?)?/?$"
)


class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        path = self.path.split("?", 1)[0]
        local = path.lstrip("/")
        if PARTNER_TAB_PATH.match(path) and not (local and os.path.isfile(local)):
            self.path = "/index.html"
        return super().do_GET()


if __name__ == "__main__":
    import sys

    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    with http.server.ThreadingHTTPServer(("", port), Handler) as httpd:
        print(f"Serving at http://localhost:{port}/login.html")
        httpd.serve_forever()
