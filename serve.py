#!/usr/bin/env python3
"""Local dev server — SPA routes for /partnerportal-NAME/ paths."""

import http.server
import os
import re
import socketserver

PORT = 8080
DIR = os.path.dirname(os.path.abspath(__file__))
PARTNER_ROUTE = re.compile(r"partnerportal-[A-Za-z0-9_-]+", re.I)
STATIC_EXT = re.compile(r"\.(css|js|json|png|svg|ttf|woff2?|ico)$", re.I)


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIR, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        self.send_header("Pragma", "no-cache")
        super().end_headers()

    def _rewrite_path(self):
        raw = self.path
        clean = raw.split("?")[0].rstrip("/") or "/"
        query = f"?{raw.split('?', 1)[1]}" if "?" in raw else ""

        if clean in ("/favicon.ico", "/favicon.svg"):
            return f"/assets/favicon.svg{query}"

        # Static assets always served as-is
        if STATIC_EXT.search(clean):
            return raw

        # Partner portal SPA — /partnerportal-comfi, /partnerportal-comfi/submitlead, etc.
        if PARTNER_ROUTE.search(clean):
            return f"/index.html{query}"

        return raw

    def do_GET(self):
        self.path = self._rewrite_path()
        return super().do_GET()

    def do_HEAD(self):
        self.path = self._rewrite_path()
        return super().do_HEAD()


if __name__ == "__main__":
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        print(f"Serving at http://localhost:{PORT}")
        print(f"Partner portal: http://localhost:{PORT}/partnerportal-comfi/")
        print(f"  Submit lead: http://localhost:{PORT}/partnerportal-comfi/submitlead")
        httpd.serve_forever()
