# Kairos Finance

Kairos Finance 是 Kairos 工作室内部使用的发票 / 报销管理系统。它保持轻量自托管架构：浏览器负责本地预处理和本地优先缓存，服务端只做同源 OCR 代理、安全校验和静态资源服务。

当前网页版本：v2.0.0。

当前正式运行方式是自有服务器 `server.js`。`api/ocr.js` 仍保留为 Vercel 兼容入口，但本项目不以 Vercel 部署作为主路径。

## 当前架构

```text
浏览器
  ├─ PDF.js / Web Worker / OffscreenCanvas：PDF 转图、压缩、预处理
  ├─ IndexedDB / Dexie：草稿、历史、OCR 缓存、打印任务
  ├─ ExcelJS：浏览器本地导出 .xlsx
  └─ print.html：浏览器本地打印 / PDF 输出
        │
        ▼
同源 POST /api/ocr
        │
        ▼
Node server.js / Vercel-compatible api/ocr.js
        │
        ▼
DashScope 原生 multimodal-generation/generation
```

不会新增 PostgreSQL、对象存储、用户系统，也不会迁移到 Next.js。

## 目录结构

```text
kairos-finance/
├── index.html                         # 主应用入口
├── print.html                         # 打印页，读取 IndexedDB printJobs
├── server.js                          # 自托管 Node 服务入口
├── api/
│   ├── ocr.js                         # Vercel 兼容入口
│   ├── ocr-service.js                 # OCR 编排与模型路由
│   ├── qwen-client.js                 # DashScope 原生请求客户端
│   ├── model-router.js                # primary / 自动再识别 / 增强识别路由
│   ├── invoice-schema.js              # 发票字段解析与校验
│   ├── security.js                    # 请求体、图片类型、鉴权校验
│   └── logger.js                      # 脱敏结构化日志
├── js/
│   ├── components/                    # React UMD 组件
│   └── utils/                         # OCR、导出、存储、金额工具
├── libs/                              # PDF.js、ExcelJS、CMaps 等本地依赖
├── deploy/
│   └── nginx-kairos-finance.conf      # 自托管 Nginx 示例
├── scripts/
│   └── check-qwen-config.mjs          # 不泄密配置探针
├── docs/                              # 阶段审计、部署、安全、回归报告
└── tests/                             # Node test 测试
```

## 本地开发

需要 Node.js 20+。

```bash
npm install
cp .env.example .env.local
npm run check:qwen-config
npm run dev
```

启动后访问：

```text
http://127.0.0.1:3000
```

健康检查：

```bash
curl http://127.0.0.1:3000/api/health
```

期望返回：

```json
{"ok":true,"service":"kairos-finance"}
```

## DashScope / Qwen 配置

当前代码只支持 DashScope 原生 `multimodal-generation/generation` 请求体。不要把 `QWEN_ENDPOINT` 配成 OpenAI Compatible 的 `/compatible-mode/v1/chat/completions`，除非同时改写 `api/qwen-client.js` 的请求体。

本地 `.env.local` 至少需要：

```bash
QWEN_API_KEY=replace-with-dashscope-api-key
QWEN_ENDPOINT=https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation
QWEN_PRIMARY_MODEL=qwen3-vl-flash
QWEN_FALLBACK_MODEL=qwen3.7-plus
QWEN_HIGH_ACCURACY_MODEL=qwen3-vl-plus
QWEN_ENABLE_THINKING=false
QWEN_TIMEOUT_MS=60000
QWEN_MAX_RETRIES=1
```

如果使用百炼业务空间专属 API Host，endpoint 应保持原生路径：

```bash
QWEN_ENDPOINT=https://<WorkspaceId>.<region>.maas.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation
```

可选记录：

```bash
QWEN_WORKSPACE_ID=<workspaceId>
QWEN_WORKSPACE_NAME=<workspaceName>
QWEN_API_MODE=dashscope-native
```

配置探针只输出 API Key 是否存在、endpoint 类型、workspaceId、模型名和 API 模式，不输出 API Key 内容：

```bash
npm run check:qwen-config
```

## 模型策略

- 标准识别：`QWEN_PRIMARY_MODEL`，默认 `qwen3-vl-flash`
- 自动再识别：`QWEN_FALLBACK_MODEL`，默认 `qwen3.7-plus`
- 增强识别：`QWEN_HIGH_ACCURACY_MODEL`，默认 `qwen3-vl-plus`
- `QWEN_ENABLE_THINKING` 必须为 `false`

`mode=normal` 时先走 primary；如果请求失败、模型输出不可解析或 schema 校验不通过，会自动再识别一次。`mode=high_accuracy` 时直接走增强识别模型。

服务端会返回技术 meta，例如 `meta.model`、`meta.fallbackUsed`、`meta.latencyMs`。前端 UI 不直接展示这些工程词，而使用“已完成 / 建议检查 / 识别失败 / 已从本地记录恢复 / 增强识别”等用户语言。

## 安全与鉴权

正式自托管建议使用混合鉴权：

1. Nginx 保护整站。
2. 浏览器不接触 `OCR_ACCESS_TOKEN`。
3. Nginx 在反代 `/api/ocr` 时注入内部 `Authorization`。
4. Node 在 `NODE_ENV=production` 时强制校验 `OCR_ACCESS_TOKEN`。
5. Node 服务只监听内网或本机地址，不直接暴露公网。

本地开发或无反代兼容环境中，可由用户手动输入访问凭证；凭证只保存在 `sessionStorage`，关闭页面或浏览器后失效。

禁止把真实 Token 或 API Key 写入：

- HTML / JS / 构建变量
- `localStorage`
- IndexedDB
- Docker 镜像层
- Git 仓库
- 日志

日志只记录白名单字段：`requestId`、模型名、耗时、状态、错误类型、`tokenSource`、`authResult`。不得记录 base64 图片内容、API Key、访问凭证或完整发票内容。

## 自托管部署

复制模板：

```bash
cp .env.production.example .env.production
```

启动 Docker Compose：

```bash
docker compose up -d --build
```

推荐使用 Nginx 示例：

```text
deploy/nginx-kairos-finance.conf
```

正式服务器需要在仓库外创建：

```bash
/etc/nginx/secrets/kairos-finance.htpasswd
/etc/nginx/snippets/kairos-finance-ocr-auth.conf
```

其中 snippet 内容类似：

```nginx
proxy_set_header Authorization "Bearer <OCR_ACCESS_TOKEN>";
```

更多细节见 [docs/deployment-self-hosted.md](docs/deployment-self-hosted.md) 和 [docs/security.md](docs/security.md)。

## 测试

运行全部测试：

```bash
npm test
```

常用分组：

```bash
node --test tests/qwen-config-probe.test.js tests/qwen-client.test.js tests/model-router.test.js tests/ocr-service.test.js
node --test tests/phase3-config.test.js tests/phase6-deployment.test.js
```

真实 DashScope 端到端验证需要本机 `.env.local` 指向已授权的 Kairos Finance 业务空间。测试时仍需避免打印 API Key、base64 图片或完整发票内容。

## 重要文档

- [docs/audit-current-architecture.md](docs/audit-current-architecture.md)：当前架构审计
- [docs/ocr-response-schema.md](docs/ocr-response-schema.md)：OCR 响应 schema 与校验规则
- [docs/security.md](docs/security.md)：安全边界与混合鉴权方案
- [docs/deployment-self-hosted.md](docs/deployment-self-hosted.md)：自托管部署说明
- [docs/build-system.md](docs/build-system.md)：构建系统说明
- [docs/final-upgrade-report.md](docs/final-upgrade-report.md)：最终升级与回归报告
- [docs/web-v2-upgrade-report.md](docs/web-v2-upgrade-report.md)：v2.0.0 网页版本角标与开屏升级报告说明

## 维护边界

- 保留 IndexedDB、PDF.js、Web Worker + OffscreenCanvas、ExcelJS、`print.html` 和现有 OCR 缓存逻辑。
- 保留 Vercel `api/ocr.js` 兼容入口，但正式部署以 `server.js` 为主。
- 不迁移 Next.js。
- 不新增 PostgreSQL。
- 不新增对象存储。
- 不新增用户系统。
- 不把 DashScope 配置改成 OpenAI Compatible，除非同步改写 `api/qwen-client.js`。

## 常见问题

### `Model.AccessDenied`

说明当前 API Key 所属业务空间没有目标模型权限，或 API Key 自定义访问范围未勾选目标模型。需要在百炼业务空间授权：

- `qwen3-vl-flash`
- `qwen3.7-plus`
- `qwen3-vl-plus`

### `/api/ocr` 返回 403

生产环境下缺少或错误的内部访问凭证会返回 403。检查：

- Node 环境变量 `OCR_ACCESS_TOKEN`
- Nginx snippet 是否注入 `Authorization`
- 浏览器是否绕过了 Nginx 直接访问 Node

### 配置探针显示 `openai-compatible`

当前代码不支持 OpenAI Compatible 请求体。把 `QWEN_ENDPOINT` 改回 DashScope 原生 `multimodal-generation/generation` 地址，或单独立项改写 `api/qwen-client.js`。

### PDF 识别失败或效果差

优先检查 PDF 第 1 页是否能被 PDF.js 渲染、图片是否过小或过度压缩。当前图像处理会对大图做二次压缩以控制请求体大小。
