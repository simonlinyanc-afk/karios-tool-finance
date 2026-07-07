# Phase 3 安全加固设计

**状态：** 已批准
**日期：** 2026-07-06
**适用项目：** Kairos-Finance

## 1. 目标与边界

本阶段在不引入用户系统、数据库、对象存储或新部署平台的前提下，为 `/api/ocr` 增加统一的访问控制、输入限制和脱敏日志。`server.js` 是正式自托管入口，`api/ocr.js` 继续作为兼容入口；两者必须调用同一套安全与日志模块。

本阶段同时建立自托管安全文档和 Nginx 配置骨架。Docker、Compose、`GET /api/health`、完整 HTTPS 部署、回滚和日志运维在 Phase 6 补全，避免跨阶段扩张。

## 2. 已批准的混合鉴权方案

### 2.1 正式自托管

请求链路：

```text
浏览器 -> Nginx 整站访问保护 -> Nginx 注入内部 Bearer 凭证 -> Node /api/ocr
```

- 浏览器不取得 `OCR_ACCESS_TOKEN`。
- Nginx 对整站启用 Basic Auth、VPN 或等价的内部访问保护。
- `/api/ocr` 反代时，Nginx 从服务器外置 secret snippet 注入 `Authorization`，并覆盖客户端同名请求头。
- Nginx 写入非敏感来源标记；Node 只将该标记用于日志，不将它作为授权依据。
- Node 仅监听回环地址，或只存在于 Docker 私有网络；不得直接暴露公网。
- `NODE_ENV=production` 时，Node 必须验证凭证。正式自托管启动时缺少 `OCR_ACCESS_TOKEN` 将拒绝启动。

### 2.2 本地开发或无反代兼容环境

- 首次遇到拒绝响应时，浏览器以中文提示用户输入管理员提供的“访问凭证”。
- 凭证只写入 `sessionStorage`，不写入 HTML、JS 常量、构建变量、`localStorage`、IndexedDB、仓库或日志。
- 浏览器发送 `Authorization: Bearer <credential>`，并最多自动重试一次。
- 凭证错误时清除当前会话值，提示用户重新输入或联系管理员。
- 关闭标签页或浏览器后，浏览器会话凭证失效。

## 3. 服务端安全模块

新增 `api/security.js`，向两个入口提供同一组纯函数与错误类型：

- 识别生产环境并校验服务端配置。
- 从请求头解析 Bearer 凭证。
- 使用恒定时间比较，避免普通字符串比较产生明显时序差异。
- 生产环境始终鉴权；非生产环境在配置了 `OCR_ACCESS_TOKEN` 时也执行鉴权，未配置时允许本地开发。
- 仅接受 `application/json`，允许标准 `charset` 参数。
- 请求体上限固定为 15 MiB。
- `server.js` 在读取正文前检查鉴权、类型和 `Content-Length`，读取过程中继续执行硬上限。
- `api/ocr.js` 检查请求头、声明兼容平台的 15 MB body parser 限制，并对已解析对象再次测量。
- 图片只接受非空的 `data:image/jpeg;base64,...` 或 `data:image/png;base64,...`。

安全错误返回稳定的 HTTP 状态、错误码、用户可理解的信息、下一步操作和 `requestId`。请求凭证缺失或错误统一返回 403，不区分原因。服务器配置缺失不向客户端透露 secret 名称。

## 4. 脱敏日志

新增 `api/logger.js`。日志器只允许以下白名单字段：

- `requestId`
- `model`
- `latencyMs`
- `status`
- `errorType`
- `tokenSource`
- `authResult`

日志器忽略所有额外字段，不接收请求体、图片、凭证、API Key、模型原始输出或异常堆栈。每个 OCR 请求生成新的 `requestId`；入口记录鉴权结果与最终状态。成功时可以从正式响应 `meta.model` 取得模型名，失败时只记录稳定错误类型。

`tokenSource` 仅用于运维观察：Nginx 覆盖为 `nginx`，浏览器会话兼容路径发送 `session`，其他请求记录为 `direct`。来源标记不能改变鉴权结果。

## 5. 用户可见错误

前端不得显示 Bearer、Token、JSON、schema、model 等工程词。典型提示：

- 403：`无法使用识别服务。请重新输入访问凭证，或联系管理员检查服务设置。`
- 413：`文件内容过大。请压缩图片或拆分后重新上传。`
- 415：`当前请求格式无法处理。请刷新页面后重新上传。`
- 非 JPG/PNG data URL：`仅支持 JPG 或 PNG 图片。请转换格式后重试。`

错误响应携带 `action`；浏览器优先显示服务端给出的安全文案与下一步，而不是内部异常详情。

## 6. 部署资产

- `.env.production.example` 增加 `OCR_ACCESS_TOKEN`，并将直接主机部署默认监听改为回环地址。
- `deploy/nginx-kairos-finance.conf` 保护整站，并通过仓库外 secret snippet 注入内部凭证。配置文件不包含真实凭证。
- `docs/deployment-self-hosted.md` 本阶段写入网络边界、secret provision 和鉴权验证；Phase 6 再补 Docker Compose、证书、健康检查、回滚和完整日志运维。
- `docs/security.md` 成为鉴权、输入限制、日志脱敏和本地会话凭证的事实源。
- `docs/open-questions.md` 将 Q-001 标记为已解决并记录本设计。

## 7. 测试与验收

测试必须覆盖：

1. 生产环境缺少或错误请求凭证返回 403，正确凭证进入 OCR 服务。
2. 正式自托管启动缺少服务端凭证时拒绝启动。
3. 非 JSON 返回 415；超 15 MiB 返回 413。
4. 仅 JPG/PNG data URL 通过，PDF、GIF、普通 URL 和空数据被拒绝。
5. `server.js` 与 `api/ocr.js` 的状态码和安全响应结构一致。
6. 本地无反代时可输入会话凭证、重试一次并写入 `sessionStorage`。
7. 会话凭证不进入 `localStorage`、IndexedDB 或日志。
8. 日志白名单生效，捕获输出中不出现 base64、API Key 或凭证。
9. 既有模型路由、Schema、OCR 缓存、Excel、打印、PDF 和图片预处理链路不被破坏。

## 8. 文件边界

本阶段计划新增：

- `api/security.js`
- `api/logger.js`
- `docs/security.md`
- `docs/deployment-self-hosted.md`
- `deploy/nginx-kairos-finance.conf`
- `tests/security.test.js`
- `tests/logger.test.js`
- `tests/phase3-api-security.test.js`
- `tests/phase3-browser-security.test.js`

本阶段计划修改：

- `server.js`
- `api/ocr.js`
- `js/utils/ocrClient.js`
- `.env.production.example`
- `docs/open-questions.md`

不修改 IndexedDB schema、ExcelJS、`print.html`、PDF.js、Web Worker、OffscreenCanvas 或 OCR 缓存键与命中顺序。
