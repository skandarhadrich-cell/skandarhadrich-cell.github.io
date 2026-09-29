#!/usr/bin/env python3
"""0xmrerror.me — local preview server.

The generated site uses root-absolute URLs (/css/tokens.css, /writeups/…),
so it has to be served from the repository root.  Opening index.html with
file:// will show unstyled HTML; that is expected, not a bug.

    python3 tools/serve.py                 # http://localhost:8000
    python3 tools/serve.py --port 8080
    python3 tools/serve.py --watch         # rebuild on data/ or templates/ edits

`--watch` is a polling loop on mtimes, which is enough for a repo this size
and avoids a dependency on watchdog/inotify.
"""

from __future__ import annotations

import argparse
import functools
import http.server
import os
import socketserver
import subprocess
import sys
import threading
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WATCH_DIRS = (os.path.join(ROOT, "data"), os.path.join(ROOT, "templates"))

GREEN, DIM, YEL, OFF = "\033[32m", "\033[2m", "\033[33m", "\033[0m"


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".woff2": "font/woff2",
        ".webmanifest": "application/manifest+json",
        ".mjs": "text/javascript",
    }

    def end_headers(self):
        # Never serve a stale preview after a rebuild.
        self.send_header("Cache-Control", "no-store, must-revalidate")
        super().end_headers()

    def log_message(self, fmt, *args):
        status = str(args[1]) if len(args) > 1 else ""
        colour = GREEN if status.startswith(("2", "3")) else YEL
        sys.stdout.write(f"  {DIM}{self.address_string()}{OFF} {colour}{status}{OFF} "
                         f"{DIM}{args[0] if args else ''}{OFF}\n")


def snapshot() -> dict:
    marks = {}
    for base in WATCH_DIRS:
        for dirpath, _, files in os.walk(base):
            for fn in files:
                p = os.path.join(dirpath, fn)
                try:
                    marks[p] = os.stat(p).st_mtime
                except OSError:
                    pass
    return marks


def watch(stop: threading.Event) -> None:
    print(f"{DIM}watching data/ and templates/ …{OFF}")
    marks = snapshot()
    while not stop.is_set():
        time.sleep(1.0)
        now = snapshot()
        if now != marks:
            changed = [p for p in set(now) | set(marks) if now.get(p) != marks.get(p)]
            for p in changed:
                print(f"{DIM}  changed: {os.path.relpath(p, ROOT)}{OFF}")
            marks = now
            print(f"{DIM}rebuilding …{OFF}")
            r = subprocess.run([sys.executable, os.path.join(ROOT, "tools", "build.py")],
                               capture_output=True, text=True)
            for line in (r.stdout + r.stderr).splitlines():
                print(f"  {DIM}{line}{OFF}")
            print(f"{GREEN}✓{OFF} rebuild complete")


def main() -> int:
    ap = argparse.ArgumentParser(description="Serve 0xmrerror.me locally")
    ap.add_argument("--port", type=int, default=8000)
    ap.add_argument("--bind", default="127.0.0.1")
    ap.add_argument("--watch", action="store_true", help="rebuild when data changes")
    ap.add_argument("--no-build", action="store_true", help="serve without rebuilding first")
    args = ap.parse_args()

    if not args.no_build:
        subprocess.run([sys.executable, os.path.join(ROOT, "tools", "build.py")], check=True)

    stop = threading.Event()
    if args.watch:
        threading.Thread(target=watch, args=(stop,), daemon=True).start()

    handler = functools.partial(Handler, directory=ROOT)
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer((args.bind, args.port), handler) as httpd:
        print(f"\n{GREEN}▸{OFF} http://{args.bind}:{args.port}{OFF}")
        print(f"{DIM}  writeups: http://{args.bind}:{args.port}/writeups/mr-robot/{OFF}")
        print(f"{DIM}  404:      http://{args.bind}:{args.port}/nope{OFF}")
        print(f"{DIM}  ctrl-c to stop{OFF}\n")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            stop.set()
            print(f"\n{DIM}stopped{OFF}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
