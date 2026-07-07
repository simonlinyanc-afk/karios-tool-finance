# Phase 8.4：v2.0.0 开屏升级弹窗落地报告

## 1. 修改文件

| 文件 | 改动说明 |
| --- | --- |
| `data/version.json` | 重构升级内容结构：新增头图路径 `hero`/`heroAlt`、友好标题 `title`、`changesHeading` 与结构化 `sections`（标题 + 正文）；`historyLink` 指向外部飞书 wiki。 |
| `js/components/VersionModal.js` | 重写为开屏升级弹窗：顶部头图区、标题区、可滚动正文区（含底部渐隐）、固定底部操作区；新增 Escape 关闭、滚动渐隐检测；「查看历史更新内容」为带外链图标的外部链接。 |
| `css/style.css` | 新增 `.upgrade-modal` 系列 token 化样式（头图、滚动区、固定底部、底部渐隐遮罩）。 |
| `index.html` | 弹窗简介并入可滚动正文区首段（标题区仅固定标题）；`VersionModal` 仅接收 `isOpen`/`onClose`/`versionData`。 |
| `tests/phase4-ux.test.js` | 更新标题断言为新文案、按钮断言由「稍后查看」改为「查看历史更新内容」。 |
| `tests/phase8-4-upgrade-modal.test.js` | 新增 Phase 8.4 专项测试（头图资源、文案、主题、渐隐、已读、导出链路）。 |

## 2. 头图资源调用方式

- 资源路径：`assets/upgrade-v2.0.0-hero.webp`（用户提供的设计头图，未改动其文案 / 渐变 / 比例）。
- 在 `data/version.json` 中通过 `hero` 字段配置，`VersionModal` 以 `<img src={heroSrc}>` 作为**图片资源整体调用**，未用 HTML/CSS 重新排版「Upgrade / V2.0.0」文字。
- 头图 `width="100%" height:auto`，填满弹窗顶部宽度；弹窗外层 `overflow-hidden + rounded-2xl`，头图顶部圆角与弹窗圆角自动匹配。

## 3. 弹窗结构

```
modal-overlay（遮罩，点击关闭）
└── modal-shell.upgrade-modal（flex 纵向，max-height: min(90vh, 40rem)，overflow-hidden）
    ├── upgrade-modal__hero-wrap（shrink-0）→ 头图 <img> + 右上角关闭按钮
    ├── upgrade-modal__head（shrink-0）→ 仅固定标题「Kairos Finance 已升级到 v2.0.0 🎉」
    ├── upgrade-modal__body（flex:1 1 auto，min-height:0，relative）
    │   ├── upgrade-modal__scroll（flex:1 1 auto，min-height:0，overflow-y:auto）→ 简介首段 + 变化说明章节
    │   └── upgrade-modal__fade（absolute 底部渐隐遮罩，pointer-events:none）
    └── upgrade-modal__footer（shrink-0）→「查看历史更新内容」外链（带外链图标）+「开始使用」主按钮
```

- 底部按钮区 `shrink-0` 固定，不随正文滚动。
- 内容过长时**只有正文区滚动**；外层 `overflow-hidden` 保证弹窗整体不超过 `min(90vh, 40rem)`，小屏不溢出。
- 关闭途径：Escape 键、右上角关闭按钮、点击遮罩、「开始使用」——均触发 `onClose`（写入已读）。

## 4. 浅色 / 深色主题适配

- 完全复用 Phase 8 既有 token，未另起颜色系统。
- 内容面板：`var(--surface-elevated)`（浅色近白 / 深色深灰）。
- 主文字：`.modal-title` → `var(--primary-text)`；辅助文字：`.modal-description` → `var(--secondary-text)`。
- 主按钮：`.btn-primary` → `var(--primary-button-bg)`/`var(--primary-button-text)`（浅色黑底白字 / 深色白底黑字）。
- 次级入口：`.footer-link` 低噪声文字按钮。
- 黄 / 橙仅存在于头图图片内，正文与控件不额外大面积使用暖色。
- 实测：浅色面板 `rgb(255,255,255)` + 文字 `rgb(17,17,17)`；深色面板 `rgb(28,28,28)` + 文字 `rgb(244,244,245)`，对比度充足。

## 5. 滚动渐隐实现方式

- 使用**独立底部遮罩** `.upgrade-modal__fade`（绝对定位于滚动区底部，`pointer-events:none`），而非降低整段正文 opacity——正文本身始终清晰可读。
- 渐变：`linear-gradient(to bottom, transparent, var(--surface-elevated))`，浅色渐隐到浅色面板、深色渐隐到深色面板。
- 遮罩位于 `upgrade-modal__body` 内、`upgrade-modal__footer` 之外，因此**不遮挡按钮**。
- 溢出感知：`VersionModal` 在挂载 / 滚动 / 窗口尺寸变化时计算 `scrollHeight > clientHeight` 且未到底，才给遮罩加 `.is-visible`（opacity 1）；**内容未溢出或已滚到底部时不显示强烈渐隐**（opacity 0）。
- 实测：正文溢出且未到底时 `opacity=1`，滚动到底后 `opacity=0`。

## 6. 已读状态保存方式

- 版本化 key：`kairos-finance.seenUpgrade.v2.0.0`（逻辑保留在 `index.html`，与 Phase 4 一致）。
- 首次加载读取 `version.json`，若该 key 不为 `'true'` 则自动弹出。
- 「开始使用」/ 关闭按钮 / 遮罩 / Escape → `closeVersionModal()` 写入 `true`。
- 已读后刷新不再自动弹出；后续版本换新 key 即可独立弹出。
- 仅存布尔标记，**不写入 Token / API Key / 发票内容 / 图片 base64 等任何敏感信息**。

## 7. 查看历史更新内容入口

- 作为次级低噪声入口保留在底部，采用 `.footer-link` 文字样式，文字尾部带外链图标（`ExternalLink`）。
- 实现为 `<a target="_blank" rel="noopener noreferrer">`，`href` 取自 `version.json` 的 `historyLink`，指向外部飞书 wiki：`https://xcn6yt0gdphe.feishu.cn/wiki/FGNEwpgHKiavmMkt9brcKxZ5nIf`。
- 点击在新标签打开外部页，同时触发 `onClose`（关闭升级弹窗并写入已读）。
- 后续更换历史更新页面时，仅需修改 `version.json` 的 `historyLink`，无需改动组件代码。

## 8. 未改动的核心链路

- OCR 模型路由、`/api/ocr` 鉴权、DashScope / Qwen 配置：未触碰。
- Excel 导出数据结构、`exportToExcel` / `exportToPrint` 调用：未改动（弹窗组件不引用任何导出函数）。
- `print.html` 打印核心逻辑、Docker / Nginx / `server.js` 部署逻辑：未改动。
- OCR 缓存结构、识别流程、PDF / 图片压缩 / OCR 请求调用链：未改动。
- 未引入 HeroUI / `@heroui/react`，未迁移 Vite / Next.js。

## 9. 自动化测试结果

- 命令：`npm test`
- 结果：**189 passed / 0 failed**。
- `tests/phase8-4-upgrade-modal.test.js` 已重写为 HeroModal 架构专项测试，覆盖：升级 + 指南复用同一 `window.HeroModal` 外壳与 `hero-modal` 核心 class、升级可滚动 + 底部渐隐、指南静态 2×2 步骤且无渐隐、四个步骤文案齐全、两弹窗均以图片资源作头图（并校验文件存在、非 base64）、主按钮「开始使用」、浅/深主题 token、升级与指南已读 key 相互独立、无工程术语与敏感信息、导出链路未改动。

## 10. 真实浏览器视觉验收结果

在 `http://localhost:3000` 实测（含实时布局测量）：

| 验收项 | 结果 |
| --- | --- |
| 浅色主题弹窗 | ✅ 白底黑字、头图完整、按钮/文案正确 |
| 深色主题弹窗 | ✅ 深灰面板、浅色正文、白底黑字主按钮 |
| 正文可滚动 | ✅ 溢出时仅正文区滚动（clientH≈195 / scrollH≈567） |
| 底部渐隐自然 | ✅ 未到底 opacity=1，滚到底 opacity=0，非生硬切断 |
| 按钮区不被遮罩影响 | ✅ 底部为纯 `surface-elevated` 固定条，`body.bottom == footer.top`，无重叠 |
| 开始使用关闭 + 刷新不重复 | ✅ 写入 `kairos-finance.seenUpgrade.v2.0.0='true'`，刷新不再弹出 |
| 查看历史更新内容 | ✅ 关闭弹窗并打开版本记录侧栏 |
| 窄屏（≈390×720）不溢出 | ✅ 弹窗自适应，头图完整、按钮可见、正文可滚动 |

> 修复记录：初版滚动区使用 `h-full`（height:100%）在 flex 容器中未能解析，导致滚动区按内容高度撑开、正文溢出到固定底部之下并与按钮重叠、渐隐失效。改为 `upgrade-modal__body` 嵌套 flex + 滚动区 `flex:1 1 auto; min-height:0; overflow-y:auto` 后布局正确。

## 11. 留给 Phase 8.5 的细节收口事项

1. 头图目前为单张位图，后续可评估提供 2x / WebP 及 `srcset` 以优化高分屏与体积。
2. 头图 `alt` 为通用描述，可在 8.5 统一无障碍文案时细化。
3. 弹窗打开时可考虑加入初始焦点管理 / focus-trap（当前依赖 Escape + 遮罩关闭，已满足基本可达性）。
4. 「查看历史更新内容」目前直接打开版本记录侧栏，后续如需「历史更新日志」独立视图可在 8.5 规划。
5. 渐隐高度（3.5rem）与滚动区留白为经验值，可在 8.5 视觉统一阶段与其他弹窗滚动区对齐。

---

## H. 补充：可复用开屏弹窗外壳（升级 + 使用指南）

> 本节为 Phase 8.4 补充：将 v2.0.0 开屏升级弹窗与「使用指南 / 快速上手」弹窗整理为同一套可复用外壳，不重写全站弹窗系统，不引入 HeroUI / Vite / Next.js。

### H.1 可复用弹窗外壳设计

- 新增 `js/components/HeroModal.js`（全局 `window.HeroModal`）作为**唯一开屏弹窗外壳**，在 `index.html` 中于 `AppHeader.js` 之后、`VersionModal.js` 之前引入。
- 外壳拥有：顶部头图区、可选固定标题区、可替换正文区（`children`）、固定底部操作区；并统一处理 Escape 关闭、背景滚动锁定、滚动渐隐检测。
- 核心 props：`heroSrc` / `heroAlt` / `title` / `description` / `variant`(`upgrade`\|`guide`) / `scrollable` / `showFadeMask` / `primaryActionText` / `onPrimaryAction` / `secondaryActionText` / `onSecondaryAction` / `secondaryActionHref` / `onClose` / `closeAriaLabel` / `labelId`。
- 外层统一输出 `modal-shell hero-modal hero-modal--${variant}`；升级与指南**复用同一 `hero-modal` 核心 class 与同一组件**，仅通过 props / variant 差异化。
- 圆角、宽度（`max-width: 36.4rem`）、阴影（`modal-shell`）、浅/深主题均两变体一致。

### H.2 升级弹窗 variant = upgrade

- 组件：`js/components/VersionModal.js`，现为 HeroModal 的薄封装。
- `variant="upgrade"`、`scrollable={true}`、`showFadeMask={true}`。
- 头图：`assets/upgrade-v2.0.0-hero.webp`（取自 `version.json` 的 `hero`）。
- 正文：长文升级说明（简介 + 结构化 sections）。
- 主按钮「开始使用」；次级入口「查看历史更新内容」（带外链图标的外部链接）。

### H.3 使用指南弹窗 variant = guide

- 组件：`js/components/SystemModals.js` 的 `TutorialModal`，现为 HeroModal 的薄封装。
- `variant="guide"`、`scrollable={false}`、`showFadeMask={false}`。
- 头图：`assets/guide-welcome-hero.webp`（「欢迎使用 / 快速上手」）。
- 正文：2×2 步骤网格，数字圆形描边（`.hero-modal__step-index`）+ 标题 + `secondaryText` 说明；桌面两列、窄屏（≤480px）单列。
- 主按钮「开始使用」；无次级入口；正文不滚动、无底部渐隐遮罩。
- 四步骤文案：① 填写报销信息② 上传发票③ 补充凭证④ 导出报销单。

### H.4 两者头图资源调用方式

- 两张头图均以 `<img src={heroSrc}>` **作为图片资源整体调用**，未用 HTML/CSS 重排图中文字、未修改图片视觉、未转 base64。
- 文件均位于 `assets/`：`assets/upgrade-v2.0.0-hero.webp`、`assets/guide-welcome-hero.webp`。
- 升级头图 `hero-modal--upgrade` 以 `aspect-ratio 800/288 + object-fit:cover` 裁切为横幅；指南头图 `hero-modal--guide` 保留插画框景。

### H.5 两者正文区差异

| 维度 | upgrade | guide |
| --- | --- | --- |
| 正文长度 | 长 | 短 |
| 滚动 | `scrollable` 可滚动（`.hero-modal__scroll`） | 不滚动（`.hero-modal__content`） |
| 底部渐隐 | `showFadeMask` 有（`.hero-modal__fade`） | 无 |
| 排版 | 章节式长文 | 2×2 步骤网格（`.hero-modal__steps`） |
| 次级入口 | 查看历史更新内容 | 无 |

### H.6 两者已读 key

- 升级：`kairos-finance.seenUpgrade.v2.0.0`（版本化 key，逻辑在 `index.html`）。
- 指南：沿用现有已读逻辑 `tutorialCompleted`（`index.html`）。
- 两者**不共用 key**；实测：点击指南「开始使用」仅写入 `tutorialCompleted='true'`，`seenUpgrade` 保持不变。

### H.7 自动化测试结果

- `npm test` → **189 passed / 0 failed**。
- 相关回归修复：`css/style.css` 将 `.upgrade-modal*` 通用化为 `.hero-modal*` 并新增 guide 变体与 2×2 步骤样式；`tests/phase8-theme.test.js`（`closeAriaLabel` / 外壳 `modal-shell`）、`tests/phase4-ux.test.js`（焦点态改为校验全局 `:focus-visible` 规则）同步适配。

### H.8 真实浏览器视觉验收结果

在 `http://localhost:3000` 实测（含实时 DOM 测量 + 四态截图）：

| 验收项 | 结果 |
| --- | --- |
| 浅色 · 升级弹窗 | ✅ 黑底白字主按钮、头图完整、可滚动 + 渐隐 |
| 深色 · 升级弹窗 | ✅ 深灰面板、白底黑字主按钮、渐隐混入深色 |
| 浅色 · 使用指南弹窗 | ✅ 头图完整、2×2 步骤清楚、黑底白字主按钮 |
| 深色 · 使用指南弹窗 | ✅ 深灰面板、步骤文字可读、白底黑字主按钮 |
| 指南正文不滚动 | ✅ `hasScroll=false`，使用 `.hero-modal__content`，`body overflow=visible` |
| 指南无底部渐隐遮罩 | ✅ `hasFade=false`（`showFadeMask={false}`） |
| 2×2 步骤排版清楚 | ✅ 实测 `gridTemplateColumns` 两列（≈256px×2）、步骤 4 个、圆形描边序号 |
| 窄屏不溢出 | ✅ `@media (max-width:480px)` 单列 + `minmax(0,1fr)` 防溢出（CSS 规则已单测） |
| 点击「开始使用」正常关闭 | ✅ 指南关闭后 `stillOpen=false` |
| 已读逻辑不与升级冲突 | ✅ 仅写 `tutorialCompleted`，`seenUpgrade` 不变 |
