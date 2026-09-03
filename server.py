#!/usr/bin/env python3
"""
ocusage-server — 提供 OpenCode Go 套餐额度检测的 Web 页面 + API 转发。
启动后访问 http://127.0.0.1:18081/
"""
import http.server
import json
import os
import urllib.request
import urllib.error
from pathlib import Path

HOST = "127.0.0.1"
PORT = 18083
ENDPOINT = "https://opencode.ai/zen/go/v1/usage"

# Determine the directory where this script lives
_script_dir = Path(os.path.dirname(os.path.abspath(__file__)))
HTML = (_script_dir / "index.html").read_text("utf-8")


_CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
}

class Handler(http.server.BaseHTTPRequestHandler):
    def _send(self, status, body, ctype):
        for k, v in _CORS_HEADERS.items():
            self.send_header(k, v)
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        body_bytes = body.encode("utf-8") if isinstance(body, str) else body
        self.send_header("Content-Length", str(len(body_bytes)))
        self.end_headers()
        self.wfile.write(body_bytes)

    def do_GET(self):
        if self.path == "/":
            self.path = "/index.html"
        if self.path == "/index.html":
            self._send(200, HTML, "text/html; charset=utf-8")
        else:
            self._send(404, "Not Found\n", "text/plain")

    def do_OPTIONS(self):
        """CORS preflight."""
        for k, v in _CORS_HEADERS.items():
            self.send_header(k, v)
        self.send_response(204)
        self.end_headers()

    def do_POST(self):
        if self.path != "/api/check":
            self._send(404, "Not Found\n", "text/plain")
            return

        content_len = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_len)
        try:
            data = json.loads(body)
        except json.JSONDecodeError:
            self._send(400, json.dumps({"error": "invalid json"}), "application/json")
            return

        api_key = (data.get("key") or "").strip()
        if not api_key:
            self._send(400, json.dumps({"error": "missing key"}), "application/json")
            return
        # HTTP headers must be latin-1 encodable; a key containing e.g. Chinese
        # characters would crash the outbound request mid-connection.
        if not api_key.isascii():
            self._send(400, json.dumps({
                "error": "密钥格式不对：检测到中文或全角字符。密钥应类似 sk-… 的纯 ASCII 字符串，请重新复制粘贴。"
            }), "application/json; charset=utf-8")
            return

        try:
            resp_body, status = self._forward(api_key)
            self._send(status, resp_body, "application/json")
        except Exception as e:  # never let the handler die mid-response
            self._send(502, json.dumps({"error": f"forward error: {e}"}), "application/json")

    def _forward(self, api_key):
        """Forward to the real OpenCode usage endpoint."""
        req = urllib.request.Request(
            ENDPOINT,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Accept": "application/json",
                "User-Agent": "ocusage-server/1.0",
            },
            method="GET",
        )
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                body = resp.read().decode("utf-8")
                return body, resp.status
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", errors="replace")
            return body, e.code
        except urllib.error.URLError as e:
            return json.dumps({"error": f"network error: {e.reason}"}), 502

    def _send(self, status, body, ctype):
        self._cors()
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        body_bytes = body.encode("utf-8") if isinstance(body, str) else body
        self.send_header("Content-Length", str(len(body_bytes)))
        self.end_headers()
        self.wfile.write(body_bytes)

    def _cors(self):
        pass

    def log_message(self, fmt, *args):
        print(f"[ocusage] {fmt % args}")


if __name__ == "__main__":
    server = http.server.ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"\033[32m✓ ocusage-server running at http://{HOST}:{PORT}/\033[0m")
    print(f"  API endpoint: {ENDPOINT}")
    print(f"  Press Ctrl+C to stop\n")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")