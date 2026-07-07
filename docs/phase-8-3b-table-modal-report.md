# Phase 8.3B-2 / 8.3B-3：表格、状态 Badge 与弹窗视觉统一报告

## 1. 修改文件

- `css/style.css`
- `js/components/ReimbursementTable.js`
- `js/components/SystemModals.js`
- `js/components/ExportPreviewModal.js`
- `js/components/VersionModal.js`
- `index.html`
- `tests/phase8-theme.test.js`
- `docs/phase-8-3b-table-modal-report.md`

## 2. 表格视觉调整

- 发票表格外层改为 `invoice-table-shell`，使用既有 `surface`、`border`、`primaryText` 与阴影 token。
- 表头改为 `invoice-table-header`，移除硬编码深色背景与高噪声黄色排序态。
- 行 hover 使用 `mutedSurface`，保持浅色 / 深色主题下可读。
- 图片缩略图、上传占位、附件数量角标改为 `invoice-image-slot`、`invoice-thumbnail`、`attachment-count-badge`。
- 空状态改为 `table-empty-state`，继续保留“暂无数据，请上传发票开始 / 添加默认空白行”的用户语言。

## 3. 状态 Badge 设计

- 状态样式统一到 `status-badge` 与语义变体：
  - `status-badge--ready`：已完成
  - `status-badge--review`：建议检查
  - `status-badge--failed`：识别失败
  - `status-badge--processing`：正在识别
  - `status-badge--manual` / `status-badge--cached` / `status-badge--enhanced`：为后续用户语言状态预留
- Badge 使用 `success`、`warning`、`danger`、`info`、`neutral` 方向的 token，不再使用大面积黄底。
- 颜色不作为唯一信息，所有 Badge 均保留明确中文状态文字。

## 4. 金额列 / 输入框 / 行操作样式调整

- 金额输入继续使用 `formatEditableMoney`，不改变两位小数格式化逻辑。
- 金额、税额、价税合计相关输入统一使用 `money-input`，保留右对齐与 `tabular-nums`。
- 行操作按钮改为 `row-action`、`row-action--primary`、`row-action--danger` 和 `table-icon-action`。
- “重新识别 / 增强识别 / 手动填写 / 确认无误 / 删除 / 展开收起”不再默认使用黄色按钮。
- 删除操作使用 `danger` 语义 token。
- 新增“价税合计”列配置入口，默认 `visible: false`，不改变当前默认导出列结构。

## 5. 系统弹窗视觉统一

- 系统弹窗统一使用：
  - `modal-overlay`
  - `modal-shell`
  - `modal-title`
  - `modal-description`
  - `modal-subtle`
  - `modal-close`
  - `modal-divider`
- 教程、恢复草稿、清空项目、识别确认、导出进度均接入 token。
- Toast 改为 `toast` / `toast--success` / `toast--warning` / `toast--error`，用语义边框和图标区分状态。
- `VersionModal` 仅做通用 modal shell 兼容；未处理 v2.0.0 开屏头图、滚动渐隐遮罩或新开屏弹窗结构。

## 6. 导出确认 / 导出预览调整

- 导出预览外壳改为 `export-preview-shell`。
- 左侧列设置、顶部预览切换、导出前检查卡片、检查清单侧栏均使用 Phase 8 token。
- “建议检查 / 识别失败 / 已完成”统计 Badge 使用统一 `status-badge`。
- 保留导出前提示文案：
  - 先去检查
  - 查看失败项
  - 仍然导出 Excel
  - 仍然打印 / 另存 PDF
- Excel 白纸预览仍保持白底纸张语义，但改为专用 `excel-preview-*` class，避免把硬编码灰色 Tailwind 散落在组件中。
- 未改变 `window.exportToExcel(items, columns, reimbursementInfo)` 与 `window.exportToPrint(items, columns, reimbursementInfo)` 调用。

## 7. 访问凭证弹窗调整

- 本轮未修改访问凭证保存逻辑。
- 访问凭证仍由现有兼容路径使用 `sessionStorage` 保存，未改为 `localStorage`。
- 用户可见文案仍使用“访问凭证”，不显示访问密钥类工程称呼。

## 8. light / dark 主题适配方式

- 所有新增表格、Badge、弹窗、导出预览样式都读取 Phase 8.2 已有 CSS variables。
- 主按钮继续使用浅色黑底白字、深色白底黑字。
- 次按钮、ghost 按钮、图标按钮、弹窗关闭按钮使用中性色 surface / border token。
- focus-visible 继续走全局 `focusRing` token。

## 9. 未改动的核心链路

本轮未改动：

- OCR 模型路由
- `/api/ocr` 鉴权逻辑
- DashScope / Qwen 配置
- Excel 导出数据结构与导出函数
- `print.html` 打印核心逻辑
- Docker / Nginx / `server.js` 自托管部署逻辑
- OCR 缓存结构和识别流程
- PDF / 图片压缩 / OCR 请求调用链
- v2.0.0 开屏升级弹窗头图和 8.4 设计落地

## 10. 测试结果

- `node --test tests/phase8-theme.test.js`：通过，12/12。
- `node --test tests/phase4-ux.test.js`：通过，25/25。
- `npm test`（普通沙箱）：175/180 通过；5 项失败均为 `listen EPERM: operation not permitted 127.0.0.1`，对应本地 HTTP 监听类测试。
- 已按要求尝试在授权环境重跑 `npm test`，但平台自动审批因当前用量限制拒绝执行；未采用绕过方式。

## 11. 已知限制和留给 Phase 8.4 的内容

- v2.0.0 开屏升级弹窗仍未按新设计稿落地。
- 开屏弹窗顶部头图、滚动内容底部渐隐遮罩、按钮区布局留到 Phase 8.4。
- 本轮没有做真实浏览器视觉截图回归；如需像素级确认，建议在 Phase 8.5 或 8.6 加入浏览器视觉验收。
