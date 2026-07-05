# Phase 2 发票响应校验设计

**日期：** 2026-07-06
**状态：** 已确认方向，等待测试先行实施
**适用阶段：** Phase 2 - Schema 校验

## 1. 目标

在 Phase 1 模型路由之上增加纯 JavaScript 发票响应校验层，统一短键与长键，验证日期、发票号码和金额关系，并生成稳定的 `ready / needs_review / failed` 状态。

本阶段同时完成 Phase 1 预留的“校验失败触发自动复查”闭环，但不引入 Token、安全中间件、UI 重构或构建依赖。

## 2. 方案选择

采用“服务端规范化响应包 + 浏览器双格式适配”方案：

```json
{
  "status": "ready",
  "data": {
    "date": "2026-07-06",
    "invoiceNumber": "12345678",
    "buyerName": "Kairos",
    "sellerName": "示例供应商",
    "amount": 106,
    "tax": 6,
    "subtotal": 100,
    "totalWithTax": 106,
    "description": "办公用品"
  },
  "warnings": [],
  "meta": {
    "model": "<环境变量中的实际模型>",
    "fallbackUsed": false,
    "latencyMs": 3210
  }
}
```

未采用的方案：

1. 根级字段继续追加状态：改动较少，但偏离技术文档中的统一响应建议，后续接口会持续含混。
2. 同时返回根级字段和 `data`：短期兼容最好，但产生两个真值来源，缓存和前端容易读取错层级。
3. 引入 Ajv / Zod：能提供通用 Schema 工具，但会提前触发 Phase 5 的依赖与构建决策。

## 3. 模块职责

### `api/invoice-schema.js`

负责：

- 从 DashScope 原生响应中提取模型文本并解析 JSON 对象。
- 支持短键、当前长键和技术文档中的兼容别名。
- 规范化字符串、日期和数字。
- 校验关键字段与金额关系。
- 生成 `warnings` 和最终状态。
- 提供用于模型路由的 `shouldRecheckInvoice` 判定。

不负责：

- 发起模型请求。
- 选择模型。
- 鉴权、请求体限制或日志。
- 用户界面文案布局。

### `api/model-router.js`

Phase 2 调整验证语义：

- `normal` 的主模型结果不通过验证时触发自动复查。
- 自动复查结果即使仍不完整，也返回给业务层，由 Schema 生成 `needs_review`，不再作为异常丢弃。
- `high_accuracy` 不串联其他模型；结果由 Schema 判定 `ready` 或 `needs_review`。
- 最终模型 JSON 仍无法解析时，路由错误携带安全的技术 `meta`，供业务层生成 `failed` 响应。

### `api/ocr-service.js`

负责串联：

```text
模型原始响应
→ invoice-schema 解析与规范化
→ model-router 判断是否自动复查
→ 对最终结果再次评估
→ { status, data, warnings, meta }
```

仅当最终失败属于“模型返回无法解析”时生成结构化 `failed`。鉴权、配置、网络等服务故障仍交给 HTTP 入口的安全错误响应，不伪装成识别结果。

### 浏览器兼容层

`js/utils/ocrClient.js` 同时支持：

- Phase 2 新响应：读取 `response.data`、`response.status`、`response.warnings`、`response.meta`。
- 旧缓存或历史数据：继续把根级发票字段作为数据读取。

Schema warning code 会转换为已有 `warningFlags`，界面只显示中文说明，不显示 `schema`、JSON 或模型名。

## 4. 规范字段与别名

规范字段沿用当前应用的数据模型，避免破坏 Excel、打印和 IndexedDB：

| 规范字段 | 支持输入键 |
| --- | --- |
| `date` | `date`, `d` |
| `invoiceNumber` | `invoiceNumber`, `invoiceNo`, `n` |
| `buyerName` | `buyerName`, `buyer`, `b` |
| `sellerName` | `sellerName`, `seller`, `m` |
| `category` | `category`, `c` |
| `itemName` | `itemName`, `i` |
| `specification` | `specification`, `g` |
| `unit` | `unit`, `u` |
| `quantity` | `quantity`, `q` |
| `unitPrice` | `unitPrice`, `p` |
| `amount` | `amount`, `t` |
| `taxRate` | `taxRate`, `r` |
| `tax` | `tax`, `x` |
| `subtotal` | `subtotal`, `y` |
| `totalWithTax` | `totalWithTax`, `total`, `w` |
| `remarks` | `remarks`, `k` |
| `description` | `description`, `summary`, `s` |

短键优先级不高于规范长键；同一对象同时存在时，规范长键优先，避免旧短键覆盖业务层已修正值。

## 5. 规范化规则

### 日期

- 接受 `YYYY-MM-DD`、`YYYY/M/D`、`YYYY.M.D`、`YYYY年M月D日`。
- 输出统一为 `YYYY-MM-DD`。
- 必须通过真实日历校验，例如 `2026-02-30` 无效。

### 发票号码

- 转为字符串并去除首尾空白。
- 内部空白压缩移除，但不删除字母、连字符或其他可能属于票号的字符。
- 缺失或明显过短/过长时生成 warning，不擅自改写票号。

### 数字

- 接受数字或带 `¥`、`￥`、千位逗号和空格的字符串。
- 金额输出为两位精度以内的非负数。
- 无法解析、负数或非有限数视为无效；显式负数保留在规范数据中供用户核对，不参与缺失值补全，并生成 warning。
- `taxRate` 保留字符串形式，不在本阶段反推税额。

### 金额补全

- `amount` 与 `totalWithTax` 在当前业务中都表示最终含税金额。
- 仅有其中一个时，用现有值补全另一个，不生成“缺失总额”warning。
- `subtotal` 缺失但最终金额与税额有效时，可计算 `subtotal = totalWithTax - tax`。
- 不覆盖两个均存在但互相冲突的原值。

## 6. warnings

warning 使用稳定对象：

```json
{
  "code": "missing_date",
  "field": "date",
  "message": "发票日期缺失"
}
```

本阶段定义：

| code | 条件 | 用户语言 |
| --- | --- | --- |
| `unreadable_response` | 两次模型输出均无法解析 | 暂时没有识别成功 |
| `missing_date` | 日期缺失 | 发票日期缺失 |
| `invalid_date` | 日期格式或日期本身无效 | 发票日期需要确认 |
| `missing_invoice_number` | 发票号码缺失 | 发票号码缺失 |
| `invalid_invoice_number` | 号码长度明显异常 | 发票号码需要确认 |
| `missing_amount` | 最终含税金额缺失 | 发票金额缺失 |
| `invalid_amount` | 金额无法解析或为负数 | 发票金额需要确认 |
| `invalid_tax` | 税额无法解析、为负或大于总额 | 税额需要确认 |
| `amount_total_mismatch` | `amount` 与 `totalWithTax` 相差超过 0.02 元 | 金额与价税合计不一致 |
| `subtotal_tax_mismatch` | `subtotal + tax` 与总额相差超过 0.02 元 | 金额与税额关系需要确认 |

warning 不包含模型名、JSON、Schema 或其他用户不需要理解的工程词。

## 7. 状态判定

- `ready`：模型输出可解析，关键字段存在，金额关系无 warning。
- `needs_review`：输出可解析，但存在一个或多个 warning。
- `failed`：标准识别与自动复查最终都无法得到可解析对象。

状态只表达处理结果，不代表绝对准确。

## 8. 自动复查

`mode=normal`：

1. 主模型输出解析并评估。
2. 只要状态不是 `ready`，使用同一张压缩图片自动复查。
3. 自动复查结果无 warning 时返回 `ready`。
4. 自动复查结果仍有 warning 时返回 `needs_review`。
5. 两次均无法解析时返回 `failed`。

`mode=high_accuracy`：

- 只调用增强识别模型。
- 可解析但有 warning 时直接返回 `needs_review`。
- 无法解析时返回 `failed`。

## 9. 缓存兼容

- OCR cache 的发票字段仍使用规范长键。
- 缓存额外保存 `status`、`warningFlags` 和安全的识别元数据，以便恢复后保持“建议检查”状态。
- 旧缓存没有这些字段时继续使用浏览器本地缺失字段检查。
- 不改变 IndexedDB store 名称、主键或读取优先级。

## 10. Phase 2 验收标准

1. 可解析短键和长键 JSON，并输出同一规范数据。
2. 日期、发票号、金额、税额、总额均有确定校验。
3. warning 结构、代码和中文说明稳定。
4. 生成 `ready / needs_review / failed`。
5. 主模型校验失败触发自动复查。
6. 自动复查仍不完整时返回 `needs_review`，不丢失可编辑数据。
7. 两次 JSON 解析失败时返回 `failed`。
8. 浏览器同时兼容新响应与旧缓存。
9. IndexedDB、Excel、打印、PDF.js 和图像处理链路不变。
10. 不新增第三方依赖。
