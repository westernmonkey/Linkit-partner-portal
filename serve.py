#!/usr/bin/env python3
"""Local dev server — always 200 (no 304) and serves favicon."""

import http.server
import os
import socketserver

PORT = 8080
DIR = os.path.dirname(os.path.abspath(__file__))


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIR, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        self.send_header("Pragma", "no-cache")
        super().end_headers()

    def _map_path(self):
        if self.path.split("?")[0] in ("/favicon.ico", "/favicon.svg"):
            self.path = "/assets/favicon.svg"

    def do_GET(self):
        self._map_path()
        return super().do_GET()

    def do_HEAD(self):
        self._map_path()
        return super().do_HEAD()

    def log_message(self, fmt, *args):
        status = args[1] if len(args) > 1 else ""
        if str(status) in ("404", "304"):
            return
        super().log_message(fmt, *args)


if __name__ == "__main__":
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        print(f"Serving at http://localhost:{PORT}")
        httpd.serve_forever()
