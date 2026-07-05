# Phase 2 Invoice Schema Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为 Kairos-Finance 增加发票 JSON 解析、短长键统一、关键字段与金额关系校验、稳定状态响应，并把校验失败自动复查接入 Phase 1 模型路由。

**Architecture:** 新增无第三方依赖的 `api/invoice-schema.js`，把模型原始响应转换为规范发票数据和 warnings。`ocr-service` 输出 `{status,data,warnings,meta}`，`model-router` 只用主结果校验决定是否复查，浏览器适配新响应并继续兼容旧缓存。

**Tech Stack:** Node.js ESM、原生 JavaScript、Node test runner、现有 DashScope 模型路由、浏览器经典脚本、Dexie OCR cache

---

## 执行约束

- 先读 `docs/plans/2026-07-06-phase-2-invoice-schema-design.md`。
- 使用 `superpowers:test-driven-development`，每一组行为先测试失败，再写最小实现。
- 不新增 npm 依赖，不修改构建系统。
- 不实现 Phase 3 Token / security / logger，不进行 Phase 4 UI 组件重构。
- 不改变 IndexedDB store、ExcelJS、`print.html`、PDF.js 或 Worker。
- 当前仍有无关工作树改动；禁止 reset、checkout 覆盖和 `git add .`。

### Task 1: 固定 Phase 2 基线

**Files:**
- Read: `api/model-router.js`
- Read: `api/ocr-service.js`
- Read: `js/utils/ocrClient.js`
- Read: `tests/model-router.test.js`
- Read: `tests/ocr-service.test.js`
- Read: `tests/phase1-browser.test.js`

**Step 1: 核对提交与工作树**

Run: `git log -2 --oneline && git status --short`

Expected: HEAD 包含 Phase 1 commit `3aa7ce9`；无关用户改动仍存在但未暂存。

**Step 2: 运行完整基线**

Run: `npm test`

Expected: 56/56 通过。

### Task 2: 测试并实现模型 JSON 解析与字段映射

**Files:**
- Create: `tests/invoice-schema.test.js`
- Create: `api/invoice-schema.js`

**Step 1: 写失败测试**

覆盖：

```js
test('parseInvoiceModelPayload maps short and long aliases to canonical fields', () => {
  const parsed = parseInvoiceModelPayload(createPayload(JSON.stringify({
    d: '2026/7/6',
    n: ' 1234 5678 ',
    buyer: 'Kairos',
    m: '供应商',
    t: '￥1,060.00',
    x: '60',
    y: '1000',
    total: '1060',
    summary: '办公用品'
  })));

  assert.equal(parsed.date, '2026-07-06');
  assert.equal(parsed.invoiceNumber, '12345678');
  assert.equal(parsed.buyerName, 'Kairos');
  assert.equal(parsed.sellerName, '供应商');
  assert.equal(parsed.amount, 1060);
  assert.equal(parsed.totalWithTax, 1060);
});
```

再覆盖：

- 规范长键优先于短键。
- 支持 `buyer/seller/total/summary` 兼容别名。
- JSON code fence 或前后少量文字仍可提取对象。
- 无对象、数组根值或畸形 JSON 抛出 `OCR_RESPONSE_ERROR` 且 `canFallback=true`。
- 输出包含所有规范字段和稳定默认类型。

**Step 2: 运行测试确认红灯**

Run: `node --test tests/invoice-schema.test.js`

Expected: FAIL，`api/invoice-schema.js` 尚不存在。

**Step 3: 写最小解析实现**

至少导出：

```js
export class InvoiceResponseError extends Error {}
export const CANONICAL_INVOICE_FIELDS = [];
export function createEmptyInvoice() {}
export function parseInvoiceModelPayload(payload) {}
export function normalizeInvoiceObject(value) {}
```

字段优先级为规范长键、兼容长键、短键。错误对象不得保存模型原文。

**Step 4: 运行测试确认绿灯**

Run: `node --test tests/invoice-schema.test.js`

Expected: PASS。

### Task 3: 测试并实现关键字段与金额关系校验

**Files:**
- Modify: `tests/invoice-schema.test.js`
- Modify: `api/invoice-schema.js`

**Step 1: 写日期与号码失败测试**

覆盖：

- `2026-02-30` → `invalid_date`。
- 空日期 → `missing_date`。
- 空票号 → `missing_invoice_number`。
- 明显过短/过长票号 → `invalid_invoice_number`。

**Step 2: 运行红灯并实现**

Run: `node --test tests/invoice-schema.test.js`

Expected: FAIL，warning 尚未生成。

实现真实日历校验和保守票号长度检查，再重跑至 PASS。

**Step 3: 写金额失败测试**

覆盖：

- `amount` 与 `totalWithTax` 相差大于 0.02。
- `subtotal + tax` 与总额相差大于 0.02。
- 税额为负或大于总额。
- 金额字符串无法解析或为负数。
- 仅有 `amount` 时补全 `totalWithTax`。
- `subtotal` 缺失时按总额减税额补全。

**Step 4: 运行红灯并实现**

至少导出：

```js
export function validateInvoiceData(data) {}
export function evaluateInvoice(value) {}
export function shouldRecheckInvoice(value) {}
```

`evaluateInvoice` 返回：

```js
{
  status: 'ready' | 'needs_review',
  data: canonicalInvoice,
  warnings: [{ code, field, message }]
}
```

Run: `node --test tests/invoice-schema.test.js`

Expected: PASS。

### Task 4: 调整路由的最终无效结果语义

**Files:**
- Modify: `tests/model-router.test.js`
- Modify: `api/model-router.js`

**Step 1: 写失败测试**

新增：

```js
test('normal mode returns an invalid fallback result for business review', async () => {
  // primary invalid -> fallback invalid
  // expected: fallback result + fallbackUsed true, no throw
});

test('high_accuracy returns an invalid result without another model', async () => {
  // expected: high accuracy result + meta, no throw
});
```

再断言最终模型抛错时，错误携带不含图片的 `routingMeta`。

**Step 2: 运行红灯**

Run: `node --test tests/model-router.test.js`

Expected: FAIL，当前 fallback/high_accuracy 校验失败会抛 `RESULT_VALIDATION_ERROR`。

**Step 3: 最小调整**

- `validateResult` 只决定 `normal` 主结果是否进入 fallback。
- fallback 与 high accuracy 的可解析结果总是返回。
- 最终模型异常附加 `{model,fallbackUsed,latencyMs}`，不附加输入或原始响应。

**Step 4: 运行绿灯与 Phase 1 回归**

Run: `node --test tests/model-router.test.js tests/ocr-service.test.js`

Expected: PASS。

### Task 5: 将 Schema 接入 OCR service

**Files:**
- Modify: `tests/ocr-service.test.js`
- Modify: `api/ocr-service.js`

**Step 1: 把成功响应测试改为正式 envelope**

断言：

```js
assert.deepEqual(Object.keys(result).sort(), ['data', 'meta', 'status', 'warnings']);
assert.equal(result.status, 'ready');
assert.equal(result.data.invoiceNumber, 'INV-001');
```

**Step 2: 写校验失败复查测试**

- primary 缺日期或金额冲突 → fallback。
- fallback 修复 → `ready`。
- fallback 仍不完整 → `needs_review`，保留可编辑数据和 warnings。
- high accuracy 不完整 → `needs_review`，不调用其他模型。

**Step 3: 写最终解析失败测试**

- normal 两次 JSON parse 失败 → HTTP 业务结果 `failed`，warning 为 `unreadable_response`，meta 指向 fallback。
- high accuracy parse 失败 → `failed`，meta 指向增强模型。
- 网络、鉴权和配置错误仍抛出，不伪装为 `failed`。

**Step 4: 运行红灯**

Run: `node --test tests/ocr-service.test.js`

Expected: FAIL，当前 service 返回根级字段且未调用 Schema。

**Step 5: 实现并运行绿灯**

- 删除 service 内重复 JSON 提取逻辑，改用 `invoice-schema.js`。
- 使用 `shouldRecheckInvoice` 作为路由验证函数。
- 最终可解析结果调用 `evaluateInvoice`。
- 仅捕获 `OCR_RESPONSE_ERROR` 生成 `failed` envelope。

Run: `node --test tests/invoice-schema.test.js tests/model-router.test.js tests/ocr-service.test.js tests/qwen-client.test.js`

Expected: PASS。

### Task 6: 浏览器适配响应包并保留缓存状态

**Files:**
- Create: `tests/phase2-browser.test.js`
- Modify: `js/utils/ocrClient.js`

**Step 1: 写失败测试**

覆盖：

- `{status,data,warnings,meta}` 被正确转换为发票行。
- `needs_review` 和 warning codes 保留到 `warningFlags`。
- `failed` envelope 生成 failed 行，不当作 ready。
- `fallbackUsed` 和模型信息只保存为内部识别元数据，不出现在摘要字段。
- cache 保存并恢复 `status`、`warningFlags`、`recognitionMeta`。
- 旧根级响应和没有状态的旧缓存仍兼容。

**Step 2: 运行红灯**

Run: `node --test tests/phase2-browser.test.js`

Expected: FAIL，当前浏览器把 envelope 当作发票字段根对象。

**Step 3: 实现适配**

- 增加纯函数 `unwrapOcrResponse(response)`。
- `processOCRResponse` 使用规范 data，并把 warning code 与 status 传入 `normalizeInvoiceItem`。
- `buildCachePayload` 保存状态、warningFlags 和内部识别元数据。
- warning label 使用中文，不直接显示工程词。

**Step 4: 运行浏览器回归**

Run: `node --test tests/phase1-browser.test.js tests/phase2-browser.test.js`

Expected: PASS。

### Task 7: 编写响应契约文档

**Files:**
- Create: `docs/ocr-response-schema.md`
- Add: `docs/plans/2026-07-06-phase-2-invoice-schema-design.md`
- Add: `docs/plans/2026-07-06-phase-2-invoice-schema-implementation.md`

**Step 1: 文档化成功、建议检查和失败响应**

必须包含三个完整 JSON 示例、字段表、warning 表和 meta 说明。

**Step 2: 文档化兼容与边界**

说明：

- 浏览器兼容旧根级响应与旧缓存。
- `ready` 不代表绝对准确。
- 技术 meta 不直接展示给用户。
- HTTP 服务故障与业务 `failed` 的区别。

**Step 3: 检查禁用用户语言**

文档可以解释技术字段，但示例中的 `warnings[].message` 不得包含 fallback、schema、JSON、MD5、IndexedDB、DashScope、model。

### Task 8: 完整验证与独立 review

**Files:**
- Verify: Phase 2 全部文件

**Step 1: 运行完整测试**

Run: `npm test`

Expected: Phase 1 的 56 项和新增 Phase 2 测试全部通过。

**Step 2: 静态边界检查**

Run: `git diff --check`

Expected: 无输出。

Run: `rg -n "new Dexie|ExcelJS|print\.html|pdfjsLib|OffscreenCanvas" api/invoice-schema.js api/ocr-service.js api/model-router.js`

Expected: 无新增跨层依赖。

**Step 3: 启动规格 review 子线程**

逐项核对 Phase 2 六项原始要求、正式响应包、自动复查和缓存兼容；只读，不修改。

**Step 4: 启动代码质量 review 子线程**

在规格 review 通过后检查日期/金额边界、错误吞噬、warning 重复、缓存兼容和测试假阳性。

发现问题必须回到测试先行修复，再复审。

### Task 9: Phase 2 单独提交

**Files:**
- Stage exactly: `api/invoice-schema.js`
- Stage exactly: `api/model-router.js`
- Stage exactly: `api/ocr-service.js`
- Stage exactly: `js/utils/ocrClient.js`
- Stage exactly: `tests/invoice-schema.test.js`
- Stage exactly: `tests/model-router.test.js`
- Stage exactly: `tests/ocr-service.test.js`
- Stage exactly: `tests/ocr-api.test.js`
- Stage exactly: `tests/phase1-self-hosting.test.js`
- Stage exactly: `tests/phase2-browser.test.js`
- Stage exactly: `docs/ocr-response-schema.md`
- Stage exactly: `docs/plans/2026-07-06-phase-2-invoice-schema-design.md`
- Stage exactly: `docs/plans/2026-07-06-phase-2-invoice-schema-implementation.md`

**Step 1: 精确暂存并检查**

Run: `git add <上列精确路径>`

Run: `git diff --cached --name-only && git diff --cached --check`

Expected: 只包含 Phase 2 文件，无 UI 组件、安全、部署或构建文件。

**Step 2: 验证 staged snapshot**

把 Git index 导出到临时目录，运行 Phase 1 + Phase 2 自包含测试与 `node --check`。

Expected: 全部通过。

**Step 3: 提交**

```bash
git commit -m "feat: validate structured invoice responses"
```

**Step 4: 提交后确认**

Run: `git show --stat --oneline HEAD && git status --short`

Expected: HEAD 仅为 Phase 2 提交；原有无关工作树改动仍保留。
