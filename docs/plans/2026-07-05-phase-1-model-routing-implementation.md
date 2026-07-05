# Phase 1 Model Routing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为 Kairos-Finance 增加环境变量驱动的标准识别、自动复查和增强识别路由，同时保持当前本地优先、双 HTTP 入口和 OCR 缓存链路兼容。

**Architecture:** 保留 DashScope 原生多模态协议，把上游请求、模型选择和 OCR 业务编排拆为 `qwen-client`、`model-router`、`ocr-service` 三层。路由层只处理模式、复查条件和技术元数据，Phase 2 再注入正式发票 Schema 校验。

**Tech Stack:** Node.js 20 ESM、原生 `fetch` / `AbortController`、Node test runner、DashScope multimodal generation API、浏览器经典脚本与 IndexedDB OCR 缓存

---

## 执行约束

- 先读 `docs/plans/2026-07-05-phase-1-model-routing-design.md`。
- 使用 `superpowers:test-driven-development`：每一组行为必须先看到测试因缺少实现而失败，再写最小实现。
- 当前工作树包含用户的既有修改；禁止 reset、checkout 覆盖或宽泛 staging。
- 不使用 `git add .`。Phase 1 全部完成并 review 通过后，才由幕僚长线程按精确路径提交一次。
- 不实现 Phase 2 Schema、Phase 3 Token/日志模块、Phase 4 按钮或 Phase 6 Docker。

### Task 1: 固定基线与测试入口

**Files:**
- Read: `api/ocr-service.js:1-128`
- Read: `api/ocr.js:1-27`
- Read: `server.js:146-183`
- Read: `js/utils/ocrClient.js:1-5,306-455`
- Read: `tests/ocr-core.test.js`
- Read: `tests/self-hosting.test.js`

**Step 1: 记录当前精确状态**

Run: `git status --short`

Expected: 能看到 Phase 0 提交后的既有未提交文件；不要修改或清理无关项。

**Step 2: 运行基线测试**

Run: `npm test`

Expected: 当前 15 个测试全部通过。若失败，停止实现并向幕僚长线程报告基线差异。

**Step 3: 确认旧模型硬编码基线**

Run: `rg -n "qwen-vl-max-latest|OCR_MODEL_VERSION" api js tests`

Expected: 至少命中 `api/ocr-service.js` 与 `js/utils/ocrClient.js`，后续任务将移除这些运行时硬编码。

### Task 2: 先测试 DashScope 客户端配置与安全请求体

**Files:**
- Create: `tests/qwen-client.test.js`
- Create: `api/qwen-client.js`

**Step 1: 写配置与请求体失败测试**

在 `tests/qwen-client.test.js` 覆盖：

```js
test('buildQwenRequest sends native multimodal JSON mode with thinking disabled', () => {
  const request = buildQwenRequest({
    model: 'primary-test-model',
    image: 'data:image/jpeg;base64,Zm9v',
    prompt: 'Return JSON'
  });

  assert.equal(request.model, 'primary-test-model');
  assert.equal(request.input.messages[0].content[0].image, 'data:image/jpeg;base64,Zm9v');
  assert.equal(request.parameters.result_format, 'message');
  assert.equal(request.parameters.enable_thinking, false);
  assert.deepEqual(request.parameters.response_format, { type: 'json_object' });
});

test('loadQwenClientConfig rejects thinking mode while JSON mode is active', () => {
  assert.throws(() => loadQwenClientConfig({
    QWEN_API_KEY: 'test-key',
    QWEN_ENDPOINT: 'https://example.test/qwen',
    QWEN_ENABLE_THINKING: 'true'
  }), /QWEN_ENABLE_THINKING/);
});
```

再加入以下行为：

- 缺少 `QWEN_API_KEY` 或 `QWEN_ENDPOINT` 时抛出配置错误。
- `QWEN_TIMEOUT_MS`、`QWEN_MAX_RETRIES` 解析为有限非负整数。
- 429 或 5xx 在总时间预算内重试；401 不重试。
- 最终错误的 message、stack 和可枚举字段均不包含传入的 Data URL。

**Step 2: 运行测试确认红灯**

Run: `node --test tests/qwen-client.test.js`

Expected: FAIL，原因是 `api/qwen-client.js` 尚不存在或导出尚未实现。

**Step 3: 实现最小客户端**

`api/qwen-client.js` 至少导出：

```js
export class QwenClientError extends Error {}
export function loadQwenClientConfig(env = process.env) {}
export function buildQwenRequest({ model, image, prompt }) {}
export function createQwenClient({ env = process.env, fetchImpl = fetch, now = Date.now } = {}) {}
```

实现规则：

- 不在模块中出现任何具体模型名。
- `createQwenClient().generate({ model, image, prompt })` 返回上游 JSON payload。
- 每次 `generate` 建立一个总 deadline；重试复用剩余时间，不把每次尝试重置为完整 60 秒。
- 只对网络错误、408、429、5xx 重试。
- 不把请求 body、图片、API Key、上游原始响应拼入错误对象。

**Step 4: 运行测试确认绿灯**

Run: `node --test tests/qwen-client.test.js`

Expected: PASS。

### Task 3: 先测试纯模型路由

**Files:**
- Create: `tests/model-router.test.js`
- Create: `api/model-router.js`

**Step 1: 写路由失败测试**

覆盖以下表格中的每个行为：

| 场景 | 预期调用 | 预期 meta |
| --- | --- | --- |
| `normal` 主模型成功 | primary 一次 | `fallbackUsed: false` |
| `normal` 主模型抛可复查错误 | primary 后 fallback | `fallbackUsed: true` |
| `normal` 主结果验证失败 | primary 后 fallback | `fallbackUsed: true` |
| `normal` 主模型抛配置/鉴权错误 | 仅 primary | 抛原错误 |
| `high_accuracy` | 仅 high accuracy | `fallbackUsed: false` |
| 非法 mode | 不调用模型 | 抛配置错误 |

环境变量测试只使用假值：

```js
const env = {
  QWEN_PRIMARY_MODEL: 'primary-test-model',
  QWEN_FALLBACK_MODEL: 'review-test-model',
  QWEN_HIGH_ACCURACY_MODEL: 'accuracy-test-model'
};
```

**Step 2: 运行测试确认红灯**

Run: `node --test tests/model-router.test.js`

Expected: FAIL，原因是 `api/model-router.js` 尚不存在或导出尚未实现。

**Step 3: 实现纯路由器**

`api/model-router.js` 至少导出：

```js
export function loadModelRoutingConfig(env = process.env) {}
export function shouldUseFallback(error) {}
export async function routeModelRequest({
  mode = 'normal',
  models,
  invokeModel,
  validateResult = () => true,
  now = Date.now
}) {}
```

`invokeModel` 接收 `{ model, attempt }`，其中 `attempt` 为 `primary`、`fallback` 或 `high_accuracy`。路由返回：

```js
{
  result,
  meta: {
    model: selectedModel,
    fallbackUsed: boolean,
    latencyMs: nonNegativeInteger
  }
}
```

**Step 4: 运行测试确认绿灯**

Run: `node --test tests/model-router.test.js`

Expected: PASS。

### Task 4: 先测试 OCR 业务编排与解析失败复查

**Files:**
- Create: `tests/ocr-service.test.js`
- Modify: `api/ocr-service.js:1-128`

**Step 1: 写服务失败测试**

通过注入 `fetchImpl`、`env` 和确定性的 `now` 覆盖：

```js
test('recognizeInvoiceFromImage returns root invoice fields with technical meta', async () => {
  // fake fetch returns one valid native DashScope payload
  const result = await recognizeInvoiceFromImage({ image, env, fetchImpl, now });
  assert.equal(result.d, '2026-07-05');
  assert.equal(result.meta.model, 'primary-test-model');
  assert.equal(result.meta.fallbackUsed, false);
  assert.ok(result.meta.latencyMs >= 0);
});
```

再覆盖：

- 首轮返回无 JSON 文本时，第二次请求使用 fallback 模型。
- 两次请求的图片完全相同。
- fallback 请求提示词包含“重新独立查看原图”和关键财务字段，不包含首轮原始输出。
- 注入的 `validateResult` 返回 false 时触发 fallback。
- `high_accuracy` 只使用增强识别模型。

**Step 2: 运行测试确认红灯**

Run: `node --test tests/ocr-service.test.js`

Expected: FAIL，因为当前服务仍硬编码旧模型且不支持路由。

**Step 3: 重构服务而不引入 Schema**

将 `recognizeInvoiceFromImage` 改为以下依赖注入边界：

```js
export async function recognizeInvoiceFromImage({
  image,
  mode = 'normal',
  env = process.env,
  fetchImpl = fetch,
  validateResult = () => true,
  now = Date.now
}) {}
```

保留并导出 `QWEN_OCR_PROMPT`、`OCR_PROMPT_VERSION`、`extractJsonObject`；删除 `OCR_MODEL_VERSION`。标准和复查提示词共用一份字段定义，复查只增加核对指令。

**Step 4: 运行服务与已有解析测试**

Run: `node --test tests/ocr-service.test.js tests/self-hosting.test.js tests/ocr-core.test.js`

Expected: PASS。

### Task 5: 先测试两个 `/api/ocr` 入口传递 mode

**Files:**
- Create: `tests/ocr-api.test.js`
- Modify: `tests/self-hosting.test.js:64-90`
- Modify: `api/ocr.js:6-25`
- Modify: `server.js:146-183`

**Step 1: 写入口失败测试**

- Vercel handler 测试：请求 `{ image, mode: "high_accuracy" }`，注入或模块替身确认服务收到相同 mode。
- 自托管测试：向 `/api/ocr` POST 相同 body，注入的 `ocrService` 记录并返回 mode。
- 缺省 mode 测试：两入口都传入 `normal`。

**Step 2: 运行测试确认红灯**

Run: `node --test tests/ocr-api.test.js tests/self-hosting.test.js`

Expected: FAIL，因为当前入口丢弃 `mode`。

**Step 3: 实现透传**

入口只做以下最小变化：

```js
const { image, mode = 'normal' } = body;
const result = await ocrService({ image, mode, request: req });
```

不要在本任务加入 Token、Content-Type、Data URL 或统一日志校验。

**Step 4: 运行入口测试确认绿灯**

Run: `node --test tests/ocr-api.test.js tests/self-hosting.test.js`

Expected: PASS。

### Task 6: 先测试浏览器请求与缓存模型元数据

**Files:**
- Modify: `tests/ocr-core.test.js:108-156`
- Modify: `js/utils/ocrClient.js:1-5,306-455`

**Step 1: 写浏览器兼容失败测试**

增加一次缓存未命中的网络流程测试，断言：

```js
assert.deepEqual(JSON.parse(fetchOptions.body), {
  image: 'data:image/jpeg;base64,abc',
  mode: 'normal'
});
assert.equal(savedMeta.modelVersion, 'primary-test-model');
```

再调用 `processInvoiceFile(..., { mode: 'high_accuracy' })`，断言请求体保留该 mode。

**Step 2: 运行测试确认红灯**

Run: `node --test tests/ocr-core.test.js`

Expected: FAIL，因为当前请求不发送 mode，缓存仍使用旧模型常量。

**Step 3: 实现兼容层**

- 删除浏览器 `OCR_MODEL_VERSION` 常量。
- 请求体发送 `mode: options.mode || 'normal'`。
- `saveCachedOcrResult` 使用 `data.meta?.model || ''`。
- OCR 结果字段仍从响应根级读取；不要把 `meta` 渲染到 UI。
- 将浏览器 OCR 总等待时间调整为能覆盖两个 60 秒模型预算的保守值，并同步修正仅供开发者阅读的控制台说明。

**Step 4: 运行浏览器核心测试确认绿灯**

Run: `node --test tests/ocr-core.test.js`

Expected: PASS。

### Task 7: 补齐环境模板与设计决策记录

**Files:**
- Create: `.env.production.example`
- Modify: `.env.example`
- Modify: `docs/open-questions.md`
- Add: `docs/plans/2026-07-05-phase-1-model-routing-design.md`
- Add: `docs/plans/2026-07-05-phase-1-model-routing-implementation.md`

**Step 1: 写生产环境模板**

使用设计文档第 6 节的完整键值。不要加入真实 API Key 或 Token。

**Step 2: 同步本地模板**

`.env.example` 保留 `PORT` 和 `HOST`，并加入相同的 Qwen 配置键，确保当前 `server.js` 可以按示例启动。

**Step 3: 核对开放问题状态**

确认 Q-002 已记录“原压缩图独立复查”，Q-004 已记录 Phase 1/2 的分阶段验收，不把仍开放的 Q-001 提前关闭。

### Task 8: 完整验证与独立 review

**Files:**
- Verify only: Phase 1 全部变更

**Step 1: 运行完整测试**

Run: `npm test`

Expected: 全部测试通过，且测试数高于基线 15。

**Step 2: 检查模型硬编码**

Run: `rg -n "qwen-vl-max-latest|qwen3-vl-flash|qwen3\\.7-plus|qwen3-vl-plus" api js server.js tests`

Expected: 无输出。具体模型名只允许出现在 `.env*.example` 和文档中。

**Step 3: 检查 JSON Mode 与 thinking**

Run: `rg -n "response_format|enable_thinking|result_format" api tests`

Expected: 客户端实现和测试同时命中三项配置。

**Step 4: 检查潜在图片日志泄漏**

Run: `rg -n "console\\.(log|error|warn).*?(image|base64|body)|JSON\\.stringify\\(.*image" api server.js`

Expected: 不存在把图片、请求体或 base64 交给日志的代码。请求序列化本身可以存在，但不得位于 console 调用中。

**Step 5: 检查格式与变更边界**

Run: `git diff --check`

Expected: 无输出。

Run: `git diff -- api/qwen-client.js api/model-router.js api/ocr-service.js api/ocr.js server.js js/utils/ocrClient.js tests .env.example .env.production.example docs/open-questions.md docs/plans/2026-07-05-phase-1-model-routing-design.md docs/plans/2026-07-05-phase-1-model-routing-implementation.md`

Expected: 只包含 Phase 1 路由、兼容接线、测试和规划文档。

**Step 6: 启动独立 review 子线程**

Review prompt 必须要求：

- 对照 Phase 1 七条原始要求逐项找证据。
- 检查 Phase 2/3/4 是否被越界提前实现。
- 检查双入口、缓存模型元数据、错误分类和 base64 泄漏。
- 只读审查，不修改文件。

若 review 发现问题，回到相应测试任务先补红灯测试，再修实现并重跑全部验证。

### Task 9: Phase 1 单独提交

**Files:**
- Stage exactly: `.env.example`
- Stage exactly: `.env.production.example`
- Stage exactly: `api/qwen-client.js`
- Stage exactly: `api/model-router.js`
- Stage exactly: `api/ocr-service.js`
- Stage exactly: `api/ocr.js`
- Stage exactly: `server.js`
- Stage exactly: `js/utils/ocrClient.js`
- Stage exactly: `js/utils/storageRepository.js`
- Stage exactly: `tests/qwen-client.test.js`
- Stage exactly: `tests/model-router.test.js`
- Stage exactly: `tests/ocr-service.test.js`
- Stage exactly: `tests/ocr-api.test.js`
- Stage exactly: `tests/phase1-browser.test.js`
- Stage exactly: `tests/phase1-self-hosting.test.js`
- Stage exactly: `docs/open-questions.md`
- Stage exactly: `docs/plans/2026-07-05-phase-1-model-routing-design.md`
- Stage exactly: `docs/plans/2026-07-05-phase-1-model-routing-implementation.md`

**Step 1: 精确暂存**

Run: `git add <上列精确路径>`

Expected: 不暂存 `.DS_Store`、UI 组件、导出、打印、品牌资源或其他既有改动。

说明：`tests/ocr-core.test.js` 与 `tests/self-hosting.test.js` 是 Phase 1 开始前已经存在的未跟踪测试基线，并混有依赖未提交 UI / 页面内容的断言。本阶段使用两份自包含测试替代它们进入提交，以保证 staged snapshot 可以独立验证。

**Step 2: 检查 staged 文件与 staged diff**

Run: `git diff --cached --name-only`

Expected: 仅为上列 Phase 1 文件。

Run: `git diff --cached --check`

Expected: 无输出。

**Step 3: 最后一次运行完整测试**

Run: `npm test`

Expected: 全部通过。

**Step 4: 由幕僚长线程提交**

```bash
git commit -m "feat: add configurable Qwen model routing"
```

**Step 5: 提交后确认边界**

Run: `git show --stat --oneline HEAD`

Expected: HEAD 是 Phase 1 提交，未包含 Phase 2 Schema、Phase 3 安全或 Phase 4 UI 文件。
