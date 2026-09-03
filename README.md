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

### 方式二：共享部署（Cloudflare Worker）

opencode.ai **不开放浏览器跨域（CORS）**，纯静态页面无法直连查询，共享查询走 Worker 转发。

**Fork 本仓库后，点下方按钮一键部署（页面 + 转发一体，部署完即是完整查询网页）：**

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https%3A%2F%2Fraw.githubusercontent.com%2Fmuzimu217%2Focusage%2Fmain%2Fcloudflare-worker.js)

> 想让 GitHub Pages 上的页面也零配置可查：部署后把 `https://xxx.workers.dev`
> 填入 `index.html` 顶部的 `DEFAULT_PROXY` 并提交——这是**维护者配置项**，
> 访客页面上没有任何需要填写的东西，打开即查。

改动页面后重新生成 Worker 文件：`python3 gen_worker.py`。

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
