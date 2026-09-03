#!/usr/bin/env python3
"""Mock of the OpenCode Go usage endpoint for offline testing of ocusage.

Serves different response shapes per path:
  /shape-community  — {usage:{rolling:{percent,resetsAt}}}   (cc-switch observed)
  /shape-issue      — {rolling5h:{usageDollars,limitDollars,usagePercent,resetInSec}}
  /shape-bare       — windows at top level, snake_case fields
  /shape-exhausted  — 100% everywhere (exit code 2 path)
  /shape-garbage    — HTML body (bad JSON path)
  /no-auth          — always 401 (rejected key path)
"""
import json
import sys
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer

NOW = datetime.now(timezone.utc)


def iso(dt):
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


SHAPES = {
    "/shape-community": {
        "plan": "Go",
        "usage": {
            "rolling": {"status": "ok", "percent": 19.5,
                        "resetsAt": iso(NOW + timedelta(hours=1, minutes=21))},
            "weekly": {"status": "ok", "percent": 29.7,
                       "resetsAt": iso(NOW + timedelta(days=1, hours=11))},
            "monthly": {"status": "ok", "percent": 25.0,
                        "resetsAt": iso(NOW + timedelta(days=26, hours=6))},
        },
    },
    "/shape-issue": {
        "rolling5h": {"usageDollars": 2.34, "limitDollars": 12,
                      "usagePercent": 19.5, "resetInSec": 7200},
        "weekly": {"usageDollars": 8.91, "limitDollars": 30,
                   "usagePercent": 29.7, "resetInSec": 345600},
        "monthly": {"usageDollars": 15.00, "limitDollars": 60,
                    "usagePercent": 25.0, "resetInSec": 1414800},
        "subscribedAt": iso(NOW - timedelta(days=100)),
    },
    "/shape-bare": {
        "rolling": {"status": "ok", "percent": 1,
                    "reset_in_sec": 4907},
        "weekly": {"status": "ok", "percent": 1, "resets_in_sec": 126983},
        "monthly": {"status": "ok", "percent": 0, "resets_in_sec": 2268694},
        "plan": "Go",
    },
    "/shape-exhausted": {
        "usage": {
            "rolling": {"status": "blocked", "percent": 100,
                        "resetsAt": iso(NOW + timedelta(minutes=42))},
            "weekly": {"status": "ok", "percent": 93.4,
                       "resetsAt": iso(NOW + timedelta(days=3))},
            "monthly": {"status": "ok", "percent": 61.2,
                        "resetsAt": iso(NOW + timedelta(days=12))},
        },
    },
}


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/no-auth" or not self.headers.get("Authorization"):
            self._send(401, {"error": "unauthorized"})
            return
        if self.path == "/shape-garbage":
            body = b"<html>login page</html>"
            self.send_response(200)
            self.send_header("Content-Type", "text/html")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        shape = SHAPES.get(self.path)
        if shape is None:
            self._send(404, {"error": "not found"})
            return
        self._send(200, shape)

    def _send(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 18080
    print(f"mock listening on 127.0.0.1:{port}", flush=True)
    HTTPServer(("127.0.0.1", port), Handler).serve_forever()
