# ocusage — OpenCode Go 套餐额度查询

本地/自托管网页：填入 API 密钥，即可查看 OpenCode Go 套餐
**5 小时滚动 / 周 / 月** 三个限额的用量百分比、剩余美元与重置倒计时。

> Go 套餐限额：5 小时 $12 · 周 $30 · 月 $60（数据来自服务端实时返回）。

## 快速开始

### 方式一：本地运行（最简单，1 条命令）

```bash
python3 server.py
# 浏览器打开 http://127.0.0.1:18083/，填入密钥即可
```

### 方式二：共享部署（Cloudflare Worker，免费额度足够）

opencode.ai **不开放浏览器跨域（CORS）**，纯静态页面无法直连查询。
想和别人共用，部署自包含的 Worker（页面 + 转发一体，部署完即是完整网页）：

**一键部署（推荐）：**

1. 点击按钮（页面底部也有同款按钮）：

   [![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https%3A%2F%2Fraw.githubusercontent.com%2Fmuzimu217%2Focusage%2Fmain%2Fcloudflare-worker.js)

2. 浏览器跳到 Cloudflare，登录/免费注册（GitHub 账号可直接登录）
3. 确认 Worker 名称，点 **Deploy**，十几秒完成
4. 得到地址 `https://<你的名字>.workers.dev` —— 这就是完整的查询页面，
   直接发给别人即可；每天 10 万次免费请求，团队共用足够

**手动部署（可选）：**

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/) → Workers & Pages → Create
2. 选 "Hello World" 模板创建 Worker → 编辑代码
3. 把 [`cloudflare-worker.js`](cloudflare-worker.js) 的全部内容粘贴进去 → Save and Deploy

**部署后想让 GitHub Pages 页面也能查询：**
打开 Pages 页面 → 底部「转发设置」→ 填入你的 `https://xxx.workers.dev` → 保存（浏览器会记住）。

改动页面后重新生成 Worker 文件：`python3 gen_worker.py`（然后需要同步更新线上部署的代码）。

### 方式三：GitHub Pages 静态页

页面在 Pages 上可打开，但受上述 CORS 限制，查询需在页面底部
「转发设置」里填一个 Worker 地址（填一次即记住），或改用方式一/二。

## CLI（附赠）

```bash
go build -o ocusage . && ./ocusage -key sk-xxxx          # 单次查询
OPENCODE_API_KEY=sk-xxxx ./ocusage -watch                # 30 秒刷新
./ocusage -json                                           # 机器可读输出
```

退出码：`0` 正常 · `1` 出错 · `2` 任一窗口已用满（可接告警脚本）。

## 工作原理

- `GET https://opencode.ai/zen/go/v1/usage`，`Authorization: Bearer <密钥>`
- 该端点**不在官方文档内**（官方 issue #31084 请求公开化中），响应结构可能变化。
  解析层已防御性兼容所有已知形态（窗口位置/百分比/美元/重置字段的多种命名），
  若 API 只返回百分比，则按官方限额反推美元并在界面标注。
- 密钥只随请求头转发给 opencode.ai，不落盘、不发给第三方；
  Worker/server.py 仅做透传。
- `mock_server.py` 可离线模拟各响应形态用于测试。

## 文件

| 文件 | 说明 |
|------|------|
| `index.html` | 查询页面（双模式：同源后端 / 自定义转发 / 直连自动降级） |
| `server.py` | 本地一键运行：托管页面 + 转发 |
| `cloudflare-worker.js` | Worker 自包含部署版（由 `gen_worker.py` 生成） |
| `main.go` | Go 版 CLI，零第三方依赖 |

## License

MIT
