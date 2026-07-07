# Kairos Finance 本轮升级最终收口检查

日期：2026-07-07
分支：`main`
范围：只做收口核查、文档脱敏和验收记录；未新增功能，未重构核心链路。

## 1. Git 状态

本轮收口开始时运行：

```bash
git status --short
```

结果：无输出，说明开始检查时工作区干净。

生成本报告前的状态：

```text
 M docs/final-upgrade-report.md
```

说明：该变更只用于脱敏真实样本文件名，并修正旧脏文件状态的历史表述。新增本报告后，工作区还会出现 `docs/release-closure-report.md`。

## 2. `final-upgrade-report.md` 中旧脏文件逐项判断

| 文件 | 当前归属 | 判断 | 说明 |
| --- | --- | --- | --- |
| `README.md` | 已在 `58dac3a chore: finalize Kairos Finance upgrade` 纳入 | 应纳入最终提交 | README 是最终使用、部署、环境变量、安全边界和测试说明入口，已纳入最终升级收口。 |
| `js/utils/imageProcessor.js` | 已在 `58dac3a` 纳入 | 应纳入最终提交 | 属于 PDF/图片预处理核心链路；不允许未知改动进入部署，当前已被提交并由 `ocr-core`、Phase 相关测试覆盖。 |
| `js/components/PDFTemplate.js` | 已在 `58dac3a` 纳入 | 应纳入最终提交 | 属于导出预览/打印样式链路；当前仅作为已确认资产引用和模板调整进入最终提交。 |
| `print.html` | 已在 `58dac3a` 纳入 | 应纳入最终提交 | 属于既有打印链路，保留 `printJobs`/Dexie 路径；已由 Phase 4 测试覆盖。 |
| 黑色 SVG | `assets/Kairos Finance Black.svg`、`assets/Kairos Logo Black.svg` 已在 `58dac3a` 新增 | 应纳入最终提交 | PDF/打印场景需要黑色 Logo 资源；命名已统一使用 Kairos，不包含旧直译命名。 |
| `tests/self-hosting.test.js` | 已在 `8a4674b chore: clean local residues` 纳入 | 应纳入最终提交 | 覆盖自托管入口、OCR 兼容与安全响应，属于最终回归证据的一部分。 |
| `tests/ocr-core.test.js` | 已在 `8a4674b` 纳入 | 应纳入最终提交 | 覆盖浏览器 OCR 核心缓存、增强识别、超时和响应归一化，属于最终回归证据的一部分。 |

结论：上述旧脏文件均已完成明确归属，没有未知核心链路改动留在工作区。

## 3. 命名与隐私扫描

执行扫描：

```bash
rg -n "<Kairos 命名残留与真实样本/个人文件名关键词>" . --glob '!node_modules' --glob '!.git'
```

结果：

- `docs/` 中真实样本路径和个人报销文件名已脱敏为 `真实样本 A/B/C/D`。
- 全仓未发现旧直译命名或 Kairos 误拼命名残留。
- 仍有一处 `data/version.json` 的版本说明包含铁路票据中文乱码相关历史文案，这是历史版本说明，不是文件名、路径或部署命名残留；本轮不修改数据版本历史。

关于 GitHub 上传边界：

- `docs/` 是内部交付与审计资料，本轮不建议上传到 GitHub。
- 当前仓库历史中已经包含 `docs/` 提交；如果要严格保证 GitHub 不包含 docs 文件夹和历史内容，不能直接推送当前分支到公开仓库。
- 推荐另起发布分支或导出包，明确排除 `docs/`；如需彻底清除历史中的 docs，需要单独授权做历史重写或干净发布分支。

## 4. README 状态

`README.md` 已纳入 `58dac3a chore: finalize Kairos Finance upgrade`，不是未提交残留。

## 5. Excel 导出人工验收记录

验收方式：使用当前仓库 `libs/exceljs.min.js` 和 `js/utils/exportManager.js`，在同一浏览器模拟上下文内调用真实 `exportToExcel(items, columns, reimbursementInfo, onProgress)`，生成并读回 `.xlsx`。

验收输出：

```text
outputPath: /private/tmp/kairos-finance-excel-acceptance.xlsx
blobSize: 7254
clicked: true
download: 报销单_Kairos_2026-07-07.xlsx
worksheetName: 报销单
title: 报销单
info: 报销人: Kairos    项目: Finance 验收    日期: 2026-07-07
payment: 打款信息: 人工验收占位
header: 日期 / 发票号码 / 销售方 / 类别 / 金额 / 税额 / 价税合计 / 来源文件
firstDataRow: 2025-12-22 / KF-A-001 / Supplier A / 项目支出 / 174.33 / 22.66 / 196.99 / 真实样本 A
secondDataRow: 2025-12-23 / KF-D-001 / Supplier D / 交通 / 139 / 0 / 139 / 真实样本 D
totalRow: 总计 / 313.33
```

结论：Excel 文件生成、下载文件名、工作表、抬头、表头和数据行读回均正常。当前汇总行沿用既有逻辑按 `amount` 求和，下一阶段可再确认业务口径是否需要改为价税合计；本轮不改动功能逻辑。

## 6. Qwen 配置探针

执行：

```bash
npm run check:qwen-config
```

结果：

```json
{
  "ok": true,
  "endpointType": "dashscope-workspace-native",
  "workspaceId": "ws-tqo6v9uu3nxxjq6x",
  "apiMode": "dashscope-native",
  "thinking": "false",
  "timeoutMs": 60000,
  "maxRetries": 1,
  "models": {
    "primary": "qwen3-vl-flash",
    "fallback": "qwen3.7-plus",
    "highAccuracy": "qwen3-vl-plus"
  },
  "problems": []
}
```

API Key 未打印。

## 7. Kairos Finance 业务空间三模型可调用性

使用本地合成 PNG 进行 DashScope 原生 `multimodal-generation/generation` 探针，未使用真实发票，未打印 API Key 或图片内容。

| 模型 | HTTP | 是否有输出 | 结论 |
| --- | ---: | --- | --- |
| `qwen3-vl-flash` | 200 | 是 | 可调用 |
| `qwen3.7-plus` | 200 | 是 | 可调用 |
| `qwen3-vl-plus` | 200 | 是 | 可调用 |

说明：第一次用 1x1 PNG 探针时三个模型均返回图片尺寸限制错误；改用尺寸合规的合成 PNG 后全部成功。这是测试输入尺寸问题，不是业务空间权限问题。

## 8. 最终测试

执行：

```bash
npm test
```

结果：

```text
tests 166
pass 166
fail 0
duration_ms 389.15875
```

## 9. 收口结论

- 本轮升级核心链路没有未知未提交改动。
- 旧脏文件已经逐项归属并纳入对应提交。
- README 已纳入最终提交。
- 真实样本文件名已从 `docs/` 当前内容中脱敏。
- DashScope 原生路径、业务空间配置和三个模型可调用性均通过验证。
- 完整测试通过。
- 发布到 GitHub 前仍需单独处理 `docs/` 排除策略；不要直接把包含内部 docs 历史的分支原样公开推送。
