// 由 gen_worker.py 生成，勿手改；改 index.html 后重新生成。
// Cloudflare Worker：托管查询页面 + 同源转发 /api/check（免 CORS 问题）。
// 部署后 https://<your-worker>.workers.dev 即是完整的共享查询页面。
const HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>OpenCode Go 套餐额度监测</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #0d1117; color: #c9d1d9;
    display: flex; justify-content: center; align-items: center;
    min-height: 100vh; margin: 0; padding: 20px;
  }
  .card {
    background: #161b22; border-radius: 12px;
    padding: 32px; max-width: 580px; width: 100%;
    box-shadow: 0 8px 32px rgba(0,0,0,0.4);
  }
  h1 {
    font-size: 20px; font-weight: 600; margin-bottom: 6px;
    color: #f0f6fc;
  }
  .subtitle { font-size: 13px; color: #8b949e; margin-bottom: 20px; }
  .input-row {
    display: flex; gap: 8px; margin-bottom: 20px;
  }
  .input-row input {
    flex: 1; padding: 10px 14px; border-radius: 8px;
    border: 1px solid #30363d; background: #0d1117;
    color: #c9d1d9; font-size: 14px; outline: none; font-family: monospace;
  }
  .input-row input:focus { border-color: #58a6ff; }
  .input-row input::placeholder { color: #484f58; }
  .input-row button {
    padding: 10px 20px; border-radius: 8px; border: none;
    background: #238636; color: #fff; font-size: 14px; font-weight: 600;
    cursor: pointer; white-space: nowrap; transition: background .15s;
  }
  .input-row button:hover { background: #2ea043; }
  .input-row button:disabled { background: #23863655; cursor: not-allowed; }
  .error-msg {
    background: #3d1519; border: 1px solid #da3633; border-radius: 8px;
    padding: 10px 14px; font-size: 13px; color: #f85149;
    margin-bottom: 16px; display: none;
  }
  .error-msg.show { display: block; }

  .usage-card { margin-top: 8px; }
  .window { margin-bottom: 18px; }
  .window:last-child { margin-bottom: 0; }
  .window-header {
    display: flex; justify-content: space-between; align-items: baseline;
    margin-bottom: 6px;
  }
  .window-label { font-size: 14px; font-weight: 600; }
  .window-pct { font-size: 18px; font-weight: 700; font-variant-numeric: tabular-nums; }
  .bar-bg {
    height: 10px; border-radius: 6px; background: #21262d;
    overflow: hidden; margin-bottom: 4px;
  }
  .bar-fill {
    height: 100%; border-radius: 6px; transition: width .4s ease;
  }
  .window-detail {
    display: flex; justify-content: space-between;
    font-size: 12px; color: #8b949e;
  }
  .window-detail .left { color: #58a6ff; font-weight: 600; }
  .window-detail .derived { color: #8b949e; font-style: italic; }

  .plan-badge {
    display: inline-block; padding: 2px 10px; border-radius: 12px;
    background: #1f6feb22; border: 1px solid #1f6feb55;
    font-size: 12px; color: #58a6ff;
  }
  .timestamps { margin-top: 12px; font-size: 11px; color: #484f58; }

  .skeleton { opacity: .5; pointer-events: none; }
  .skeleton .bar-bg { background: #21262d linear-gradient(90deg,#21262d 25%,#30363d 50%,#21262d 75%) no-repeat; background-size: 200% 100%; animation: shimmer 1.4s infinite; }
  @keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
</style>
</head>
<body>
<div class="card" id="app">
  <h1>OpenCode Go 额度监测</h1>
  <p class="subtitle">填入 API 密钥，查看 5 小时滚动 / 周 / 月限额剩余</p>

  <div class="input-row">
    <input id="keyInput" type="password" placeholder="sk-… (从 opencode.ai/auth 获取)" />
    <button id="checkBtn">检测</button>
  </div>
  <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:#8b949e;margin:-12px 0 16px;cursor:pointer;user-select:none">
    <input id="rememberKey" type="checkbox" style="accent-color:#238636"> 记住密钥（仅存本机浏览器，下次打开自动查询）
  </label>

  <div id="error" class="error-msg"></div>

  <div id="usageArea" class="usage-card" style="display:none">
    <div style="margin-bottom:12px;display:flex;gap:8px;align-items:center">
      <span id="planTag" class="plan-badge"></span>
      <span id="checkTime" style="font-size:12px;color:#8b949e"></span>
    </div>

    <div class="window" id="w-rolling5h">
      <div class="window-header">
        <span class="window-label">5 小时滚动</span>
        <span class="window-pct" id="pct-rolling5h">0%</span>
      </div>
      <div class="bar-bg"><div class="bar-fill" id="bar-rolling5h" style="width:0%"></div></div>
      <div class="window-detail">
        <span id="detail-rolling5h">已用 $0.00 / $12.00</span>
        <span class="left" id="left-rolling5h">剩余 $12.00</span>
      </div>
      <div class="window-detail" style="margin-top:2px">
        <span id="reset-rolling5h"></span>
        <span class="derived" id="derived-rolling5h"></span>
      </div>
    </div>

    <div class="window" id="w-weekly">
      <div class="window-header">
        <span class="window-label">周限额</span>
        <span class="window-pct" id="pct-weekly">0%</span>
      </div>
      <div class="bar-bg"><div class="bar-fill" id="bar-weekly" style="width:0%"></div></div>
      <div class="window-detail">
        <span id="detail-weekly">已用 $0.00 / $30.00</span>
        <span class="left" id="left-weekly">剩余 $30.00</span>
      </div>
      <div class="window-detail" style="margin-top:2px">
        <span id="reset-weekly"></span>
        <span class="derived" id="derived-weekly"></span>
      </div>
    </div>

    <div class="window" id="w-monthly">
      <div class="window-header">
        <span class="window-label">月限额</span>
        <span class="window-pct" id="pct-monthly">0%</span>
      </div>
      <div class="bar-bg"><div class="bar-fill" id="bar-monthly" style="width:0%"></div></div>
      <div class="window-detail">
        <span id="detail-monthly">已用 $0.00 / $60.00</span>
        <span class="left" id="left-monthly">剩余 $60.00</span>
      </div>
      <div class="window-detail" style="margin-top:2px">
        <span id="reset-monthly"></span>
        <span class="derived" id="derived-monthly"></span>
      </div>
    </div>

    <div class="timestamps" id="timestamps">
      <span id="planLabel"></span>
      <span id="fetchedAt"></span>
    </div>
  </div>

  <div id="loading" class="usage-card" style="display:none">
    <div class="window skeleton">
      <div class="window-header"><span class="window-label">5 小时滚动</span></div>
      <div class="bar-bg"><div class="bar-fill" style="width:0%"></div></div>
    </div>
    <div class="window skeleton">
      <div class="window-header"><span class="window-label">周限额</span></div>
      <div class="bar-bg"><div class="bar-fill" style="width:0%"></div></div>
    </div>
    <div class="window skeleton">
      <div class="window-header"><span class="window-label">月限额</span></div>
      <div class="bar-bg"><div class="bar-fill" style="width:0%"></div></div>
    </div>
  </div>

  <div style="margin-top:20px;padding-top:16px;border-top:1px solid #21262d;text-align:center">
    <a href="https://deploy.workers.cloudflare.com/?url=https%3A%2F%2Fraw.githubusercontent.com%2Fmuzimu217%2Focusage%2Fmain%2Fcloudflare-worker.js"
       target="_blank" rel="noopener"
       style="display:inline-block;padding:8px 20px;border-radius:8px;background:#f6821f;color:#fff;text-decoration:none;font-weight:600">Deploy to Cloudflare Workers</a>
  </div>
</div>

<script>
const DIRECT_ENDPOINT = 'https://opencode.ai/zen/go/v1/usage';
const PROXY_PATH = '/api/check';
// 公共转发端点（部署自己的 Worker 后把地址填到这里并提交，访客即零配置）。
const DEFAULT_PROXY = 'https://ocusage.kcos.club';
const LIMITS = { rolling5h: 12, weekly: 30, monthly: 60 };

const keyInput = document.getElementById('keyInput');
const checkBtn = document.getElementById('checkBtn');
const errorEl = document.getElementById('error');
const usageArea = document.getElementById('usageArea');
const loadingEl = document.getElementById('loading');
const planTag = document.getElementById('planTag');
const checkTime = document.getElementById('checkTime');
const fetchedAt = document.getElementById('fetchedAt');
const planLabel = document.getElementById('planLabel');

const windows = ['rolling5h','weekly','monthly'];
const wLabels = { rolling5h:'5h 滚动', weekly:'周限额', monthly:'月限额' };

function $(id) { return document.getElementById(id); }

function pctColor(p) {
  if (p >= 90) return '#da3633';
  if (p >= 75) return '#d29922';
  if (p >= 50) return '#d29922';
  return '#3fb950';
}

function formatDuration(seconds) {
  if (seconds == null) return '';
  seconds = Math.max(0, Math.floor(seconds));
  const d = Math.floor(seconds / 86400); seconds %= 86400;
  const h = Math.floor(seconds / 3600); seconds %= 3600;
  const m = Math.floor(seconds / 60); // 分钟取整，不显示小数
  if (d > 0) return \`\${d}天 \${h}小时\`;
  if (h > 0) return \`\${h}小时 \${m}分钟\`;
  return \`\${m}分钟\`;
}

function showError(msg) {
  errorEl.textContent = msg;
  errorEl.classList.add('show');
  usageArea.style.display = 'none';
  loadingEl.style.display = 'none';
}

function clearError() { errorEl.classList.remove('show'); errorEl.textContent = ''; }

// Normalize a window from any known response shape.
function normalize(raw) {
  // raw might be the window object directly, or the outer wrapper
  const w = raw.window || raw.w || raw;
  // Try percent fields
  let pct = w.percent ?? w.usagePercent ?? w.usedPercent ?? null;
  let used = w.usageDollars ?? w.usedDollars ?? null;
  let limit = w.limitDollars ?? null;
  let resetsAt = w.resetsAt ?? w.resetAt ?? null;
  let resetSec = null;
  // Try all reset_in_sec variants
  for (const k of ['resetsInSeconds','resetsInSec','resetInSec','reset_in_sec','resets_in_sec']) {
    if (w[k] != null) { resetSec = w[k]; break; }
  }
  // Status
  const status = w.status ?? 'ok';

  // If we have percent but no dollars, derive from plan limits
  const limitVal = limit ?? LIMITS[raw._windowKey];
  if (pct != null && used == null && limitVal) {
    used = limitVal * pct / 100;
    limit = limitVal;
  }
  // If we have dollars but no percent, compute
  if (used != null && limit != null && pct == null) {
    pct = limit > 0 ? used / limit * 100 : 0;
  }
  if (pct == null && used != null && limit == null) {
    pct = 0;
  }
  pct = pct ?? 0;
  used = used ?? 0;
  limit = limit ?? LIMITS[raw._windowKey] ?? 0;
  const derived = (w.usageDollars == null && w.usedDollars == null);

  // Calculate reset string
  let resetStr = '';
  if (resetsAt) {
    try { const d = new Date(resetsAt); resetStr = formatDuration((d.getTime()-Date.now())/1000); resetStr += '（'+d.toLocaleTimeString('zh-CN',{hour12:false})+'）'; } catch(e) {}
  } else if (resetSec != null) {
    resetStr = formatDuration(resetSec);
  } else {
    resetStr = '未知';
  }

  return { pct, used, limit, left: limit - used, status, resetStr, derived };
}

function updateWindow(name, w) {
  const $win = $(\`w-\${name}\`);
  const $pct = $(\`pct-\${name}\`);
  const $bar = $(\`bar-\${name}\`);
  const $detail = $(\`detail-\${name}\`);
  const $left = $(\`left-\${name}\`);
  const $reset = $(\`reset-\${name}\`);
  const $derived = $(\`derived-\${name}\`);
  if (!$win || !$pct || !$bar || !$detail || !$left || !$reset || !$derived) {
    console.warn('ocusage: missing DOM node for window', name);
    return;
  }
  const n = normalize(w);
  const used = Math.min(Math.max(n.pct, 0), 100);
  const leftPct = 100 - used; // 条与百分比均表示剩余：用得越多条越短

  $pct.textContent = '剩余 ' + leftPct.toFixed(1) + '%';
  $pct.style.color = pctColor(used); // 颜色仍按消耗程度告警
  $bar.style.width = leftPct + '%';
  $bar.style.background = pctColor(used);
  $detail.textContent = \`已用 $\${n.used.toFixed(2)} / $\${n.limit.toFixed(2)}\`;
  $left.textContent = \`剩余 $\${n.left.toFixed(2)}\`;
  $left.style.color = used >= 90 ? '#da3633' : used >= 75 ? '#d29922' : '#58a6ff';

  $reset.textContent = '重置于 ' + n.resetStr;
  $derived.textContent = n.derived ? '（美元由百分比反推）' : '';
}

// 调用链：内置公共转发(DEFAULT_PROXY，维护者在代码里配置) > 同源后端(/api/check) > 浏览器直连
async function callAPI(key) {
  const candidates = [];
  if (DEFAULT_PROXY) candidates.push(DEFAULT_PROXY.replace(/\\/+$/, '') + PROXY_PATH);
  candidates.push(PROXY_PATH); // 同源 server.py 或 Worker 托管时存在

  for (const url of candidates) {
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key }),
      });
      // 静态托管（GitHub Pages）通常会对 POST /api/check 回 404 或 405；
      // 两者都表示这里没有转发后端，继续下一候选而不是把错误 HTML 显示给用户。
      if (r.status !== 404 && r.status !== 405) return r;
    } catch (e) { /* 网络层失败（如 file:// 下相对路径），继续 */ }
  }

  // 直连：opencode.ai 目前不返回 CORS 头，浏览器一般会拦截；
  // 在本页面由 Worker/server.py 同源托管时不会走到这里。
  return fetch(DIRECT_ENDPOINT, {
    headers: { 'Authorization': 'Bearer ' + key, 'Accept': 'application/json' },
  });
}

async function checkUsage() {
  clearError();
  const key = keyInput.value.trim();
  if (!key) { showError('请先填入 API 密钥。'); return; }

  loadingEl.style.display = 'block';
  usageArea.style.display = 'none';
  checkBtn.disabled = true;

  try {
    const resp = await callAPI(key);
    if (!resp.ok) {
      const body = await resp.text().catch(()=>'');
      const hintMap = { 401:'密钥被拒——请确认该密钥有 Go 套餐订阅（在 opencode.ai/auth 获取）。', 403:'密钥被拒。', 404:'接口不存在——端点可能已变更。', 429:'请求过频，请稍后重试。' };
      const hint = hintMap[resp.status] || \`HTTP \${resp.status}\`;
      showError(\`\${hint}\${body ? '（'+body.slice(0,200)+'）' : ''}\`);
      return;
    }

    let json;
    const contentType = resp.headers.get('content-type') || '';
    if (contentType.includes('json')) {
      json = await resp.json();
    } else {
      const text = await resp.text();
      // try parse anyway
      try { json = JSON.parse(text); } catch(e) {
        showError('服务器返回了非 JSON 内容（'+text.slice(0,80)+'…）');
        return;
      }
    }

    // Defensively locate the usage windows.
    // They can be at top level, under "usage", or under "data".
    let data = json;
    if (json.usage && typeof json.usage === 'object') data = json.usage;
    if (json.data && typeof json.data === 'object') data = json.data;

    const windowNames = [['rolling5h','rolling','continuous','5h'], ['weekly','week'], ['monthly','month']];
    const windows = [];

    for (const [primary, ...aliases] of windowNames) {
      let found = data[primary];
      if (found == null) {
        for (const a of aliases) {
          if (data[a] != null) { found = data[a]; found._windowKey = primary; break; }
        }
      } else {
        found._windowKey = primary;
      }
      if (found == null) continue;
      windows.push({ key: primary, raw: found });
    }

    if (windows.length === 0) {
      showError('响应中未找到额度数据。接口格式可能已变化，原始响应：<pre style="white-space:pre-wrap;word-break:break-all;margin-top:8px">'+JSON.stringify(json,null,2).slice(0,500)+'</pre>');
      return;
    }

    // Apply data
    for (const winId of ['rolling5h','weekly','monthly']) {
      const winEl = $(\`w-\${winId}\`);
      const found = windows.find(w => w.key === winId);
      if (found && winEl) {
        winEl.style.display = 'block';
        updateWindow(winId, found.raw);
      } else if (winEl) {
        winEl.style.display = 'none';
      }
    }

    // Plan
    if (json.plan) {
      planTag.textContent = '套餐: ' + json.plan;
      planTag.style.display = '';
    } else {
      planTag.style.display = 'none';
    }

    // Timestamps
    const now = new Date();
    checkTime.textContent = '上次检测: ' + now.toLocaleString('zh-CN');
    if (json.fetchedAt) {
      fetchedAt.textContent = '服务端时间: ' + json.fetchedAt;
    } else {
      fetchedAt.textContent = '';
    }

    // 按勾选状态记住/清除密钥（仅本机 localStorage）
    if (rememberKey.checked) localStorage.setItem('ocusage_key', key);
    else localStorage.removeItem('ocusage_key');

    usageArea.style.display = 'block';
  } catch (e) {
    if (e instanceof TypeError && String(e.message).includes('fetch')) {
      showError('网络请求失败：本页面暂无可用的转发后端。点页面下方「Deploy to Cloudflare Workers」部署后即可查询。');
    } else {
      showError('请求出错: ' + e.message);
    }
  } finally {
    loadingEl.style.display = 'none';
    checkBtn.disabled = false;
  }
}

// Events
checkBtn.addEventListener('click', checkUsage);
keyInput.addEventListener('keydown', e => { if (e.key === 'Enter') checkUsage(); });

// 懒人模式：#sk-… 链接直达（hash 不会发送到服务器，加载后从地址栏清除），
// 或恢复记住的密钥并自动查询
const rememberKey = document.getElementById('rememberKey');
(function initKey() {
  const hash = decodeURIComponent(location.hash.replace(/^#/, '')).trim();
  const saved = localStorage.getItem('ocusage_key');
  if (hash.startsWith('sk-')) {
    keyInput.value = hash;
    rememberKey.checked = true;
    history.replaceState(null, '', location.pathname + location.search);
    checkUsage();
  } else if (saved) {
    keyInput.value = saved;
    rememberKey.checked = true;
    checkUsage();
  }
})();

// Ctrl+V / paste detection: auto-check on paste if it looks like an API key
keyInput.addEventListener('paste', () => {
  setTimeout(() => {
    const v = keyInput.value.trim();
    if (v.startsWith('sk-') && v.length > 20) checkUsage();
  }, 50);
});
</script>
</body>
</html>`;

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
      if (!/^[!-~]+$/.test(key)) {
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
