# Phase 8.3B-1 Upload Zone & Batch Progress Report

## 1. 修改文件

本阶段只处理上传区和批量识别进度视觉统一：

- `js/components/UploadZone.js`
- `css/style.css`
- `tests/phase8-theme.test.js`
- `docs/phase-8-3b-upload-report.md`

未处理发票表格、系统弹窗、v2.0.0 开屏弹窗或导出/打印相关界面。

## 2. 上传区视觉调整

`UploadZone` 保留原有业务 props、事件和流程，只替换安全的视觉类：

- 默认态使用 `upload-zone` / `upload-dropzone`，读取 `--muted-surface`、`--surface`、`--border`。
- hover 态仅做轻微边框和 surface 变化，不再大面积使用黄色。
- drag-active 态保留少量 `brandWarm` 细边框和 ring，用作拖拽反馈。
- 上传图标改为 `upload-icon`，主体使用 surface / border / secondary text，仅用一个小暖色点缀。
- 标题、格式说明和隐私说明分别使用 `--primary-text`、`--secondary-text`、`--tertiary-text`。

保留文案：

- “拖入发票，自动整理报销明细”
- “支持 JPG、PNG、PDF。单次最多 10 个文件，PDF 默认识别第 1 页。”
- “原始文件不会保存在服务器。”

## 3. 批量识别进度视觉调整

批量识别进度区域保留现有队列和取消逻辑：

- 容器使用 `upload-queue-panel`，读取 `--surface-elevated` 和 `--border`。
- 批量摘要继续使用 `aria-live="polite"` 和等宽数字。
- 每个文件继续使用 `role="progressbar"`、`aria-valuemin`、`aria-valuemax`、`aria-valuenow`。
- 状态文字改为 token 化：
  - 已完成：`--success`
  - 建议检查：`--warning`
  - 识别失败：`--danger`
  - 取消 / 等待：中性文字
- 进度条保留克制的暖色渐变，失败 / 完成 / 取消分别使用语义色。

## 4. 主题适配方式

本阶段没有新增主题存储逻辑，继续使用 Phase 8.2 的主题系统：

```text
kairos-finance.theme = system | light | dark
```

上传区只读取 CSS variables，不写入 `localStorage`，不保存任何 Token、API Key、发票内容、图片 base64 或敏感信息。

## 5. 未改动核心链路

本阶段未修改：

- OCR 模型路由。
- `/api/ocr` 鉴权逻辑。
- DashScope / Qwen 配置。
- Excel 导出逻辑。
- `print.html` 打印核心逻辑。
- Docker / Nginx / `server.js` 部署逻辑。
- OCR 缓存结构和识别流程。
- PDF / 图片压缩 / OCR 请求调用链。

## 6. 测试结果

新增 / 更新测试覆盖：

1. 上传区文案仍显示。
2. 上传说明仍包含 JPG、PNG、PDF 和单次最多 10 个文件。
3. 隐私说明仍说明原始文件不会保存在服务器。
4. 上传区和批量进度区域使用 Phase 8 token 类。
5. drag-active / hover 不再依赖大面积黄色。
6. 批量进度保留 `aria-live` 与 `progressbar`。
7. 上传 UI 不出现工程词。
8. 上传 UI 不出现真实访问凭证或图片 base64。

验证结果：

```text
node --test tests/phase8-theme.test.js
tests 9
pass 9
fail 0

node --test tests/phase4-ux.test.js
tests 25
pass 25
fail 0

npm test
tests 177
pass 177
fail 0
```

备注：完整测试使用授权环境运行，因为普通沙箱环境中的本地 HTTP 监听测试会触发 `127.0.0.1 listen EPERM`。
