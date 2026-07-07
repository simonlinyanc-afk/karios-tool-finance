# Phase 3 Security Hardening Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为 Kairos-Finance 的两个 `/api/ocr` 入口增加混合鉴权、15 MiB/JSON/图片限制、脱敏日志和浏览器会话凭证兼容路径。

**Architecture:** `api/security.js` 和 `api/logger.js` 是无框架共享层；`server.js` 在流式读取前执行安全检查，`api/ocr.js` 对平台已解析请求执行等价检查。正式部署由 Nginx 注入内部 Bearer 凭证，本地兼容路径由浏览器只在 `sessionStorage` 中保存用户输入的访问凭证。

**Tech Stack:** Node.js ESM、原生 HTTP、Web Fetch API、sessionStorage、Node test runner、Nginx。

---

## 执行约束

- 由 Phase 3 执行子线程编写业务代码；幕僚长线程负责验收、精确暂存和阶段提交。
- 使用 TDD：每组行为先写失败测试，确认失败，再写最小实现。
- 不修改与本阶段无关的既有脏文件。
- 子线程不执行 `git add` 或 `git commit`。
- 不在测试输出、日志、文档示例或 fixture 中放入真实凭证。

### Task 1: 共享安全策略与输入校验

**Files:**
- Create: `api/security.js`
- Create: `tests/security.test.js`

**Step 1: 写失败测试**

覆盖：

- production 缺少/错误 Authorization 返回稳定 403。
- 正确 Bearer 凭证通过，比较函数不返回凭证内容。
- production 缺少服务端 `OCR_ACCESS_TOKEN` 可被启动校验捕获。
- 非 production 且未配置 token 时允许本地请求。
- 仅允许 `application/json` 与可选 charset。
- `Content-Length` 和已解析对象超过 15 MiB 时返回 413。
- 仅允许 `data:image/jpeg;base64,` 与 `data:image/png;base64,`。
- `tokenSource` 只归一化为 `nginx`、`session`、`direct`。

**Step 2: 运行并确认红灯**

Run: `node --test tests/security.test.js`
Expected: FAIL，因为 `api/security.js` 尚不存在。

**Step 3: 实现最小安全模块**

实现稳定的 `OcrSecurityError`、15 MiB 常量、生产配置断言、Bearer 解析与恒定时间比较、Content-Type/长度/图片 data URL 校验，以及安全错误响应映射。禁止错误对象携带原始请求数据。

**Step 4: 运行并确认绿灯**

Run: `node --test tests/security.test.js`
Expected: PASS。

### Task 2: 白名单结构化日志

**Files:**
- Create: `api/logger.js`
- Create: `tests/logger.test.js`

**Step 1: 写失败测试**

验证 requestId 生成、字段白名单、数值归一化，以及图片、Authorization、API Key、异常堆栈和任意额外字段均不会进入日志。

**Step 2: 运行红灯**

Run: `node --test tests/logger.test.js`
Expected: FAIL。

**Step 3: 实现日志器**

日志器只接收 `requestId/model/latencyMs/status/errorType/tokenSource/authResult`，输出单行结构化对象。调用方不得把请求或异常对象整体传入。

**Step 4: 运行绿灯**

Run: `node --test tests/logger.test.js`
Expected: PASS。

### Task 3: 自托管入口接入安全层

**Files:**
- Modify: `server.js`
- Create: `tests/phase3-api-security.test.js`
- Modify: `tests/phase1-self-hosting.test.js` only if existing expectations require the new injected security context

**Step 1: 写失败测试**

验证：认证与 Content-Type 在读 body 前执行；400/403/413/415 均返回稳定安全 payload；生产启动缺少服务端凭证时报错；成功与失败日志均为白名单字段；OCR service 仍收到 `mode` 和 `request`。

**Step 2: 运行红灯**

Run: `node --test tests/phase3-api-security.test.js`
Expected: FAIL。

**Step 3: 修改 `server.js`**

将原有 body 限制接入共享安全模块，保留流式硬上限。每个请求创建 requestId；鉴权失败不读取正文；成功响应记录模型、耗时和状态。`startServer()` 加载环境文件后执行 production 配置断言。

**Step 4: 运行绿灯和旧入口测试**

Run: `node --test tests/phase3-api-security.test.js tests/phase1-self-hosting.test.js tests/self-hosting.test.js`
Expected: PASS。

### Task 4: Vercel 兼容入口接入等价安全层

**Files:**
- Modify: `api/ocr.js`
- Modify: `tests/phase3-api-security.test.js`
- Modify: `tests/ocr-api.test.js` only if existing expectations require the new injected security context

**Step 1: 扩展失败测试**

对 Vercel handler 复用同一组认证、JSON、15 MiB、图片类型和日志断言，并验证导出的 body parser 限制为 15 MB。

**Step 2: 运行红灯**

Run: `node --test tests/phase3-api-security.test.js tests/ocr-api.test.js`
Expected: FAIL。

**Step 3: 修改兼容入口**

在调用 OCR service 前执行共享检查；不把配置详情或异常原文返回浏览器。保持 `createOcrHandler()` 可注入 OCR service，便于无网络测试。

**Step 4: 运行绿灯**

Run: `node --test tests/phase3-api-security.test.js tests/ocr-api.test.js`
Expected: PASS。

### Task 5: 浏览器 sessionStorage 兼容路径

**Files:**
- Modify: `js/utils/ocrClient.js`
- Create: `tests/phase3-browser-security.test.js`

**Step 1: 写失败测试**

验证：

- 无凭证时首次请求不硬编码 Authorization。
- 收到 403 后以中文提示用户输入“访问凭证”。
- 非空输入只写入 `sessionStorage`，请求头标记 `session` 并最多重试一次。
- 取消、空输入或第二次 403 时返回带下一步的中文错误并清理错误值。
- `localStorage`、IndexedDB、console 和缓存 payload 均不出现凭证。
- 其他 HTTP 错误继续使用服务端安全文案，不显示内部工程术语。

**Step 2: 运行红灯**

Run: `node --test tests/phase3-browser-security.test.js`
Expected: FAIL。

**Step 3: 实现最小浏览器兼容逻辑**

增加会话凭证读取、写入、清除和单次重试函数。不得把任何实际凭证或默认值写进静态文件；不得改变 OCR 缓存顺序、mode 或 abort/timeout 行为。

**Step 4: 运行绿灯与浏览器回归**

Run: `node --test tests/phase3-browser-security.test.js tests/phase1-browser.test.js tests/phase2-browser.test.js`
Expected: PASS。

### Task 6: 安全文档与部署骨架

**Files:**
- Create: `docs/security.md`
- Create: `docs/deployment-self-hosted.md`
- Create: `deploy/nginx-kairos-finance.conf`
- Modify: `.env.production.example`
- Modify: `docs/open-questions.md`

**Step 1: 写文档约束测试或静态断言**

在 `tests/phase3-api-security.test.js` 中断言：模板包含整站保护、secret snippet、`/api/ocr` 注入、来源标记、代理超时与 15m 限制；环境模板包含变量名但没有真实 secret；Q-001 标记为已解决。

**Step 2: 运行红灯**

Run: `node --test tests/phase3-api-security.test.js`
Expected: FAIL。

**Step 3: 写入文档与配置**

`docs/security.md` 说明威胁边界、凭证轮换、会话存储和日志白名单；部署文档只完成本阶段安全章节，并明确 Phase 6 待办。Nginx 示例引用仓库外 secret snippet，禁止出现真实凭证。

**Step 4: 运行绿灯**

Run: `node --test tests/phase3-api-security.test.js`
Expected: PASS。

### Task 7: Phase 3 回归与泄漏审计

**Files:**
- Test all Phase 3 selected files and existing test suite

**Step 1: 运行专项测试**

Run: `node --test tests/security.test.js tests/logger.test.js tests/phase3-api-security.test.js tests/phase3-browser-security.test.js tests/ocr-api.test.js tests/phase1-self-hosting.test.js tests/phase1-browser.test.js tests/phase2-browser.test.js`
Expected: PASS。

**Step 2: 运行完整测试**

Run: `npm test`
Expected: 全部 PASS。

**Step 3: 运行静态泄漏与边界检查**

检查生产文件和测试捕获日志中不存在真实 secret、base64 内容、访问凭证持久化、`localStorage`/IndexedDB token 写入；运行 `git diff --check` 和所有修改 JS 的 `node --check`。

**Step 4: 独立复审**

由规格审查子线程逐条核对用户 Phase 3 要求；由安全/代码质量子线程检查鉴权绕过、body 限制、时序比较、日志泄漏、错误响应和双入口漂移。执行子线程修复后必须复审关闭。

**Step 5: 幕僚长线程精确暂存并提交**

只暂存本计划列出的 Phase 3 文件，检查 staged 名单和 staged 快照测试后创建独立 Phase 3 提交。不得使用 `git add .`。
