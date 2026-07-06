# Kairos Finance Phase 5 构建系统说明

## 结论

Phase 5 不引入 Vite，先保持当前“静态页面 + 自托管 Node 服务”的运行方式。

本阶段只纳入：

- `package.json`：补齐本地开发、启动和测试脚本；不提供 Vercel 部署脚本。
- `package-lock.json`：锁定当前 npm 工程元信息，确保后续新增 npm 依赖时有统一 lockfile。
- 本文档：记录 Vite 评估、当前依赖边界和后续迁移条件。

## 为什么暂不迁移 Vite

当前前端仍依赖浏览器侧顺序加载：

- React / ReactDOM UMD 全局对象。
- Babel Standalone 在浏览器内转换 `type="text/babel"` 组件。
- Tailwind CDN 在浏览器内生成样式。
- Lucide、Dexie、Spark-MD5 等库通过全局变量供现有脚本使用。
- PDF.js、ExcelJS、html2pdf 已通过 `libs/` 保持本地静态文件。

直接迁移到 Vite 会要求同时处理：

1. JSX 从浏览器 Babel 改为构建期编译。
2. 全局变量组件改为模块导入或显式挂载。
3. Tailwind CDN 运行时改为构建期 CSS 产物。
4. `print.html`、PDF.js worker、Web Worker、OffscreenCanvas、ExcelJS 和 OCR 缓存路径的兼容验证。

这些改动会明显扩大 Phase 5 范围，容易破坏当前可静态运行的页面。因此本阶段不迁移 Vite。

## 当前运行方式

推荐开发启动方式：

```bash
npm start
```

等价于：

```bash
node server.js
```

测试方式：

```bash
npm test
```

等价于：

```bash
node --test tests/*.test.js
```

生产自托管仍以 `server.js` 为主，Vercel `api/ocr.js` 只保留兼容入口。

`package.json` 不保留 `vercel --prod` 或等价部署脚本，避免把兼容入口误用为正式部署路径。

## 依赖边界

已本地化并保留的运行时文件：

- `libs/pdf.min.js`
- `libs/pdf.worker.min.js`
- `libs/cmaps/`
- `libs/exceljs.min.js`
- `libs/html2pdf.bundle.min.js`

仍通过 CDN 加载的运行时依赖：

- React / ReactDOM
- Babel Standalone
- Tailwind CDN
- Lucide
- Dexie
- Spark-MD5
- Google Fonts

这些 CDN 依赖暂不在 Phase 5 改写为本地文件。原因是 Tailwind CDN 与浏览器 Babel 共同参与当前页面渲染，局部替换会制造“看似本地化、实际行为不同”的中间状态。

## 后续如需迁移 Vite 的前置条件

若后续单独启动构建迁移阶段，建议先完成：

1. 把所有 `type="text/babel"` 组件改为模块化源码。
2. 为 Tailwind 建立构建期扫描配置，并验证动态 class 不丢失。
3. 为 `print.html` 保留独立静态入口。
4. 为 PDF.js worker、image worker、Excel 导出、OCR 缓存和 IndexedDB 升级链建立浏览器回归测试。
5. 保留无需构建即可由 `server.js` 静态托管的兼容路径，直到新构建链路稳定。

## 验证记录

Phase 5 应至少运行：

```bash
npm test
```

以及：

```bash
node --test tests/phase4-ux.test.js tests/ui-layering.test.js tests/phase1-browser.test.js tests/phase2-browser.test.js tests/phase3-browser-security.test.js
```

如在受限沙箱中出现 `listen EPERM: operation not permitted 127.0.0.1`，需在允许本地监听的环境中重跑后再判断。
