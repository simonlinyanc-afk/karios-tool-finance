# Phase 9.1 Upload Workspace QA Patch 完成报告

> 阶段：**Phase 9.1**
> 日期：2026-07-08
> 范围：上传工作区逻辑与无障碍 QA 修复，不新增 UI、不改 OCR / 导出 / 部署链路

## 修改文件

| 文件 | 变更说明 |
|------|----------|
| `js/utils/uploadWorkspaceState.js` | 重写 `mapQueueItemToFileStatus` 优先级；补齐 `FILE_STATUS.CANCELLED` 与 `STATUS_META` |
| `js/components/UploadZone.js` | 按 item 独立 auto-review 定时器；`onContinueUpload` 方案 A 注释 |
| `css/style.css` | Phase 9 `prefers-reduced-motion` 规则；`cancelled` 中性样式；进度条 token 去重 |
| `tests/phase9-upload-workspace.test.js` | 新增 9.1 映射、cancelled、reduced-motion、timer、token 测试 |
| `tests/phase8-theme.test.js` | 进度条断言改为 token + `var(--upload-progress-fill)` |

## 修复内容

### 1. reduced-motion 覆盖

在 `css/style.css` 上传工作区末尾新增 `@media (prefers-reduced-motion: reduce)` 规则，显式停止：

- `.upload-workspace::before` — 边缘光束（`upload-beam-orbit`）
- `.upload-processing::before` — 内部扫描光（`upload-frosted-scan`）
- `.upload-working-title::before/::after` — 标题流光（`upload-text-sheen`）
- `.upload-file-row[data-status="processing|auto_reviewing|enhancing"] .upload-status-icon::before` — 状态图标旋转（`upload-status-spin`）

同时缩短 `.upload-workspace` 内所有 `transition-duration` 为 `0.01ms`。

### 2. mapQueueItemToFileStatus 状态映射清理

重写为两层优先级，移除不可达分支：

1. **resultStatus 优先**（最终业务结果）
   `ready` / `completed_ready` → `done`；`needs_review` / `review` → `review`；`failed` / `error` → `failed`
2. **status 管道态**
   `cancelled` → `cancelled`；`waiting` / `queued` → `pending`；`processing` / `preparing` → `processing`（或 auto_reviewing）；`completed` → `done`

`displayStatus: enhancing` 仍最高优先覆盖。

### 3. cancelled 状态补齐

- `FILE_STATUS.CANCELLED = 'cancelled'`
- `STATUS_META` 文案：**已取消**，中性横杠图标
- CSS：`data-status="cancelled"` 使用 `--upload-state-pending` 灰色，非失败红
- `countBatch`：`cancelled` 计入 `finished`，不计入 `done` / `review` / `failed`

### 4. auto-review timer

**已修复。** 使用 `autoReviewTimersRef`（`Map<item.id, timer>`）：

- 某 item 进入 `processing` / `preparing` 后独立启动 3.5s 定时器
- item 离开处理态或移出队列时清理对应 timer
- `useEffect` 仅依赖 `processingQueue`，不因其他 item 或 `autoReviewIds` 变化重置已有 timer
- 组件卸载时清理全部 timer

### 5. 进度条 token 清理

- 保留主题 token：`--upload-progress-fill: #0f1012`（light）、`#ffffff`（dark）
- `.upload-progress-fill` / `.upload-batch-progress-fill` 统一 `background: var(--upload-progress-fill)`
- 移除 `html[data-theme] .upload-progress-fill { background: #... }` 硬编码覆盖
- 浅色主题仅保留 `box-shadow` 差异化规则

### 6. onContinueUpload 处理方式

**方案 A（保留扩展点）。** `UploadZone` 保留 `onContinueUpload` prop，并添加注释说明其为可选父级回调；未传入时由 `beginResetTransition()` 关闭覆盖层。`index.html` 无需传入，行为不变。

## 测试结果

```text
npm test: 197 pass, 0 fail
node --test tests/phase9-upload-workspace.test.js: 8 pass, 0 fail
node --test tests/phase8-theme.test.js: 13 pass, 0 fail
node --test tests/phase4-ux.test.js: 25 pass, 0 fail
git diff --check: 通过
```

## 核心链路确认

以下模块 **未修改**：

- OCR 核心识别链路（`ocrClient.js`、`processInvoiceFile`、`processBatchFiles`）
- `/api/ocr` 鉴权
- Qwen / DashScope / 模型路由配置
- Excel 导出结构（`exportManager.js`）
- `print.html` 打印逻辑
- Docker / Nginx / `server.js` 部署配置
- 表格筛选、高亮、待处理视图（未新增）
- Phase 9 既定三种完成态交互规则（全成功淡出 / 仅建议检查淡出 / 有失败常驻 + 按钮）
