# Kairos-Finance 开放问题

> 只记录会影响阶段实现、且当前资料不足以安全决定的问题。
> 已确定的边界不在此重复。

## Q-001：浏览器如何取得 `OCR_ACCESS_TOKEN`

- 状态：已解决（Phase 3 已批准并实施）
- 影响阶段：Phase 3 安全加固、Phase 4 设置体验、Phase 6 自托管部署
- 决策：采用混合鉴权。
  - 正式自托管由 Nginx 保护整站，并从仓库外的 secret 片段向 Node 注入内部访问凭证；浏览器不接触该值，Node 只监听 `127.0.0.1`。
  - 本地开发或无反代兼容环境在收到 403 后允许用户输入“访问凭证”，只保存于 `sessionStorage`，最多自动重试一次。
  - 生产环境 Node 始终校验；自托管缺少服务端配置时拒绝启动，兼容函数入口安全拒绝请求。
- 禁止：凭证不得进入 HTML、JS 常量、构建变量、`localStorage`、IndexedDB、仓库或日志。
- 后续：Phase 4 只改善该流程的界面呈现，不改变存储边界；Phase 6 补全容器 secret、部署与回滚操作。

## Q-002：`qwen3.7-plus` 自动复查的输入形态

- 状态：已解决（Phase 1 设计决策）
- 影响阶段：Phase 1 模型路由、Phase 2 Schema 校验
- 已确定：`mode=normal` 首轮使用 `qwen3-vl-flash`，失败或校验失败时使用 `qwen3.7-plus` 自动复查。
- 核验结论：DashScope 官方模型说明与视觉调用示例确认 `qwen3.7-plus` 支持图像输入，可以与两款 Qwen3-VL 模型共用多模态请求协议。
- 设计决策：自动复查重新接收浏览器已压缩的同一张发票图片，并使用强调日期、发票号码、金额、税额和价税合计的复查提示词；不把首轮模型原文作为复查输入。
- 理由：重新看原图既能修复结构输出问题，也能修复文字误读和字段对应错误；不传首轮原文可避免错误结果锚定第二次识别。
- 参考：<https://help.aliyun.com/zh/model-studio/vision-model>、<https://help.aliyun.com/zh/model-studio/vision>。

## Q-003：现有未提交工作如何纳入后续阶段提交

- 状态：Phase 1 提交边界已确定，后续阶段继续按同一原则观察
- 影响阶段：Phase 1 及以后所有提交
- 当前事实：工作树在 Phase 0 开始前已包含大量已修改和未跟踪文件，其中 `api/ocr-service.js`、`server.js`、`tests/` 与后续阶段范围重叠。
- `AGENT.md` 也是未跟踪文件，且“只有 Vercel API / 使用 vercel dev / package 只有部署脚本”等描述与当前工作树不一致；后续不能把这些段落当作运行事实。
- 暂行处理：
  - 以当前工作树为权威基线，不回退、不覆盖已有工作。
  - 每个 Phase 只按精确路径暂存，并在提交前检查 staged diff。
  - 若后续发现无法区分既有改动与本阶段改动，先在幕僚长线程汇报，再决定提交边界。
- Phase 1 决策（2026-07-05）：
  - Git HEAD 早于当前已审计的自托管服务、独立 OCR service、浏览器 OCR 编排与测试基线；这些文件在 Phase 1 开始前已经与本阶段必需改动重叠。
  - 对 `api/ocr.js`、`api/ocr-service.js`、`server.js`、`js/utils/ocrClient.js`、`js/utils/storageRepository.js` 和 Phase 1 选定测试采用“当前权威文件完整纳入”的边界。`storageRepository.js` 是已审计 OCR cache store 的实际载体；若只暂存少数 hunk，会产生一个不代表当前系统、且无法独立验证的提交快照。
  - Phase 1 新建自包含的 `phase1-browser.test.js` 与 `phase1-self-hosting.test.js`；不把 Phase 1 前已存在、且混有 UI / 页面基线断言的未跟踪测试文件纳入本阶段提交。
  - 仍严格排除与 Phase 1 无关的 UI 组件、导出、打印、品牌资源、`.DS_Store` 和其他工作树改动；提交说明必须披露上述基线重叠，不把既有内容冒充为本阶段新实现。

## Q-004：Phase 1 与 Phase 2 的自动复查验收边界

- 状态：已解决（分阶段验收）
- 影响阶段：Phase 1 模型路由、Phase 2 Schema 校验
- 当前冲突：
  - Phase 1 要求 `mode=normal` 在“失败或校验失败”时自动复查。
  - 正式的 `invoice-schema.js`、字段校验与状态生成安排在 Phase 2。
- 风险：若 Phase 1 没有正式校验却宣称“校验失败自动复查”完成，会形成虚假验收；若提前把完整 Schema 纳入 Phase 1，又会破坏单阶段提交边界。
- 实施决策：
  - Phase 1 完成请求失败、上游异常和 JSON 解析失败的自动复查，并在 model router 中预留可注入的校验判定。
  - Phase 2 实现完整 Schema 后接通“字段校验失败自动复查”，再完成这一条的最终验收。
  - 两个 Phase 的报告与提交说明必须分别写清已覆盖和未覆盖的触发条件。
