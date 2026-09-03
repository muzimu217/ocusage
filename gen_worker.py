#!/usr/bin/env python3
"""从 index.html 生成自包含的 cloudflare-worker.js（页面 + 转发一体）。
改动 index.html 后运行: python3 gen_worker.py"""
from pathlib import Path

here = Path(__file__).parent
html = (here / "index.html").read_text("utf-8")
# 转义模板字面量语法，保持运行时语义不变
html = html.replace("\\", "\\\\").replace("`", "\\`").replace("${", "\\${")

worker = """// 由 gen_worker.py 生成，勿手改；改 index.html 后重新生成。
// Cloudflare Worker：托管查询页面 + 同源转发 /api/check（免 CORS 问题）。
// 部署后 https://<your-worker>.workers.dev 即是完整的共享查询页面。
const HTML = `%s`;

const ENDPOINT = 'https://opencode.ai/zen/go/v1/usage';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    if (url.pathname === '/api/check') {
      if (request.method !== 'POST') return json({ error: 'POST only' }, 405);
      let key = '';
      try { key = ((await request.json()).key || '').toString(); } catch (e) {}
      key = key.trim();
      if (!key) return json({ error: 'missing key' }, 400);
      // HTTP 头仅接受 ASCII；含中文/全角的输入直接拒绝并提示
      if (!/^[\x21-\x7e]+$/.test(key)) {
        return json({ error: '密钥格式不对：检测到中文或全角字符。密钥应类似 sk-… 的纯 ASCII 字符串，请重新复制粘贴。' }, 400);
      }
      const upstream = await fetch(ENDPOINT, {
        headers: { 'Authorization': 'Bearer ' + key, 'Accept': 'application/json' },
      });
      return new Response(upstream.body, {
        status: upstream.status,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    return new Response(HTML, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  },
};
""" % html

(here / "cloudflare-worker.js").write_text(worker, "utf-8")
print(f"cloudflare-worker.js generated ({len(worker)} bytes)")
