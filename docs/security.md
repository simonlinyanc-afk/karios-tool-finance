# Kairos-Finance 安全设计

## 适用边界

本系统仍是工作室内部、本地优先的发票与报销工具，不引入账号系统、数据库或对象存储。安全加固集中在 OCR 薄代理：浏览器图片只在必要时发送给同源 `/api/ocr`，服务端密钥和内部访问凭证不进入前端代码。

## 已批准的混合鉴权

### 正式自托管

- Nginx 在 HTTPS 入口保护整站，而不只保护 OCR 路径。
- Node 默认监听 `127.0.0.1`，不得直接暴露公网；防火墙也应禁止外部访问 Node 端口。
- 浏览器不接触内部 OCR 访问凭证。
- `/api/ocr` 反代配置从服务器上的外置、仅 root 可读片段覆盖 `Authorization` 请求头，并固定设置 `X-OCR-Token-Source: nginx`。
- Nginx 与 Node 使用同一个随机内部值。该值只存在于服务器 secret 文件和 Node 进程环境中，绝不进入仓库。
- `NODE_ENV=production` 时，Node 必须配置访问凭证并强制校验。自托管 `server.js` 进程缺少配置会拒绝启动；兼容函数入口会拒绝 `/api/ocr` 并安全返回“服务暂不可用”，不会暴露配置名称。
- 在已配置生产访问值时，请求缺少或携带错误凭证一律返回 403；不会继续读取图片内容，也不会调用 OCR 服务。

### 本地开发或无反代兼容环境

- 服务端未配置访问凭证且不处于生产环境时，可以无鉴权开发。
- 若服务端要求访问凭证，浏览器收到 403 后才显示中文输入框。
- 用户输入只写入 `sessionStorage`，不写入 `localStorage`、IndexedDB、HTML、JS 常量或构建变量。
- 当前标签页或浏览器会话关闭后，浏览器保存的访问凭证失效。
- 每次识别最多因 403 自动重试一次。取消、空输入或第二次 403 都会清理会话值，并告诉用户重新输入后再识别。

### 禁止清单

- 不得把真实 `OCR_ACCESS_TOKEN` 写入 HTML。
- 不得把真实 `OCR_ACCESS_TOKEN` 写入 JS。
- 不得把真实 `OCR_ACCESS_TOKEN` 写入前端构建变量或镜像构建参数。
- 不得把真实 `OCR_ACCESS_TOKEN` 写入 `localStorage`。
- 不得把真实 `OCR_ACCESS_TOKEN` 写入 IndexedDB。
- 不得把真实 `OCR_ACCESS_TOKEN` 写入 Git 仓库。
- 不得在应用日志、Nginx 日志或排障记录中打印真实 `OCR_ACCESS_TOKEN`。

## 请求校验顺序

两个 `/api/ocr` 入口执行相同的安全顺序：

1. 检查请求方法。
2. 在读取 body 前完成访问鉴权。
3. 只接受 `application/json`，允许附带 `charset` 参数。
4. 先检查声明的长度，再在读取数据流时执行 15 MiB 硬限制；兼容函数入口还会检查已解析对象的实际序列化大小。
5. 只接受非空的 `data:image/jpeg;base64,...` 或 `data:image/png;base64,...`。
6. 校验完成后才调用 OCR service。

访问值使用 SHA-256 等长摘要和 `timingSafeEqual` 比较，避免普通字符串比较产生明显的时序差异。缺失或错误凭证统一返回 403。格式、大小和图片问题分别返回稳定的 400、413 或 415，并包含用户可以执行的下一步。

## 日志最小化

每次 OCR 请求生成独立 `requestId`。结构化单行日志只允许以下字段：

- `requestId`
- `model`
- `latencyMs`
- `status`
- `errorType`
- `tokenSource`（只会归一为 `nginx`、`session` 或 `direct`）
- `authResult`

日志不记录请求 body、base64 图片、访问凭证、上游 API Key、原始错误对象、cause 或 stack。未知字段会在日志模块中直接丢弃；换行符会被清理，避免日志注入。

鉴权相关日志只保留来源类别和结果类别：`tokenSource` 用于区分 `nginx`、`session`、`direct`，`authResult` 用于区分 `allowed`、`denied`、`development_bypass`、`configuration_error`。这些字段不得包含真实凭证值。

## 15 MiB 的含义

应用层常量为 `15 * 1024 * 1024` 字节。Nginx 使用 `client_max_body_size 15m`，兼容入口声明 `15mb` body parser 限制。由于图片使用 base64 传输，原始文件应明显小于该值；浏览器继续沿用现有的本地压缩与 PDF 预处理链路。

## 凭证运维要求

- 使用密码生成器创建至少 32 字节随机值；不要复用上游 API Key。
- `.env.production.example` 只能保留占位符；真实 `.env` 不提交。
- Nginx secret 片段必须位于仓库外，属主为 root，权限建议为 `0600`。
- 轮换时同时更新 Node 环境与 Nginx secret 片段，再以短暂维护窗口依次重启并验证 403/200 行为。
- 排障时只查询 requestId 和安全字段，不记录或复制用户发票内容。

完整的服务器部署、容器 secret 注入、回滚和日志命令将在 Phase 6 文档中补全。
