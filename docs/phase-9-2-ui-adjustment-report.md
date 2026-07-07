# Phase 9.2 UI 调整第二部分完成报告

> 阶段：**Phase 9.2-ui 调整第二部分**
> 范围：历史入口、报销信息操作区、提示栏组件化、原生提示清理

## 1. 当前工程进度同步

- v2.0.0 开屏弹窗设计稿已落地。
- 使用教程弹窗已升级，并与 v2.0.0 开屏弹窗共用 token 化弹窗样式。
- 上传区域已完成新的动效设计，并使用 Phase 9 文档记录其变动。
- 本轮继续在 Phase 9.2 下处理视觉验收反馈，不进入新的开屏弹窗设计工作。

## 2. 本轮修改文件

- `js/components/AppHeader.js`
- `js/components/ReimbursementInfo.js`
- `js/components/ReimbursementTable.js`
- `js/components/HistorySidebar.js`
- `js/components/ImagePreviewModal.js`
- `js/components/SystemModals.js`
- `js/utils/exportManager.js`
- `index.html`
- `css/style.css`
- `tests/phase4-ux.test.js`
- `tests/phase8-theme.test.js`

## 3. Header 与历史入口

- 将“版本记录”入口从报销单信息卡片头部移至顶部 Header。
- 用户可见文案改为“历史记录”。
- Header 入口改为专用胶囊按钮，使用与主题切换一致的 `mutedSurface / border / shadow-sm` token，不再继承普通 `btn-secondary` 质感。
- 历史侧栏标题同步改为“历史记录”，副标题改为“最近保存的报销记录”。
- 关闭按钮辅助文案同步为“关闭历史记录”。

## 4. 报销信息操作区

- 报销单信息卡片头部只保留表单标题，不再承载历史、清空、保存按钮。
- `CLEAN` 文案改为“清空”。
- `SAVE` 移至表格底部操作区，与“列设置 / 添加新行 / 导出预览”同级。
- 保存按钮文案改为“保存当前记录”。
- 仅移动 UI 入口，不改变保存、清空、导出或表格数据结构。

## 5. 提示栏组件化

- 新增 `SystemModals.ConfirmDialog`，复用现有：
  - `modal-overlay`
  - `modal-shell`
  - `useAccessibleModal`
  - `btn-primary`
  - `btn-secondary`
  - `row-action--danger`
- 确认弹窗支持 `default / warning / danger / success` 视觉语义。
- 新增 `confirm-dialog__icon--danger / warning / success` token 样式。
- 删除、恢复、清空等会覆盖或破坏数据的操作统一进入项目内确认弹窗。
- 普通提示继续使用 toast，不使用重弹窗。

## 6. 原生提示清理

本轮已替换用户可见原生提示路径：

- 保存空态：改为 toast。
- 单次上传超过 10 个文件：改为 toast。
- 附件超过 5 个：改为 toast。
- 删除发票行：改为 token 化确认弹窗。
- 删除图片：改为 token 化确认弹窗。
- 历史记录删除 / 恢复 / 清空：改为 token 化确认弹窗。
- Excel / 打印失败提示：通过 `kairos-notify` 事件进入 toast，不再使用浏览器原生 `alert`。

## 7. 未改动的核心链路

本轮未修改：

- OCR 模型路由
- `/api/ocr` 鉴权逻辑
- DashScope / Qwen 配置
- Excel 导出数据结构
- `print.html` 打印核心逻辑
- Docker / Nginx / `server.js` 部署逻辑
- OCR 缓存结构和识别流程
- v2.0.0 开屏弹窗内容与头图

## 8. 测试覆盖

新增或更新测试覆盖：

- Header 存在“历史记录”入口。
- 报销单信息卡片不再显示“版本记录 / CLEAN / SAVE”旧入口。
- 表格底部存在“清空”和“保存当前记录”。
- 历史侧栏不再显示“版本记录 / VERSION RECORDS”。
- `SystemModals.ConfirmDialog` 存在并使用 token 化样式。
- 目标前端源码不再使用 `alert()`、`confirm()` 或 `window.confirm()`。
- 保存空态改为 toast，并保留下一步说明。

实际运行结果：

- `node --test tests/phase8-theme.test.js tests/phase4-ux.test.js tests/ocr-core.test.js`：52/52 通过。
- `npm test`：197/197 通过（普通沙箱因 127.0.0.1 监听限制失败 5 个自托管 HTTP 测试；授权环境复跑通过）。
- `git diff --check`：通过。
- 前端源码扫描：`index.html` 与 `js/` 下不再出现 `alert()`、`confirm()` 或 `window.confirm()`。

## 9. 视觉验收重点

后续浏览器验收请重点确认：

- 顶部“历史记录”按钮在浅色 / 深色主题下均可读。
- 报销信息卡片头部不再拥挤。
- 表格底部操作区中“保存当前记录”和“导出预览”层级清楚。
- 删除、恢复、清空操作不再出现浏览器系统弹窗。
- 危险操作按钮使用克制的 danger token，而不是系统原生橙色 / 黄色按钮。

## 10. 视觉复核补充修正

- Header “历史记录”按钮高度已与主题切换按钮对齐。
- Header “历史记录”按钮已进一步改为与主题切换一致的胶囊控制样式，统一背景层级、边框、阴影、字号与总高度。
- 导出预览缩放工具栏按钮已统一为单行 inline-flex，避免图标和文字换行。
- 导出预览缩放工具栏的“缩小 / 放大”图标已修正为明确的放大镜减号 / 加号图标，避免旧图形语义不清。
- 导出预览关闭按钮已脱离 header flex 排版，改为固定在预览面板右上角；窄屏下不再掉到左侧。
- 导出预览底部按钮文案已简化为“导出 Excel”和“打印 / 另存 PDF”。
- 无色按钮 hover 描边不再使用蓝色 focus ring，统一改为基于 `primary-text` 与 `border` 的中性加深 / 加浅效果；键盘 focus-visible 仍保留清晰 focus ring。
