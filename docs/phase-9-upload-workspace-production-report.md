# Phase 9：上传工作区识别状态机生产落地报告

> 阶段：**Phase 9**
> 日期：2026-07-08
> 参考：`kairos-upload-workspace-production-reference-demo-v14.html`

## 1. 修改文件

| 文件 | 变更说明 |
|------|----------|
| `js/components/UploadZone.js` | 重写为三层工作区（idle / processing / complete overlay），接入 `data-workspace-state` 与 `data-status` 状态机 |
| `js/utils/uploadWorkspaceState.js` | **新增** 纯函数状态映射、批次统计、完成摘要文案 |
| `css/style.css` | 合并 Phase 9 upload token、扫描光、文字流光、完成覆盖层样式；浅色黑进度条 / 深色白进度条 |
| `index.html` | 队列项保存 `file` 引用；`handleEnhanceFailed` / `handleWorkspaceIdle`；移除 3 秒自动清空队列 |
| `tests/phase9-upload-workspace.test.js` | **新增** Phase 9 状态机与增强识别测试 |
| `tests/phase8-theme.test.js` | 更新上传区 token / 结构断言 |
| `tests/phase4-ux.test.js` | 更新状态文案来源与「识别完成」用语 |

## 2. 状态映射

### 2.1 容器级 `data-workspace-state`

| 值 | 触发条件 |
|----|----------|
| `idle` | 无队列或覆盖层淡出完成 |
| `processing` | 有队列且存在非最终态文件，或 `isProcessing` |
| `enhancing` | `isEnhancing` 或失败项正在增强识别 |
| `complete` | 全部文件进入最终态，显示完成覆盖层 |
| `resetting` | 自动淡出或点击「继续上传」后的过渡态 |

### 2.2 文件级 `data-status`（OCR 管道 → UI）

| OCR / 队列状态 | `data-status` | 用户文案 |
|----------------|---------------|----------|
| `waiting` / `queued` | `pending` | 等待识别 |
| `preparing` / `processing` | `processing` | 正在识别 |
| `processing` 超过 3.5s | `auto_reviewing` | 正在自动复查 |
| `completed` + `ready` | `done` | 识别完成 |
| `completed` + `needs_review` 或 `needs_review` | `review` | 建议检查 |
| `failed` | `failed` | 识别失败 |
| 增强识别中 `displayStatus: enhancing` | `enhancing` | 正在增强识别 |
| `cancelled` | `cancelled`（终态，不计入失败统计） | — |

> **说明**：`auto_reviewing` 为过程态。当单文件识别超过 3.5 秒时前端展示，表示可能进入后端自动复查路径；不伪造最终态。

## 3. 浅色 / 深色主题结果

| 项目 | 浅色 `html[data-theme="light"]` | 深色 `html[data-theme="dark"]` |
|------|--------------------------------|--------------------------------|
| Idle 卡片 | 近白底、灰色虚线边框、深色标题 | 深底、浅色虚线、浅色标题 |
| Processing 扫描光 | 增强暖金/冷蓝扫描层（`opacity: 0.82`） | 克制扫描光（`opacity: 0.24`） |
| 进度条 | **黑色** `#0f1012` | **白色** `#ffffff` |
| 文字流光 | 8s `upload-text-sheen` | 同左 |
| 完成覆盖层 | 半透明黑底 + 白字 | 同左 |

## 4. 三种完成态行为

### 4.1 全部成功（`failed=0` 且 `review=0`）

- 标题：**识别完成**
- 摘要：`N 份已完成。`
- 无文件列表、无按钮
- 约 **1.6s** 后自动淡出 → `resetting` → `idle`

### 4.2 仅建议检查（`failed=0` 且 `review>0`）

- 标题：**识别完成**
- 摘要：`N 份已完成，M 份建议检查。`
- 列出建议检查文件名（最多 4 个 + 溢出提示）
- **无按钮**
- 约 **3.6s** 后自动淡出

### 4.3 存在失败（`failed>0`）

- 标题：**识别已结束**
- 摘要：`N 份已完成，M 份建议检查，K 份失败。`
- 分组列出建议检查 / 识别失败文件名
- **常驻**，显示：
  - **增强识别失败项**
  - **继续上传**

## 5. 增强识别失败项行为

1. 仅从当前 `processingQueue` 筛选 `pipelineStatus === 'failed'` 的项
2. 使用队列中保存的 `item.file`，**不**调用 `processBatchFiles` 重扫全批
3. 设置 `isEnhancing` + `displayStatus: enhancing`，工作区进入 `enhancing`
4. 对每项调用现有 `processInvoiceFile(..., { mode: 'high_accuracy' })`
5. 结果写回 `processingQueue` 与 `items` 表格
6. 增强结束后重新统计；若无失败则按成功/建议检查规则自动淡出；若仍有失败则继续常驻并保留按钮

「继续上传」仅关闭覆盖层、清空队列视觉状态，**不清空**已写入表格的识别结果。

## 6. 测试结果

```text
npm test                          → 193 pass, 0 fail
node --test tests/phase8-theme.test.js  → 13 pass, 0 fail
node --test tests/phase4-ux.test.js     → 25 pass, 0 fail
git diff --check                  → 通过（无冲突标记）
```

## 7. 未改动的核心链路（确认）

以下模块 **未修改**：

- `js/utils/ocrClient.js` 识别核心与 `processBatchFiles` / `processInvoiceFile` 签名
- `api/ocr-service.js`、`api/model-router.js` 模型路由
- `/api/ocr` 鉴权与 DashScope 配置
- Excel 导出（`exportManager.js`）、`print.html`
- `server.js`、Docker / Nginx 部署配置
- localStorage 敏感信息策略
- 表格筛选、高亮、待处理视图（未新增）

## 8. 已知说明

- `auto_reviewing` 为基于识别耗时的前端过程提示，非 OCR API 显式事件；与参考 demo 接入建议一致。
- 取消全部识别后约 0.8s 清空队列，避免 cancelled 项误触发失败覆盖层。
