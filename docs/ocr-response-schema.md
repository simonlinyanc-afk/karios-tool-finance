# OCR 响应契约

**适用版本：** Phase 2
**适用入口：** `POST /api/ocr`

## 1. 目标

OCR 服务端统一返回一个响应包，将可编辑的发票数据、检查结果和技术元数据分层：

```json
{
  "status": "ready",
  "data": {},
  "warnings": [],
  "meta": {}
}
```

`ready` 只表示关键字段和金额关系通过自动检查，不代表内容绝对准确。

## 2. 完整示例

### 2.1 已完成：`ready`

```json
{
  "status": "ready",
  "data": {
    "date": "2026-07-06",
    "invoiceNumber": "12345678",
    "buyerName": "Kairos",
    "sellerName": "示例供应商",
    "category": "办公用品",
    "itemName": "打印耗材",
    "specification": "A4",
    "unit": "批",
    "quantity": 1,
    "unitPrice": 100,
    "amount": 106,
    "taxRate": "6%",
    "tax": 6,
    "subtotal": 100,
    "totalWithTax": 106,
    "remarks": "",
    "description": "办公用品 - 打印耗材"
  },
  "warnings": [],
  "meta": {
    "model": "<实际使用的环境变量值>",
    "fallbackUsed": false,
    "latencyMs": 3210
  }
}
```

### 2.2 建议检查：`needs_review`

```json
{
  "status": "needs_review",
  "data": {
    "date": "2026-02-30",
    "invoiceNumber": "12345678",
    "buyerName": "Kairos",
    "sellerName": "示例供应商",
    "category": "办公用品",
    "itemName": "打印耗材",
    "specification": "",
    "unit": "",
    "quantity": 1,
    "unitPrice": 100,
    "amount": 106,
    "taxRate": "6%",
    "tax": 6,
    "subtotal": 100,
    "totalWithTax": 106,
    "remarks": "",
    "description": "办公用品 - 打印耗材"
  },
  "warnings": [
    {
      "code": "invalid_date",
      "field": "date",
      "message": "发票日期需要确认"
    }
  ],
  "meta": {
    "model": "<实际使用的环境变量值>",
    "fallbackUsed": true,
    "latencyMs": 4820
  }
}
```

这类响应保留已识别的可编辑数据，不因个别字段需要确认而丢弃整张发票。

### 2.3 识别失败：`failed`

```json
{
  "status": "failed",
  "data": {
    "date": "",
    "invoiceNumber": "",
    "buyerName": "",
    "sellerName": "",
    "category": "",
    "itemName": "",
    "specification": "",
    "unit": "",
    "quantity": null,
    "unitPrice": null,
    "amount": null,
    "taxRate": "",
    "tax": null,
    "subtotal": null,
    "totalWithTax": null,
    "remarks": "",
    "description": ""
  },
  "warnings": [
    {
      "code": "unreadable_response",
      "field": null,
      "message": "暂时没有识别成功"
    }
  ],
  "meta": {
    "model": "<实际使用的环境变量值>",
    "fallbackUsed": true,
    "latencyMs": 5070
  }
}
```

`failed` 仅用于标准识别和自动复查都没有得到可解析对象的情况。前端应提供“重新识别 / 增强识别 / 手动填写”后续操作。

## 3. `status`

| 值 | 含义 | 用户显示 |
| --- | --- | --- |
| `ready` | 可解析，关键字段和金额关系未发现问题 | 已完成 |
| `needs_review` | 数据可编辑，但存在一个或多个 warning | 建议检查 |
| `failed` | 最终仍无法得到可解析的发票对象 | 识别失败 |

## 4. `data` 字段

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `date` | string | `YYYY-MM-DD`；必须通过真实日历检查 |
| `invoiceNumber` | string | 发票号码，已去除空白 |
| `buyerName` | string | 购买方 |
| `sellerName` | string | 销售方 |
| `category` | string | 报销类别 |
| `itemName` | string | 主要项目名称 |
| `specification` | string | 规格型号 |
| `unit` | string | 单位 |
| `quantity` | number \| null | 数量 |
| `unitPrice` | number \| null | 单价 |
| `amount` | number \| null | 最终含税金额 |
| `taxRate` | string | 税率原始文本 |
| `tax` | number \| null | 税额 |
| `subtotal` | number \| null | 不含税金额 |
| `totalWithTax` | number \| null | 价税合计，通常与 `amount` 相同 |
| `remarks` | string | 备注 |
| `description` | string | 适合报销表格的摘要 |

字段输入可为规范长键、兼容长键或旧短键。同一对象同时存在多种键时，规范长键优先。

## 5. 数值规则

- 金额允许输入数字，或带 `¥`、`￥`、千位逗号和空格的字符串。
- 金额规范到最多两位小数。负数或非有限数不会被当作有效金额；显式负数保留用于核对并生成 warning，不会被另一侧总额覆盖。
- 只有 `amount` 或 `totalWithTax` 时，用已有值补全另一个字段。
- `subtotal` 缺失且总额与税额有效时，可按“总额 - 税额”补全。
- 两个已存在的总额不互相覆盖；差额超过 `0.02` 元时生成 warning。

## 6. `warnings`

warning 使用稳定的 `code / field / message` 结构。`message` 是可用于中文界面的说明；前端仍使用本地对照表，未知 code 统一显示为“建议检查”。

| code | field | 触发条件 | message |
| --- | --- | --- | --- |
| `unreadable_response` | `null` | 两次输出都无法解析 | 暂时没有识别成功 |
| `missing_date` | `date` | 日期缺失 | 发票日期缺失 |
| `invalid_date` | `date` | 格式或真实日历无效 | 发票日期需要确认 |
| `missing_invoice_number` | `invoiceNumber` | 发票号码缺失 | 发票号码缺失 |
| `invalid_invoice_number` | `invoiceNumber` | 长度明显异常 | 发票号码需要确认 |
| `missing_amount` | `amount` | 最终含税金额缺失 | 发票金额缺失 |
| `invalid_amount` | `amount` | 总额无法解析或为负数 | 发票金额需要确认 |
| `invalid_tax` | `tax` | 税额无法解析、为负数或大于总额 | 税额需要确认 |
| `amount_total_mismatch` | `totalWithTax` | 两个总额相差超过 `0.02` 元 | 金额与价税合计不一致 |
| `subtotal_tax_mismatch` | `subtotal` | 不含税金额与税额关系异常 | 金额与税额关系需要确认 |

## 7. `meta`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `model` | string | 实际完成最终结果的环境配置模型名 |
| `fallbackUsed` | boolean | 是否进行了自动复查 |
| `latencyMs` | number | 本次路由总耗时，毫秒 |

`meta` 用于调试、缓存可追溯性和回归测试，不应将其字段名或值直接显示给用户。浏览器只将其保存在内部 `recognitionMeta` 中。

## 8. 自动复查与增强识别

- `mode=normal`：主结果无法解析或存在 warning 时，使用同一张已压缩图片自动复查一次。
- 自动复查仍有 warning 时，返回 `needs_review`，保留可编辑数据。
- `mode=high_accuracy`：只使用增强识别配置；可解析但不完整时直接返回 `needs_review`。

## 9. 兼容策略

- 新浏览器优先读取 `{ status, data, warnings, meta }` 响应包。
- Phase 1 或更旧服务返回根级发票字段时，浏览器继续直接解析。
- 新 OCR 缓存在原有发票字段外保存 `status`、`warningFlags` 和 `recognitionMeta`。
- 旧缓存没有上述字段时，浏览器按现有本地缺失字段规则恢复状态。
- IndexedDB store 名称、主键、查询优先级和现有 OCR 缓存命中流程不变。

## 10. 业务失败与 HTTP 服务错误

`failed` 是 HTTP 成功响应中的业务状态，表示最终没有可解析的发票对象。

以下情况不转换为 `failed`，仍由 HTTP 入口返回安全错误：

- 缺少服务端环境变量。
- 访问密钥无效或权限不足。
- 网络、超时或上游 HTTP 服务故障。
- 请求参数或识别模式无效。

这些错误不伪装成发票识别结果，便于用户重试或管理员检查服务配置。
