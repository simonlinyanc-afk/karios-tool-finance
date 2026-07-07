# Kairos Finance 升级最终报告

## 总体状态

本轮升级已按阶段完成 Phase 0 到 Phase 7 的主要交付与回归收口。

已完成提交：

| Phase | Commit | 内容 |
| --- | --- | --- |
| Phase 0 | `100360f` | 当前架构审计 |
| Phase 1 | `3aa7ce9` | Qwen 模型路由与环境变量模型配置 |
| Phase 2 | `4928b37` | 发票结构化响应解析与校验 |
| Phase 3 | `e5e1fae` | OCR 请求安全加固与混合鉴权 |
| 安全清理 | `947c864` | 清理 README 中已提交的 API 凭证形态样例 |
| Phase 4 | `28caab0` | UX 文案、表格、上传、弹窗与增强识别入口 |
| Phase 5 | `5fa96c3` | 轻量构建系统元信息与构建系统说明 |
| Phase 6 | `fc2d1c0` | 自托管部署资产、Docker Compose、Nginx 示例与 health endpoint |
| 安全边界补强 | `ce11656` | 明确混合鉴权批准方案、生产 Token 边界与日志安全测试 |
| 部署边界补强 | `c46cb88` | 移除 Vercel 部署脚本，并用测试防止部署能力回流 |

当前仍保留的工作区旧脏文件未纳入上述阶段提交，包括 `.DS_Store`、`README.md`、`js/utils/imageProcessor.js`、`js/components/PDFTemplate.js`、`print.html` 的非阶段改动、黑色 SVG、`tests/self-hosting.test.js`、`tests/ocr-core.test.js` 等。

## 架构边界执行情况

已保持：

- 浏览器本地预处理。
- IndexedDB 本地优先缓存。
- 同源 `/api/ocr` 薄代理。
- DashScope/Qwen 结构化识别。
- 浏览器本地 Excel 导出。
- `print.html` 打印链路。
- PDF.js、Web Worker、OffscreenCanvas、ExcelJS 和现有 OCR 缓存逻辑。
- Vercel `api/ocr.js` 兼容入口。
- 自托管 `server.js` 为正式部署入口。

未引入：

- SaaS 化用户系统。
- PostgreSQL。
- 对象存储。
- Next.js。
- Vercel 部署能力。

## 模型与结构化识别

模型名均从环境变量读取：

- `QWEN_PRIMARY_MODEL` 默认 `qwen3-vl-flash`
- `QWEN_FALLBACK_MODEL` 默认 `qwen3.7-plus`
- `QWEN_HIGH_ACCURACY_MODEL` 默认 `qwen3-vl-plus`
- `QWEN_ENABLE_THINKING=false`

行为：

- `mode=normal` 先走主模型。
- 主模型异常、JSON 解析失败或结构校验失败时进入自动复查。
- `mode=high_accuracy` 只走增强识别模型。
- 技术响应保留 `meta.model`、`meta.fallbackUsed`、`meta.latencyMs`，前端不直接展示这些工程词。

## 安全与鉴权

已实现批准的混合鉴权方案：

- 正式自托管环境由 Nginx 保护整站。
- 浏览器不接触 `OCR_ACCESS_TOKEN`。
- Nginx 在 `/api/ocr` 反代时注入内部 `Authorization`。
- Node 在 `NODE_ENV=production` 时强制校验 Token。
- Token 缺失或错误返回 403。
- `OCR_ACCESS_TOKEN` 缺失或为占位弱值时拒绝生产运行或拒绝请求。
- 日志只记录白名单字段，不记录 Token、base64 图片、请求体、上游 API Key 或原始异常对象。

新增 `GET /api/health`，返回：

```json
{"ok":true,"service":"kairos-finance"}
```

该接口不返回 API Key、Token 或模型配置。

## UX 文案与工程词控制

已将用户界面中的关键状态映射到用户语言：

- `fallback` → “系统已自动再识别一次”
- `high_accuracy` → “增强识别”
- `cached` → “已从本地记录恢复”
- `needs_review` → “建议检查”
- `failed` → “识别失败”
- `ready` → “已完成”

失败状态提供：

- 重新识别
- 增强识别
- 手动填写

错误提示均补充下一步操作。Phase 4 静态测试覆盖了可见文案不泄露 fallback、schema、JSON、MD5、IndexedDB、DashScope、model 等工程词。

## 构建系统

Phase 5 评估后未迁移 Vite。

原因：

- 当前页面仍依赖浏览器 Babel 处理 `type="text/babel"`。
- React、ReactDOM、Tailwind CDN、Lucide、Dexie、Spark-MD5 等仍按全局变量顺序加载。
- 贸然引入 Vite 会同时改变 JSX 编译、Tailwind 生成、全局变量挂载和 worker/static 路径，风险超过轻量现代化范围。

本阶段完成：

- `package.json` 补齐 `dev`、`start`、`test` 脚本，并移除 Vercel 部署脚本。
- `package-lock.json` 锁定当前 npm 工程元信息。
- `docs/build-system.md` 记录 Vite 暂缓原因与后续迁移条件。

## 自托管部署

Phase 6 新增：

- `Dockerfile`
- `docker-compose.yml`
- `.dockerignore`
- `deploy/nginx-kairos-finance.conf`
- `docs/deployment-self-hosted.md`
- `tests/phase6-deployment.test.js`
- `GET /api/health`

Nginx 示例包含：

- HTTPS server。
- `client_max_body_size 15m`。
- `/api/ocr` 限流建议。
- `/api/ocr` 10 秒连接超时、150 秒读写超时。
- 外置 snippet 注入内部 Bearer Token。
- `/api/health` 代理。

Docker Compose 配置解析已通过。早期容器实启曾卡在拉取 `node:20-alpine` 元数据；后续复验已补齐：成功拉取 `node:20-alpine`，使用 `/private/tmp` 临时 env/compose 文件构建并启动 `kairos-finance:phase7-test`，容器状态为 healthy，`GET http://127.0.0.1:3107/api/health` 返回 `{"ok":true,"service":"kairos-finance"}`。无凭证访问容器内生产 `/api/ocr` 返回 403，日志只包含 `requestId`、`status`、`errorType`、`tokenSource`、`authResult`。

## Phase 7 回归矩阵

| # | 回归项 | 证据 | 结论 |
| --- | --- | --- | --- |
| 1 | JPG 上传 | `tests/phase2-browser.test.js`、`tests/phase4-ux.test.js` 使用 `invoice.jpg` / `image/jpeg` 合成 File；另将真实 PDF 发票样本第 1 页派生为 JPEG，POST 到 mock OCR `/api/ocr` 生产鉴权路径返回 200 | 自动化模拟通过；真实样本派生 JPEG API 输入通过；未外发真实 OCR |
| 2 | PNG 上传 | `/api/ocr` 与安全测试覆盖 `data:image/png`；另将真实 PDF 发票样本第 1 页派生为 PNG，POST 到 mock OCR `/api/ocr` 生产鉴权路径返回 200 | 自动化模拟通过；真实样本派生 PNG API 输入通过；未外发真实 OCR |
| 3 | PDF 上传 | `UploadZone` accept 包含 `application/pdf`，PDF.js 仍保留；已定位真实 PDF 样本：`tools/test doc/单项目发票 test.pdf`、`tools/test doc/多项目发票-test.pdf`、`林彦丞 3 月报销/【62580约车-19.60元-1个行程】高德打车电子发票.pdf`；使用 headless Chrome/CDP 加载真实 `pdf.min.js`、`imageProcessor.js`、`ocrClient.js`，将真实 PDF File 交给 `processInvoiceFile(..., isPDF=true)`，mock `/api/ocr` 收到 `data:image/jpeg;base64,...` | 通过；真实 PDF 浏览器转换链路已验证，未外发真实 OCR |
| 4 | OCR 缓存命中 | `tests/phase2-browser.test.js` 覆盖 OCR cache 保存与恢复，UI 显示“已从本地记录恢复” | 通过 |
| 5 | `qwen3-vl-flash` 正常识别 | `tests/model-router.test.js`、`tests/ocr-service.test.js` 覆盖 primary 路由；模型名由环境变量读取；已用虚构合成发票图通过本地 `/api/ocr` 调用真实 DashScope，返回 `status=ready`、`meta.model=qwen3-vl-flash`、`fallbackUsed=false` | 自动化模拟通过；真实 DashScope 合成图验证通过 |
| 6 | `qwen3.7-plus` 自动复查 | `tests/model-router.test.js`、`tests/ocr-service.test.js` 覆盖 primary 失败、校验失败、JSON 解析失败后复查；已用虚构空白图通过本地 `/api/ocr` 调用真实 DashScope，返回 `status=needs_review`、`meta.model=qwen3.7-plus`、`fallbackUsed=true` | 自动化模拟通过；真实 DashScope 合成图验证通过 |
| 7 | `qwen3-vl-plus` 增强识别 | `tests/model-router.test.js`、`tests/phase1-browser.test.js`、`tests/phase4-ux.test.js` 覆盖 `high_accuracy` 路由与前端入口；已用虚构合成发票图通过本地 `/api/ocr` 调用真实 DashScope，返回 `status=ready`、`meta.model=qwen3-vl-plus`、`fallbackUsed=false` | 自动化模拟通过；真实 DashScope 合成图验证通过 |
| 8 | Excel 导出 | `tests/phase4-ux.test.js` 覆盖导出按钮、错误文案与 ExcelJS 安全提示；`exportManager.js` 保留 ExcelJS 链路 | 静态/单元覆盖通过；未做真实 Excel 文件人工打开 |
| 9 | `print.html` | `tests/phase4-ux.test.js` 覆盖 Dexie v5 schema 与安全错误文案；打印链路仍使用 `printJobs` | 通过 |
| 10 | Docker 启动 | `docker pull node:20-alpine` 成功；临时 Compose 构建并启动 `kairos-finance:phase7-test`；容器 healthy；`/api/health` 返回安全 payload；无 token `/api/ocr` 返回 403；测试容器已清理 | 通过 |
| 11 | 无 token 请求 `/api/ocr` 被拒绝 | `tests/phase3-api-security.test.js` 覆盖生产环境无凭证 403 | 通过 |
| 12 | 日志中没有 base64 | `tests/logger.test.js`、`tests/phase3-api-security.test.js`、`tests/ocr-service.test.js` 覆盖日志白名单和敏感内容不泄露 | 通过 |
| 13 | 用户界面没有工程术语泄露 | `tests/phase4-ux.test.js` 覆盖可见文案；源码注释/技术文档允许解释工程词 | 通过 |

## 已运行验证命令

```bash
node --test tests/phase6-deployment.test.js tests/phase3-config.test.js tests/phase1-self-hosting.test.js
```

结果：13/13 pass。

```bash
npm test
```

结果：162/162 pass。

```bash
git diff --check -- server.js Dockerfile docker-compose.yml .dockerignore deploy/nginx-kairos-finance.conf docs/deployment-self-hosted.md tests/phase6-deployment.test.js
```

结果：通过。

真实 DashScope OCR 端到端验证（使用虚构合成图片，不外发内部发票样本）：

```bash
npm run dev
curl http://127.0.0.1:3000/api/health
# POST /api/ocr mode=normal，图片为 /tmp/kairos-synthetic-invoice.png
# POST /api/ocr mode=normal，图片为 /tmp/kairos-blank-test.png
# POST /api/ocr mode=high_accuracy，图片为 /tmp/kairos-synthetic-invoice.png
```

结果：

- 健康检查返回 `{"ok":true,"service":"kairos-finance"}`。
- 标准识别：HTTP 200，`status=ready`，`meta.model=qwen3-vl-flash`，`fallbackUsed=false`。
- 自动再识别：HTTP 200，`status=needs_review`，`meta.model=qwen3.7-plus`，`fallbackUsed=true`。
- 增强识别：HTTP 200，`status=ready`，`meta.model=qwen3-vl-plus`，`fallbackUsed=false`。
- 服务端日志仅包含 `requestId`、`model`、`latencyMs`、`status`、`tokenSource`、`authResult`，未打印 base64、API Key 或访问凭证。

```bash
docker compose --project-directory "$PWD" -f <临时compose文件> -p kairos-phase6-test config
```

结果：通过。

```bash
docker info --format '{{.ServerVersion}}'
```

结果：`29.1.5`。

Docker 实启尝试：

```bash
docker compose --project-directory "$PWD" -f <临时compose文件> -p kairos-phase6-test up -d --build
```

结果：长时间停在 `node:20-alpine` 元数据拉取阶段，已中断；未留下运行容器。

Docker 实启复验：

```bash
docker pull node:20-alpine
docker compose -f /private/tmp/kairos-finance-compose-test.yml -p kairos-phase7-test up -d --build
docker compose -f /private/tmp/kairos-finance-compose-test.yml -p kairos-phase7-test ps
curl -sS http://127.0.0.1:3107/api/health
curl -sS -i -X POST http://127.0.0.1:3107/api/ocr -H 'Content-Type: application/json' --data '{"image":"data:image/png;base64,Zm9v"}'
docker compose -f /private/tmp/kairos-finance-compose-test.yml -p kairos-phase7-test logs --tail=120 kairos-finance
docker compose -f /private/tmp/kairos-finance-compose-test.yml -p kairos-phase7-test down
```

结果：构建、启动、健康检查、无凭证 403 与脱敏日志均通过；测试容器、网络和临时 env/compose 文件已清理。

真实样本输入复验：

```bash
pdftoppm -png -singlefile "tools/test doc/单项目发票 test.pdf" /private/tmp/kairos-real-invoice-sample
pdftoppm -jpeg -singlefile "tools/test doc/单项目发票 test.pdf" /private/tmp/kairos-real-invoice-sample
node /private/tmp/kairos-real-sample-check.mjs
```

结果：由真实 PDF 发票样本派生的 PNG 与 JPEG 均通过 `/api/ocr` 生产鉴权路径和 mock OCR service，分别覆盖 `mode=normal` 与 `mode=high_accuracy`；未调用真实 DashScope，未外发发票内容；临时文件已清理。

真实 PDF 浏览器链路复验：

```bash
node /private/tmp/kairos-pdf-browser-check.mjs
```

验证方式：临时脚本启动只读本地 HTTP server 与 headless Google Chrome，通过 Chrome DevTools Protocol 打开最小验证页；页面加载仓库真实 `libs/pdf.min.js`、`libs/pdf.worker.min.js`、`js/utils/imageProcessor.js`、`js/utils/ocrClient.js`，注入 `tools/test doc/单项目发票 test.pdf` 为浏览器 `File`，调用 `window.processInvoiceFile(file, true, ...)`，并在页面内 mock `/api/ocr`。

结果：`pdfjsLib` 与 `processImage` 均就绪；`processInvoiceFile` 返回 `isPDF: true`、`recognitionSource: "ocr"`、`previewUrl` 为 `blob:`；mock `/api/ocr` 收到 `mode: "normal"` 与 `data:image/jpeg;base64,...`，证明真实 PDF 第 1 页已由浏览器 PDF.js 转为 JPEG 并进入现有 OCR client 链路。临时脚本与 Chrome profile 已清理。

真实测试文档 DashScope 复验：

```bash
npm run check:qwen-config
npm run dev
curl http://127.0.0.1:3000/api/health
# 将 tools/test doc/*.pdf 第 1 页转换为 /tmp/kairos-real-*.png
# POST /api/ocr mode=normal，覆盖 4 份真实测试文档
# POST /api/ocr mode=high_accuracy，抽检脏发票样本
```

结果：

| 测试文件 | 模式 | HTTP | 状态 | 最终模型 | 自动再识别 | 识别摘要 |
| --- | --- | ---: | --- | --- | --- | --- |
| `多项目发票-test.pdf` | `normal` | 200 | `ready` | `qwen3.7-plus` | 是 | 日期 `2025-12-22`；发票号 `25442000000815243274`；价税合计 `196.99`；税额 `22.66` |
| `脏发票样本.pdf` | `normal` | 200 | `ready` | `qwen3-vl-flash` | 否 | 日期 `2020-07-01`；发票号 `2631200000238172406`；价税合计 `1212.97`；税额 `12.13` |
| `单项目发票 test.pdf` | `normal` | 200 | `ready` | `qwen3-vl-flash` | 否 | 日期 `2025-12-24`；发票号 `2544200000082405526`；价税合计 `220.21`；税额 `2.18` |
| `高铁票 test.pdf` | `normal` | 200 | `ready` | `qwen3-vl-flash` | 否 | 日期 `2025-12-23`；发票号 `2533913237400076884`；价税合计 `139`；税额 `0` |
| `脏发票样本.pdf` | `high_accuracy` | 200 | `ready` | `qwen3-vl-plus` | 否 | 日期 `2026-07-08`；发票号 `26312000000238172406`；价税合计 `1225`；税额 `12.13` |

观察：`high_accuracy` 对脏发票样本给出的日期、销售方、金额等字段与 `normal` 结果存在明显差异，应在 UI 和流程中继续把“增强识别”视为辅助复核入口，而不是绝对正确结果。服务端日志仅包含 `requestId`、`model`、`latencyMs`、`status`、`tokenSource`、`authResult`，未打印 base64、API Key、访问凭证或完整发票内容。

## 安全注意事项

README 当前 HEAD 已移除 `sk-...` 形态样例，但历史提交中曾出现真实形态凭证。应在真实环境中轮换或废止对应凭证。未执行历史重写，因为这会改变 Git 历史，需要单独授权。

## 后续建议

1. 已使用 Kairos Finance 业务空间凭证和 `tools/test doc` 真实测试文档补跑端到端 OCR；后续建议进行人工抽检，尤其关注增强识别与标准识别差异较大的样本。
2. 若未来要完全去 CDN 或迁移 Vite，应单独立项，先拆浏览器 Babel 与 Tailwind CDN。
