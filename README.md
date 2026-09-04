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

本地运行时查询链路是**同源优先**：密钥只经过你本机的 server.py，不会经过任何线上代理；
页面结果里也会显示「本次经 本机后端」。仓库不内置任何公共转发地址；若你用 GitHub Pages
这类无后端静态托管对外服务，可把你的转发地址填入 `index.html` 的 `DEFAULT_PROXY`。

免粘贴：勾选「记住密钥」后打开页面即自动查询；也可以用 `https://你的域名/#sk-xxx` 直达（hash 仅在本机地址栏短暂存在，不会发送到服务器）。
支持存多个 key 并双击标签加备注，点击标签即可轮换查询——全部仅存本机浏览器 localStorage，不上传。

### 方式二：共享部署（Cloudflare Worker）

opencode.ai **不开放浏览器跨域（CORS）**，纯静态页面无法直连查询，共享查询走 Worker 转发。

**路径 A · 一键部署（最简单）：**

点下方按钮 → 登录 Cloudflare → 点 **Deploy**，十几秒完成，得到 `https://xxx.workers.dev` 即是完整查询网页，直接把地址发给别人：

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https%3A%2F%2Fraw.githubusercontent.com%2Fmuzimu217%2Focusage%2Fmain%2Fcloudflare-worker.js)

**路径 B · 复制仓库 + 命令行部署：**

```bash
git clone https://github.com/muzimu217/ocusage && cd ocusage
npx wrangler login      # 首次使用会打开浏览器授权
npx wrangler deploy     # 部署完成，输出你的 workers.dev 地址
```

> 部署后想绑自有域名（`workers.dev` 在部分地区被 DNS 污染不可达），在 `wrangler.toml`
> 中按其中注释加 `routes` 段再 `wrangler deploy` 一次即可。

改动页面后重新生成 Worker 文件：`python3 gen_worker.py`，再部署一次。

> **Fork 者须知**：通过 Worker 部署（上面两条路径）即完全独立——同源优先，访客的密钥
> 只经过你自己的 Worker。仓库不内置任何转发地址；若你 fork 后改用 GitHub Pages
> 纯静态托管（无后端）给他人访问，请自行把 `index.html` 里的 `DEFAULT_PROXY`
> 填为你自己的转发地址，否则静态页无法完成查询。

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

## 致谢

- 本项目已在 [LINUX DO 社区](https://linux.do) 分享与认可，感谢社区朋友们的支持与反馈 🙌

## License

MIT
