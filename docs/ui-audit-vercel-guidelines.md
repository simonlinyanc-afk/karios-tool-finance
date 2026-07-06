# Kairos-Finance Vercel Web Interface Guidelines 审计

**审计日期：** 2026-07-06
**规则来源：** <https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md>
**范围：** 当前主页面、上传、报销表格、导出预览、系统弹窗与用户可见错误

## 1. 结论

当前页面的主流程与本地优先架构可保留，但尚未满足 Phase 4 的可访问性、状态语言和长列表要求。优先级最高的问题是：非语义点击区域、图标按钮缺少可访问名称、工程文案泄漏、失败缺少完整恢复操作，以及表格状态与金额阅读体验不一致。

## 2. 逐项审计

| 规则 | 状态 | 当前证据 | Phase 4 整改 |
| --- | --- | --- | --- |
| 图标按钮需要 `aria-label` | Fail | `UploadZone.js:68`、`ExportPreviewModal.js:89`、`SystemModals.js:8`、`index.html:792` | 为关闭、取消、删除、预览等图标按钮提供具体中文名称 |
| 操作使用 `<button>` | Fail | `UploadZone.js:21`、`ReimbursementTable.js:168,225,272,339` 使用可点击 div/img | 改为 button 或增加完整键盘语义；优先使用原生 button |
| 交互支持键盘 | Fail | 上传、图片预览、附件预览缺少键盘路径 | Enter/Space 可触发，Escape 可关闭，焦点返回来源 |
| 表单控件需要 label/name | Partial | 表格大量受控 input，部分只依赖列标题 | 增加可访问名称和稳定 name；日期/数字使用正确 type 与 inputmode |
| 异步更新使用 `aria-live` | Fail | `UploadZone.js:39-86` 仅视觉显示进度 | 批量摘要和单项状态使用 polite live region |
| 可见 `focus-visible` | Partial | 多处只定义 hover；部分输入使用 `outline-none` | 为按钮、表头、行操作、弹窗控件统一 focus-visible ring |
| 错误必须给下一步 | Fail | `index.html:485,570-576`、`ocrClient.js:716,729` 可能显示原始异常或笼统失败 | 使用 `ui-copy-map.md` 的场景文案和恢复操作 |
| 数字列使用等宽数字 | Fail | 表格金额列未统一 `tabular-nums` | 金额、税额、合计和批次数量统一等宽数字 |
| 数字/货币使用 `Intl` | Partial | 已有格式函数，但证据不足以证明统一 Intl | 建立模块级 `Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })` |
| 长列表渲染优化 | Fail | `ReimbursementTable.js:135` 全量 `items.map`，每行包含大量受控控件 | 50 条以上启用 `content-visibility`；保持对象引用稳定，必要时 memo 行 |
| 避免 `transition: all` | Fail | `AppHeader.js:23`、`SystemModals.js:241,253`、`HistorySidebar.js` 多处使用 | 仅声明 opacity/transform/color 等需要的属性 |
| 尊重 reduced motion | Fail | `UploadZone.js:86` 内联进度动画，未见降级 | CSS media query 关闭 creep/pulse 等非必要动画 |
| Modal 防滚动穿透 | Partial | 弹窗有 overlay，但未统一 overscroll/focus 处理 | 增加 `overscroll-behavior: contain`、Escape 和焦点管理 |
| 图片具有尺寸与替代文本 | Partial | 表格缩略图固定 CSS 尺寸，但 alt/width/height 不一致 | 装饰图 alt=""；发票图使用描述性 alt，并设置 width/height |
| 状态颜色不能是唯一信息 | Pass/Partial | 已有文字 Badge，但文案仍为“就绪/待检查/失败” | 保留文字并改为统一状态词 |
| 用户内容处理长文本 | Partial | 销售方、摘要、备注可能很长 | 使用 `min-w-0`、truncate/line-clamp 与 title/展开查看 |
| 破坏性操作需确认或撤销 | Partial | 删除、清空路径并非全部具有确认/撤销 | 保留现有确认弹窗；行删除至少二次确认或短时撤销 |

## 3. 文件级重点

### `js/components/UploadZone.js`

- `:21` 上传区域不是原生按钮，缺少键盘触发。
- `:39-86` 状态为“处理中…/完成/失败”，没有 live region 和 reduced-motion 处理。
- `:68` 单项取消按钮需要 `aria-label`。

### `index.html`

- `:449-453` 每次进度更新 map 整个队列；应使用函数式更新并只替换目标项。
- `:474-485` “命中缓存”“批量处理失败：原始错误”不符合用户语言。
- `:570-576` “Primary OCR Error / OCR 识别失败”可能进入可见提示。
- `:792` 关闭列设置的图标按钮缺少可访问名称。

### `js/components/ReimbursementTable.js`

- `:81-84` Badge 使用“待检查/就绪/失败”。
- `:117` 排序表头以点击事件实现，缺少排序按钮与 `aria-sort`。
- `:135` 全量渲染所有行。
- `:168,225,272,339` 图片和预览入口缺少按钮/键盘语义。
- `:405-469` 每行包含大量受控输入；应保持更新范围和对象引用稳定。
- `:495` 汇总金额需要与金额列共用同一 Intl formatter。

### `js/components/ExportPreviewModal.js`

- `:19,112,118,278` 使用“OCR 失败/就绪/失败/待检查”。
- `:89` 关闭按钮缺少可访问名称。
- 导出前应提供“先去检查 / 查看失败项 / 仍然导出”的清晰分支。

### `js/components/SystemModals.js` 与 `AppHeader.js`

- `SystemModals.js:37,122` 出现“OCR”“Draft”等非用户语言。
- 多个关闭按钮缺少可访问名称。
- `SystemModals.js:241,253`、`AppHeader.js:23` 使用 `transition-all`。

### `js/utils/ocrClient.js` 与 `exportManager.js`

- 内部状态、模型和日志词可以保留在代码中。
- `ocrClient.js:716,729` 不得把原始异常拼入用户可见 description。
- `exportManager.js` 的 Popup Blocker / 库未加载提示必须转为用户语言和下一步。

## 4. 性能审计

适用的 Vercel React Best Practices：

- `rerender-functional-setstate`：批量状态和行编辑使用函数式更新。
- `rerender-memo`：只对具有稳定 props 的复杂行组件使用 memo。
- `rerender-derived-state`：批次摘要由 items 派生，不复制多份状态。
- `rendering-content-visibility`：长表格行启用浏览器跳过离屏渲染。
- `js-set-map-lookups`：按 id 更新或查找大量条目时预建 Map。
- `js-cache-function-results`：复用 Intl formatter，不在每个单元格创建。
- `client-event-listeners`：弹窗键盘监听集中注册并正确清理。

不适用或延期：Next.js 服务端规则、RSC、Suspense 流式渲染、SWR、动态 import 和新虚拟列表依赖。

## 5. 验证清单

- 静态扫描禁用词、无 `transition-all`、无无名图标按钮。
- 组件测试覆盖状态映射、错误净化、增强识别入口和 aria 属性。
- 10 个文件批量上传，检查等待/识别/完成/检查/失败计数。
- 仅键盘完成上传、排序、展开、预览、增强识别、手动填写和关闭弹窗。
- 50/100 行数据检查滚动、输入和焦点稳定性。
- 开启 reduced motion 后进度条和弹窗不执行非必要动画。
- 验证缓存恢复、Excel 导出、打印页、PDF 首页和失败恢复路径。
