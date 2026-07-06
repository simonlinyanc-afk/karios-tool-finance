# Phase 4 UX and Interface Copy Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在保留本地优先、OCR 缓存、PDF、Excel 和打印链路的前提下，统一发票状态语言、失败恢复操作、键盘可访问性、财务表格可读性和长列表渲染表现。

**Architecture:** 继续使用当前静态 React/UMD 页面和全局组件，不引入新框架或依赖。现有 `ReimbursementTable` 承担 InvoiceTable，展开行承担轻量 ReviewPanel；Phase 4 不新建完整 SettingsPanel。当前 UI 文件之间存在任务开始前的接口与品牌依赖，因此按已审计的完整运行基线修改和验证。

**Tech Stack:** React 18 UMD、Babel Standalone、Tailwind CDN、原生 Web API、Node test runner、Playwright/浏览器验证。

---

## 执行约束

- 业务代码由单一 Phase 4 执行子线程在当前主工作区修改；不得覆盖或回退既有用户改动。
- 不创建独立 worktree：Phase 4 目标 UI 文件本身已 dirty，当前工作区是唯一权威基线。
- 每项先写失败测试，再写最小实现，再运行专项测试。
- 子线程不得 `git add`、不得 `git commit`。
- 不修改 `README.md`、`package.json`、`js/utils/imageProcessor.js`、`PDFTemplate.js` 或黑色 Logo 资源。
- 不修改 IndexedDB schema、OCR cache 键/顺序、模型路由、Excel 数据结构或打印任务 payload。

## 提交边界

### Phase 4 完整文件

- `index.html`
- `js/components/UploadZone.js`
- `js/components/ReimbursementTable.js`
- `js/components/ExportPreviewModal.js`
- `js/components/SystemModals.js`
- `js/components/AppHeader.js`
- `js/components/icons.js`
- `js/utils/ocrClient.js`
- `js/utils/finance.js`
- `assets/Kairos Finance.svg`
- `assets/Kairos Logo.svg`
- `tests/ui-layering.test.js`
- `tests/phase4-ux.test.js`
- `docs/ux-design-plan.md`
- `docs/ui-copy-map.md`
- `docs/ui-audit-vercel-guidelines.md`
- `docs/plans/2026-07-06-phase-4-ux-implementation.md`

### Phase 4 仅暂存指定 hunk

- `js/utils/exportManager.js`：仅 3 个安全用户文案 hunk（Excel 生成不可用、打印窗口被拦截、导出失败兜底），不纳入导出结构或图片处理逻辑改动。
- `print.html`：Dexie v5 schema 兼容 hunk + 安全打印错误文案 hunk。

### 明确排除

- `README.md`、`package.json`、`.DS_Store`
- `js/utils/exportManager.js` 非文案逻辑、`js/utils/imageProcessor.js`
- `js/components/PDFTemplate.js`
- `assets/Kairos Finance Black.svg`、`assets/Kairos Logo Black.svg`
- `tests/ocr-core.test.js`、`tests/self-hosting.test.js`
- `AGENT.md` 与 2026-04-01 计划文档

### Task 1: 建立 Phase 4 UX 合同测试与财务格式器

**Files:**
- Create: `tests/phase4-ux.test.js`
- Modify: `tests/ui-layering.test.js`
- Modify: `js/utils/finance.js`

**Step 1: 写失败测试**

静态与 VM 测试覆盖：

- 状态 Badge 不再使用“就绪 / 待检查 / 失败 / OCR 失败”。
- 页面普通文案不出现 fallback、schema、JSON、MD5、IndexedDB、DashScope、model、Popup Blocker、Draft。
- `formatCurrency()` 对 0、12.3、1234.5 输出两位小数，并使用 `Intl.NumberFormat`。
- 上传、排序、预览、关闭和删除入口具备按钮语义与可访问名称。
- 进度区域具有 `aria-live` / progressbar 属性。
- 长列表行存在 `content-visibility` 策略。
- enhanced、retry、manual 三条失败恢复入口存在。
- `print.html` 声明 v5 schema。

**Step 2: 运行红灯**

Run: `node --test tests/phase4-ux.test.js tests/ui-layering.test.js`

Expected: 旧文案、缺少 aria、无增强识别与 v5 print 断言失败。

**Step 3: 更新财务格式器**

在模块级创建 `Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })`，`formatCurrency()` 处理非有限值并复用实例。不得改变 `calculateTax()` 的字段关系或持久化值。

**Step 4: 运行格式器测试**

Run: `node --test tests/phase4-ux.test.js`

Expected: 财务格式器相关断言通过，其他 UI 断言仍失败。

### Task 2: 重构 UploadZone 的状态、语义和隐私说明

**Files:**
- Modify: `js/components/UploadZone.js`
- Modify: `index.html`（仅相关样式和 props）
- Test: `tests/phase4-ux.test.js`

**Step 1: 完善失败测试**

覆盖主文案、格式/数量/PDF 首页说明、隐私说明、文件 input accept、上传按钮语义、取消按钮 aria、批次统计、用户状态词、live region、progressbar 与 reduced motion。

**Step 2: 运行红灯**

Run: `node --test tests/phase4-ux.test.js`

**Step 3: 实现最小组件改动**

- 使用 `<label>` + input 或 `<button>` 语义，不用裸 div 代替按钮。
- input 限制 JPG、PNG、PDF；拖放继续可用。
- 单次最多 10 个文件，说明 PDF 默认第一页。
- 批次摘要一次遍历生成总数、已完成、建议检查、失败。
- progressbar 提供数值与中文可访问名称。
- 进度动画用 CSS class；reduced motion 下禁用 creep/spin/slide 等非必要动画。
- 图标标记为装饰性，图标按钮提供具体 aria-label。

**Step 4: 运行绿灯**

Run: `node --test tests/phase4-ux.test.js tests/ui-layering.test.js`

### Task 3: 统一批量状态、错误净化和识别来源文案

**Files:**
- Modify: `index.html`
- Modify: `js/utils/ocrClient.js`
- Test: `tests/phase4-ux.test.js`

**Step 1: 写失败测试**

验证：

- cache/fallback/high_accuracy/manual 只显示用户语言。
- 批量成功、部分失败和整批失败 toast 都给下一步。
- 原始 `error.message`、HTTP 文本和内部 code 不进入用户可见 description/toast。
- `createFailedItem()` 生成稳定中文说明，包含重新识别、增强识别或手动填写。
- 批量回调使用函数式更新，只替换目标 queue item；结果去重避免重复追加。

**Step 2: 运行红灯**

Run: `node --test tests/phase4-ux.test.js tests/phase2-browser.test.js tests/phase3-browser-security.test.js`

**Step 3: 实现安全文案边界**

新增纯函数把 Abort/timeout/access/service/generic 失败映射为稳定中文文案。内部 console 可以保留安全 code，但用户 toast、row description、lastError 只接收净化结果。

`handlePrimaryImageUpload()` 将 `options.mode` 传入 `processInvoiceFile()`；增强识别完成后在本地条目上记录非敏感来源 `high_accuracy`，只用于显示“已使用增强识别”。

**Step 4: 运行绿灯与安全回归**

Run: `node --test tests/phase4-ux.test.js tests/phase2-browser.test.js tests/phase3-browser-security.test.js`

### Task 4: 表格状态、财务阅读、键盘操作和恢复入口

**Files:**
- Modify: `js/components/ReimbursementTable.js`
- Modify: `index.html`（传递既有 handler）
- Test: `tests/phase4-ux.test.js`

**Step 1: 写失败测试**

覆盖：

- Badge 为“正在识别 / 建议检查 / 已完成 / 识别失败”。
- cache/fallback/high_accuracy/manual 识别记录为用户文案。
- 失败行有“重新识别 / 增强识别 / 手动填写”。
- 建议检查有“确认无误 / 增强识别 / 手动修改”。
- 排序使用 button、`aria-sort` 与可见 focus。
- 图片/附件预览可键盘触发，具有 aria-label、width/height/alt。
- 所有 input 具有中文 aria-label/name，金额使用 inputmode decimal 与 tabular nums。
- 行具有 `content-visibility: auto` 与 intrinsic size。

**Step 2: 运行红灯**

Run: `node --test tests/phase4-ux.test.js tests/ui-layering.test.js`

**Step 3: 实现轻量 ReviewPanel**

不新建独立侧栏；在现有展开行顶部显示状态说明、建议检查列表、识别来源和恢复按钮。手动填写只展开编辑区域并聚焦首个字段；确认无误显式清理当前警告并标记已完成。

重试使用原文件与 `mode='normal'`；增强识别使用 `mode='high_accuracy'`，保留 preview、id 和缓存覆盖规则。缺少原文件时禁用识别按钮并解释需要重新选择文件。

**Step 4: 实现渲染优化**

- 复用模块级 status map、visible column list 和 Intl formatter。
- 行对象未改变时保持引用；不深拷贝整表。
- 使用 CSS `content-visibility`；仅当 callback/props 稳定时抽取 `React.memo` 行。
- 不引入虚拟列表或状态管理依赖。

**Step 5: 运行绿灯**

Run: `node --test tests/phase4-ux.test.js tests/ui-layering.test.js tests/phase1-browser.test.js tests/phase2-browser.test.js tests/phase3-browser-security.test.js`

### Task 5: 导出预览、弹窗、顶部状态和品牌资源

**Files:**
- Modify: `js/components/ExportPreviewModal.js`
- Modify: `js/components/SystemModals.js`
- Modify: `js/components/AppHeader.js`
- Modify: `js/components/icons.js`
- Modify: `index.html`（列设置弹窗）
- Include: `assets/Kairos Finance.svg`
- Include: `assets/Kairos Logo.svg`
- Test: `tests/phase4-ux.test.js`

**Step 1: 写失败测试**

验证导出状态、检查/失败数量、按钮文案、图标 aria、dialog 语义、Escape、焦点样式、无 `transition-all`、无 Draft/OCR 工程词和本地数据提示。

**Step 2: 运行红灯**

Run: `node --test tests/phase4-ux.test.js tests/ui-layering.test.js`

**Step 3: 实现小步整改**

- 导出预览统一“已完成 / 建议检查 / 识别失败”。
- 检查抽屉提供“先去检查 / 查看失败项 / 仍然导出”。
- 弹窗使用 `role="dialog"`、`aria-modal`、标题关联、Escape 关闭和 overscroll contain。
- 图标按钮有 aria-label；装饰图标 aria-hidden。
- 将 `transition-all` 替换为明确属性。
- AppHeader 只显示“已保存 / 正在保存…”等用户状态。

**Step 4: 运行绿灯**

Run: `node --test tests/phase4-ux.test.js tests/ui-layering.test.js`

### Task 6: 打印数据库 v5 兼容与安全打印错误文案

**Files:**
- Modify: `print.html` only the `db.version(5)` schema block and safe print error copy
- Test: `tests/phase4-ux.test.js`

**Step 1: 写失败测试**

断言打印页声明与 `storageRepository.js` 一致的 v5 `invoices/history/ocrCache/printJobs` schema，并断言用户可见错误使用安全打印错误文案，不直接显示原始 `error.message`。同时保留 v4 迁移链和 `print.html` 主流程。

**Step 2: 运行红灯**

Run: `node --test tests/phase4-ux.test.js`

**Step 3: 只加入 v5 schema 与安全打印错误文案 hunk**

不修改打印布局、Logo、远程 Dexie、图片等待或 payload；这些在 Phase 5-7 单独处理。用户可见加载失败统一提示“请返回主页面重新打开打印预览”一类下一步，不暴露内部异常。

**Step 4: 运行绿灯**

Run: `node --test tests/phase4-ux.test.js`

### Task 7: 自动化、浏览器与视觉回归

**Files:**
- Test all selected Phase 4 files

**Step 1: 专项测试**

Run: `node --test tests/phase4-ux.test.js tests/ui-layering.test.js tests/phase1-browser.test.js tests/phase2-browser.test.js tests/phase3-browser-security.test.js`

Expected: PASS。

**Step 2: 完整测试**

Run: `npm test`

Expected: 全部 PASS，包括真实 HTTP 回环。

**Step 3: 静态检查**

- `git diff --check`
- 所有修改 JS `node --check`
- 用户界面禁用词扫描
- `transition-all`、无名图标按钮、裸 div/img click 扫描
- OCR cache、PDF、Excel、print 关键标识保留扫描

**Step 4: 真实浏览器场景**

使用 10 个模拟文件和现有发票样本验证：

- 拖放和文件选择、取消单项/全部、PDF 首页说明。
- waiting/processing/ready/needs_review/failed/cached/fallback/high_accuracy/manual 文案。
- 失败行的三条恢复路径与建议检查确认。
- 键盘上传、排序、展开、预览、弹窗关闭和焦点返回。
- 50/100 行滚动、编辑和表格内容可见性。
- 导出前检查抽屉与打印入口。
- reduced motion、窄屏和 200% 缩放。

**Step 5: 双重复审**

先由 UX/规格 reviewer 逐条核对 UX 文档和 copy map，再由 accessibility/performance reviewer 对照 Vercel guidelines、building-components 与 React rules。所有 Blocking/Important 必须修复并复审关闭。

**Step 6: 幕僚长精确暂存**

按“完整文件 / print 单 hunk / 排除文件”边界暂存，导出 Git index 快照运行测试后创建 Phase 4 独立提交。禁止 `git add .`。
