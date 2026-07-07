# Phase 8: Visual System & Theme Upgrade Plan

**阶段：** Phase 8.1 视觉系统设计文档
**日期：** 2026-07-07
**范围：** Kairos Finance 网页界面的视觉系统、浅色 / 深色主题、全局组件统一与 v2.0.0 开屏升级弹窗落地方案
**当前原则：** 先建立整体视觉系统，再做组件和弹窗；不为了视觉升级改动 OCR、导出、打印、安全或部署核心链路。

## 1. 当前界面与目标风格差异审计

当前界面已经具备可用的单页工作流：顶部栏、发票上传区、报销信息卡片、发票表格、导出预览、历史记录、系统弹窗和 v2.0.0 升级弹窗。代码仍是静态 `index.html` + React UMD + Tailwind CDN + `css/style.css` + 全局组件，不使用 Next.js，也没有 Vite 构建链。

与 OpenAI / Vercel / HeroUI-like 目标相比，主要差异如下：

| 维度 | 当前状态 | Phase 8 目标 |
| --- | --- | --- |
| 主题能力 | 只有黑色主题；`body`、`.card-modern`、`.input-modern`、`.btn-primary`、`.table-modern` 均为硬编码深色 | 支持 `system` / `light` / `dark`，根节点输出实际主题 `data-theme="light"` 或 `data-theme="dark"` |
| 视觉语言 | 深黑背景、强黄色主按钮、较多高饱和状态色 | 黑白灰中性色为主体，黄色 / 橙色只作品牌氛围和少量提示 |
| 组件统一 | 大量 Tailwind 颜色散落在组件中，例如 `bg-[#1a1a1a]`、`text-gray-500`、`border-[#2a2a2a]`、`bg-yellow-400` | 用 CSS variables 和语义类承接颜色、边框、阴影、focus，再逐步替换组件硬编码 |
| 按钮层级 | 黄色是主按钮默认色，二级按钮、图标按钮和危险按钮风格不完全统一 | 主按钮浅色模式黑底白字，深色模式白底黑字；二级按钮使用透明 / muted surface + 细边框 |
| 弹窗 | 弹窗之间存在黑色、白色、无圆角、圆角等多套风格 | 弹窗统一 overlay、panel、标题、滚动区、footer、focus 和主题 token |
| 表格 | 表头、行 hover、输入框和合计区为深色硬编码；金额高亮使用黄色 | 表格在浅色 / 深色下都保持高对比；金额列右对齐和等宽数字继续保留，合计不再依赖大面积黄色 |
| 状态 badge | 已完成、建议检查、识别失败已有文字，但颜色仍围绕黄 / 红 / 绿硬编码 | badge 使用语义 token，颜色可读，颜色不是唯一信息 |
| 可访问性 | Phase 4 已补强 Escape、focus、aria、reduced motion，但 focus ring 仍以黄色为主 | focus 使用 `focusRing` token；浅色和深色均可见；动效尊重 `prefers-reduced-motion` |

## 2. 当前黄色使用过重的位置

黄色 / 橙色目前承担了品牌、主按钮、进度、focus、保存状态、状态提醒和金额强调等过多职责。Phase 8 需要把它们拆分为语义 token。

重点位置：

- `css/style.css`
  - `.input-modern:focus` 使用 `#fbbf24` 边框和黄光。
  - `.btn-primary` 使用黄色背景，并在 hover 时使用橙色。
  - `.upload-zone:hover` / `.upload-zone.drag-active` 使用黄色边框。
  - `.progress-fill` 使用黄橙渐变。
- `js/components/AppHeader.js`
  - 自动保存开关开启态为 `bg-yellow-400`。
  - 保存中状态点和文字为黄色。
  - focus ring 为黄色。
- `js/components/ReimbursementInfo.js`
  - 标题图标、保存按钮使用黄色。
- `js/components/UploadZone.js`
  - 上传图标、旋转识别图标、批量识别卡片边框、进度条、建议检查文本均使用黄色。
- `js/components/ReimbursementTable.js`
  - `needs_review` badge、排序激活图标、附件数量角标、重新识别 / 增强识别 / 确认无误按钮、总计金额、导出预览按钮均使用黄色。
- `js/components/ExportPreviewModal.js`
  - 标题图标、固定列 badge、建议检查 badge、导出按钮阴影和 CTA 使用黄色。
- `js/components/SystemModals.js`
  - 教程步骤、恢复草稿、清空项目、识别确认、导出进度和 toast warning 使用黄色。
- `js/components/VersionModal.js`
  - 当前升级弹窗头部、版本 badge、bullet、提醒块、链接 hover、主按钮均使用黄色。
- `index.html`
  - 页脚反馈链接、版本按钮 hover、列显示设置 focus / fixed badge 使用黄色。
- `js/utils/exportManager.js`
  - 导出 loading spinner 使用 `#F5D158`，Excel 合计行使用浅黄色。这属于导出体验的视觉层，后续应谨慎评估，不改 Excel 数据结构。

Phase 8 的原则不是完全移除黄色，而是让黄色只负责 `brandWarm`、少量版本 badge、顶部氛围、提示状态的低饱和辅助，不再作为所有主操作和 focus 的默认色。

## 3. 当前不符合目标风格的组件

优先改造对象按用户影响和视觉复用价值排序：

| 组件 / 区域 | 当前问题 | 目标方向 |
| --- | --- | --- |
| `AppHeader` | 深色硬编码，品牌区和保存状态轻重不均；缺少主题切换入口 | 更轻的顶部栏、细边框、低噪声保存状态、主题分段入口 |
| 版本角标 / 页脚 | 版本入口在页脚偏弱，hover 黄色重 | 保持小而清楚；颜色使用 secondary / tertiary text；版本 badge 可少量品牌暖色 |
| 基础按钮 | 主按钮黄色，二级按钮多套写法 | 建立 `.btn-primary` / `.btn-secondary` / `.btn-ghost` / `.icon-button` |
| `card-modern` | hover 阴影较重，深色固定 | 使用 surface / surfaceElevated / border token；hover 更克制 |
| `.input-modern` | 深色固定，focus 只依赖黄色 | 使用 muted surface、token 化边框和 focus ring；浅色 date picker 可读 |
| `table-modern` | 深色固定，表头 uppercase 字距偏重；表格在浅色下无方案 | 表格中性、密度稳定、金额列右对齐、sticky header 使用 surfaceElevated |
| 状态 badge | 颜色 hard-code，跨弹窗不一致 | 建立 `.status-badge` + status variants |
| 系统弹窗 | 深色 / 白色 / 方形导出进度混用 | 统一 modal shell，保留具体内容差异 |
| `UploadZone` | 黄色承担上传、进度和拖拽全部强调 | 中性虚线边框 + drag-active ring；进度使用 semantic progress token |
| `VersionModal` | 当前为代码绘制头部，黄色按钮，不符合新稿 | 后续用图片头图，内容区支持主题，滚动区底部渐隐 |

## 4. Light / Dark Theme Token

Phase 8 使用 CSS variables 作为稳定基础，不引入大型 UI 依赖。建议在 `css/style.css` 中定义默认 `:root`、`html[data-theme="light"]`、`html[data-theme="dark"]`。`system` 只保存偏好，实际渲染仍落到 `light` 或 `dark`。

### 4.1 语义 token

| Token | Light | Dark | 用途 |
| --- | --- | --- | --- |
| `--background` | `#f7f7f5` | `#080808` | 页面底色 |
| `--foreground` | `#0b0b0c` | `#f5f5f4` | 默认文字 |
| `--surface` | `#ffffff` | `#141414` | 卡片、表格主体 |
| `--surface-elevated` | `#ffffff` | `#1c1c1c` | 弹窗、浮层、sticky 表头 |
| `--muted-surface` | `#f3f4f3` | `#202020` | 输入框、分段控件、二级按钮 |
| `--border` | `#d9dad7` | `#2c2c2c` | 主要边框 |
| `--subtle-border` | `#ececea` | `#232323` | 分割线、轻边框 |
| `--primary-text` | `#111111` | `#f4f4f5` | 标题和正文 |
| `--secondary-text` | `#52525b` | `#b7b7ba` | 辅助说明 |
| `--tertiary-text` | `#797b80` | `#77777c` | 次级说明、页脚 |
| `--primary-button-bg` | `#0a0a0a` | `#f5f5f5` | 主按钮背景 |
| `--primary-button-text` | `#ffffff` | `#080808` | 主按钮文字 |
| `--secondary-button-bg` | `#ffffff` | `#1d1d1d` | 次级按钮背景 |
| `--secondary-button-text` | `#18181b` | `#eeeeee` | 次级按钮文字 |
| `--focus-ring` | `#2563eb` | `#93c5fd` | 可见 focus |
| `--brand-warm` | `#f59e0b` | `#fbbf24` | 品牌暖色点缀 |
| `--danger` | `#dc2626` | `#f87171` | 危险 / 识别失败 |
| `--warning` | `#b45309` | `#facc15` | 建议检查 |
| `--success` | `#15803d` | `#4ade80` | 已完成 |

### 4.2 状态辅助 token

为 badge、toast 和提示块额外提供低饱和背景：

- `--danger-bg`
- `--warning-bg`
- `--success-bg`
- `--info-bg`
- `--overlay`
- `--shadow-sm`
- `--shadow-md`
- `--shadow-lg`

这些 token 可以避免在组件里继续堆 `bg-red-500/10`、`border-yellow-400/20` 等透明色。

## 5. 圆角、阴影、边框、间距规范

整体风格接近 OpenAI / Vercel 的克制产品界面，HeroUI-like 但不强制引入 `@heroui/react`。

### 圆角

- 页面容器 / 大卡片：`12px`，但避免卡片套卡片。
- 表单控件、按钮、badge：`8px`。
- 图标按钮：`8px` 或圆形，仅用于真正的图标控制。
- v2.0.0 开屏弹窗：外层 `24px` 左右圆角，以匹配设计稿；内部头图按图片圆角裁切。

### 阴影

- 默认卡片不使用重阴影，只用细边框。
- 浮层和弹窗使用 `--shadow-lg`，浅色为柔和灰黑阴影，深色为更短的黑色阴影。
- hover 阴影仅用于可交互浮层和主 CTA，避免列表和表格滚动时视觉噪声过大。

### 边框

- 主分隔线使用 `--border`。
- 内部分隔线使用 `--subtle-border`。
- focus 不通过边框颜色替代，必须有独立 `box-shadow: 0 0 0 3px color-mix(...)` 或兼容写法。

### 间距与密度

- 页面主容器：桌面 `32px` 左右内边距，窄屏降到 `16px`。
- 卡片内边距：`20px` / `24px`。
- 工具栏控件间距：`8px` / `12px`。
- 表格单元格：保持当前工作工具密度，主表格不做营销页式大留白。
- 弹窗 footer 与内容区明确分离，按钮区域不被滚动渐隐影响。

## 6. 主题切换方案

### 6.1 数据与存储

主题偏好只保存 UI 偏好：

```text
kairos-finance.theme = system | light | dark
```

不得保存 Token、API Key、发票内容、图片 base64、原始文件、识别结果或任何敏感信息。

### 6.2 运行逻辑

建议新增一个小型主题模块，不引入依赖：

- 页面启动时先读取 `localStorage.getItem('kairos-finance.theme')`。
- 非法值回退为 `system`。
- `system` 使用 `window.matchMedia('(prefers-color-scheme: dark)')` 计算实际主题。
- 将实际主题写到 `document.documentElement.dataset.theme`，值只允许 `light` 或 `dark`。
- 同时可写 `document.documentElement.style.colorScheme = actualTheme`，让浏览器表单控件更一致。
- 监听系统主题变化：当前偏好为 `system` 时立即更新根节点主题。
- React 状态只保存偏好和实际主题，不把任何业务数据接入主题模块。

### 6.3 防闪烁

在 `index.html` 的 CSS 加载前加入极小 bootstrap 脚本，提前设置 `data-theme`，避免页面先闪成默认主题。脚本只读写 `kairos-finance.theme`。

### 6.4 主题切换入口

入口放在 `AppHeader` 右侧，采用小型 segmented control 或图标按钮 + menu：

- `system`：跟随系统
- `light`：浅色
- `dark`：深色

控件需具备：

- 可访问名称，例如 `aria-label="切换界面主题"`。
- 当前选中态。
- 键盘可用。
- 不使用工程词。
- 不影响自动保存开关和保存状态。

## 7. HeroUI-like 组件升级路径

本阶段先实现 HeroUI-like 视觉，不引入 `@heroui/react`。原因：

- 当前项目没有打包链，使用 React UMD + Babel + Tailwind CDN。
- 引入完整组件库会扩大构建、样式优先级和依赖风险。
- 用户明确要求不直接迁移 Next.js，不直接迁移 Vite。

建议升级路径：

1. 在 `css/style.css` 建立 token 和基础语义类：`.app-shell`、`.surface-card`、`.button`、`.button-primary`、`.button-secondary`、`.input-control`、`.status-badge`、`.modal-panel`。
2. 先让现有 `.card-modern`、`.input-modern`、`.btn-primary`、`.table-modern` 读取 token，减少风险。
3. 再按组件优先级替换散落的硬编码 Tailwind 颜色。
4. 保留 Tailwind 的布局、尺寸和 flex/grid 能力，颜色和状态逐步交给 CSS variables。
5. 如果后续确实要引入 HeroUI 或 Vite，先单独做风险评估，确认依赖、构建、CDN、测试和部署影响。

## 8. 组件升级优先级

### Phase 8.2：主题系统与全局基础样式

优先文件：

- `index.html`
- `css/style.css`
- 可新增 `js/utils/theme.js` 或在 `index.html` 中加入极小主题工具，具体实现前再确认最小改动点。
- `tests/phase4-ux.test.js` 可增补主题静态测试，或新增 `tests/phase8-theme.test.js`。

先完成：

- `kairos-finance.theme`
- `data-theme="light" / "dark"`
- `system` 监听
- CSS variables
- body / card / input / button / table 的基础 token 化
- focus-visible
- reduced motion 基础支持

### Phase 8.3：全局组件视觉统一

按顺序处理：

1. `AppHeader`：品牌、保存状态、主题入口。
2. 页脚版本角标：版本入口、反馈链接、版权文案。
3. 基础按钮：保存、导出预览、开始识别、确认无误、弹窗按钮。
4. 卡片容器：报销信息、上传队列、表格外壳。
5. 输入框：报销信息表单、表格内输入框、列设置 checkbox。
6. 表格：表头、行 hover、金额列、合计区、空状态。
7. 状态 badge：已完成、建议检查、识别失败、手动填写。
8. 系统弹窗：教程、恢复草稿、清空项目、识别确认、导出进度、列设置。
9. 上传区：默认、hover、drag-active、批量进度。

### Phase 8.4：v2.0.0 开屏升级弹窗

在主题和组件基础稳定后单独处理 `VersionModal`，不提前局部重做。

### Phase 8.5：细节与可访问性收口

完成对比度、hover / active / focus、Escape、焦点管理、表格输入、金额列对齐、badge 可读性、拖拽态、错误提示、导出确认、窄屏基本可用性。

### Phase 8.6：测试与文档

更新：

- `docs/phase-8-visual-system-plan.md`
- `docs/web-v2-upgrade-report.md`

测试至少覆盖用户列出的 12 项主题、版本、弹窗、敏感信息和 `npm test` 要求。

## 9. v2.0.0 开屏升级弹窗落地方案

### 9.1 资源策略

用户提供的设计稿顶部头图必须作为图片资源调用，不能用 HTML / CSS 重排头图里的 `Upgrade / V2.0.0` 字样。

建议在 Phase 8.4 将头图切出或保存为项目资源，例如：

```text
assets/upgrade-v2.0.0-hero.jpg
```

注意：本 Phase 8.1 不复制资源、不修改弹窗。

### 9.2 结构

弹窗结构：

1. 顶部图片区：固定展示升级头图。
2. 内容区：标题与简介。
3. 滚动内容区：升级说明，底部渐隐遮罩。
4. 底部操作区：`查看历史更新内容`、`开始使用`。

标题：

```text
Kairos Finance 已升级到 v2.0.0 🎉
```

主按钮：

```text
开始使用
```

次级入口：

```text
查看历史更新内容
```

### 9.3 主题适配

- 浅色模式：白色内容面板、黑色主按钮、正文深灰。
- 深色模式：深灰内容面板、白色主按钮、正文浅灰。
- 黄色 / 橙色只保留在头图中；正文、按钮和滚动区不大面积使用黄色。
- 设计稿中的下半部分淡出解释为滚动区底部渐隐遮罩，不降低正文整体 opacity。
- 按钮区固定在渐隐遮罩外，不能被遮罩影响。

### 9.4 已读逻辑

继续使用版本化 localStorage key：

```text
kairos-finance.seenUpgrade.v2.0.0
```

只保存是否看过升级弹窗。关闭、点击 `开始使用` 后写入 `true`，已读后不重复弹出。不得保存 Token、API Key、发票内容、图片 base64 或其他敏感信息。

### 9.5 文案边界

面向非技术同事，不出现：

- 模型
- 路由
- fallback
- schema
- JSON
- DashScope
- Token
- Nginx
- IndexedDB
- MD5
- 部署

允许出现：

- 标准识别
- 自动再识别一次
- 增强识别
- 建议检查
- 识别失败
- 手动填写

`data/version.json` 当前已有用户语言版 v2.0.0 文案，Phase 8.4 可在此基础上调整标题和正文组织，但要确保弹窗标题包含指定完整文本。

## 10. 不允许改动的核心链路

Phase 8 只做视觉、可访问性、主题适配和开屏弹窗呈现。以下内容不得修改：

1. OCR 模型路由。
2. `/api/ocr` 鉴权逻辑。
3. DashScope / Qwen 配置。
4. Excel 导出逻辑。
5. `print.html` 打印核心逻辑。
6. Docker / Nginx 自托管部署核心逻辑。
7. 现有发票字段结构。
8. 现有 OCR 缓存顺序和缓存结构。
9. 识别状态的业务含义。
10. 安全凭证处理方式。
11. 构建系统，不引入 Next.js，不直接迁移 Vite。

允许改动的边界：

- UI 文案中继续避免工程词。
- 色彩、间距、圆角、阴影、focus、hover、active、可访问属性。
- 组件 className 和 CSS variables。
- 主题偏好 `localStorage`。
- 版本弹窗的展示结构、主题适配和头图资源引用。

## 11. 测试计划

### 11.1 自动化测试

建议新增或更新测试覆盖：

1. 页面存在主题切换入口。
2. 主题偏好保存到 `kairos-finance.theme`。
3. `system` / `light` / `dark` 三种模式可切换。
4. 根节点实际主题为 `data-theme="light"` 或 `data-theme="dark"`。
5. 系统主题变化监听只在偏好为 `system` 时改变实际主题。
6. 页面可见版本号为 `v2.0.0`。
7. 开屏弹窗标题包含 `Kairos Finance 已升级到 v2.0.0`。
8. 开屏弹窗头图以图片资源方式调用。
9. 弹窗不包含工程术语。
10. 关闭后写入 `kairos-finance.seenUpgrade.v2.0.0`。
11. 已读后不会重复弹出。
12. 浅色 / 深色主题下主按钮和正文使用 token，保持可读。
13. 不涉及 `OCR_ACCESS_TOKEN`、`QWEN_API_KEY` 或任何真实凭证。
14. `npm test` 通过。

### 11.2 手动验证

每个小阶段完成后单独说明改动范围和测试结果：

- 浅色模式主流程：上传区、报销信息、表格、导出预览、系统弹窗、版本弹窗。
- 深色模式主流程：同上。
- `system` 模式：切换 macOS 系统外观后页面跟随。
- 键盘路径：主题切换、上传、表格排序、行展开、弹窗关闭。
- reduced motion：旋转、进度和弹窗动效被正确降级。
- 窄屏：顶部栏、主题入口、弹窗按钮不拥挤、不重叠。
- 对比度：正文、按钮、badge、表格输入框在两种主题下可读。

### 11.3 回归保护

每次 Phase 8 小阶段都需要确认：

- 没有改动 `api/ocr-service.js`、`api/ocr.js`、`api/model-router.js`、`api/qwen-client.js`、`api/security.js` 的核心逻辑。
- 没有改动 Excel 导出数据结构。
- 没有改动 `print.html` 打印核心逻辑。
- 没有改动 Docker / Nginx 自托管核心逻辑。
- 没有把真实凭证或发票内容写入 `localStorage`。
- 英文命名使用 `Kairos`，不出现工作室名称的英文直译命名。

## 12. 执行顺序确认

下一步在文档确认后进入 Phase 8.2。建议严格按以下顺序推进：

1. Phase 8.2：主题系统与全局基础样式。
2. Phase 8.3：全局组件视觉统一。
3. Phase 8.4：v2.0.0 开屏升级弹窗落地。
4. Phase 8.5：页面细节与可访问性收口。
5. Phase 8.6：测试与文档收口。

每一步都应保持小范围修改、单独说明测试结果，并避免一次性大范围重写。
