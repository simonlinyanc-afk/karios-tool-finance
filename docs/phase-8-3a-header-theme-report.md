# Phase 8.3A Header / Theme Switch / Version Badge Report

## 1. 修改文件

本阶段只处理 Header、主题切换入口、版本角标和基础按钮视觉类：

- `js/components/AppHeader.js`
- `css/style.css`
- `index.html`
- `tests/phase8-theme.test.js`
- `docs/phase-8-3a-header-theme-report.md`

同时保留 Phase 8.1 / 8.2 已有基础，不处理上传区、发票表格、系统弹窗或 v2.0.0 开屏弹窗。

## 2. Header 视觉调整

`AppHeader` 已从硬编码深色和黄色 Tailwind 类，切换到 Phase 8.2 主题 token：

- Header 使用 `.app-header`，读取 `--surface`、`--border`、`--primary-text`。
- Header 背景改为轻量半透明 surface + 细边框，接近 OpenAI / Vercel 的克制顶部栏。
- 自动保存开关改为 `.autosave-toggle`，减少黄色面积。
- 保存状态改为 `.save-status`，保存中只用小圆点的 `brandWarm` 点缀，不再使用大面积黄色文字和黄光。
- Header focus 继续使用全局 `--focus-ring`，保证浅色 / 深色下可见。

未改变自动保存开关的业务逻辑。

## 3. 主题切换实现方式

在 Header 右侧新增小型 segmented control：

- `跟随系统`
- `浅色`
- `深色`

实现特点：

- 使用现有 `window.KairosTheme` API。
- 点击选项调用 `window.KairosTheme.setPreference(preference)`。
- 当前选中态通过 `aria-pressed` 和 `.is-active` 表达。
- 控件整体有 `aria-label="切换界面主题"`。
- 主题偏好仍写入 `localStorage` key：`kairos-finance.theme`。
- 只保存 UI 偏好，不保存 Token、API Key、发票内容、图片 base64 或任何敏感信息。

## 4. 版本角标调整

页脚版本入口保持现有点击查看版本信息逻辑，视觉改为 `.version-badge`：

- 继续显示 `v2.0.0`。
- 使用中性色、细边框和少量 `brandWarm` 氛围。
- 不再使用黄色 hover 文本作为主要视觉反馈。
- 保留 `aria-label="查看版本更新"`。

版权角标保持：

```text
Kairos Studio©️ 2026
```

## 5. 基础按钮 token 化情况

Phase 8.2 已有：

- `.btn-primary`
- `.btn-secondary`

本阶段补充：

- `.btn-ghost`
- `.icon-button`

这些类读取主题 token：

- 主按钮：`--primary-button-bg` / `--primary-button-text`
- 次按钮：`--secondary-button-bg` / `--secondary-button-text`
- ghost / icon：`--secondary-text`、`--muted-surface`、`--border`、`--focus-ring`

本阶段只建立和接入基础类，不批量替换上传区、表格和弹窗按钮，避免扩大改动面。

## 6. 未改动的核心链路

本阶段未修改：

- OCR 模型路由。
- `/api/ocr` 鉴权逻辑。
- DashScope / Qwen 配置。
- Excel 导出逻辑。
- `print.html` 打印核心逻辑。
- Docker / Nginx / `server.js` 自托管部署逻辑。
- OCR 缓存字段结构。

## 7. 测试结果

新增 / 更新测试覆盖：

1. Header 中存在主题切换入口。
2. 主题切换入口包含“跟随系统 / 浅色 / 深色”。
3. Header 调用 `window.KairosTheme.setPreference`。
4. 主题 API 写入 `kairos-finance.theme`，并更新 `data-theme`。
5. Header / 版本角标不出现旧直译命名。
6. 页面仍可见 `v2.0.0`。
7. 用户界面不出现工程词。
8. 不出现真实访问凭证。

验证结果：

```text
node --test tests/phase8-theme.test.js
tests 7
pass 7
fail 0

node --test tests/phase4-ux.test.js
tests 25
pass 25
fail 0

npm test
tests 175
pass 175
fail 0
```

备注：普通沙箱环境运行完整测试时，本地 HTTP 监听测试会因 `127.0.0.1 listen EPERM` 失败；同一条 `npm test` 已在授权环境重跑并通过。
