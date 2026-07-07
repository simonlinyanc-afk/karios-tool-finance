import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const readProjectFile = relativePath => fs.readFile(path.join(projectRoot, relativePath), 'utf8');

async function readUiSources() {
  const paths = [
    'index.html',
    'js/utils/uploadWorkspaceState.js',
    'js/components/UploadZone.js',
    'js/components/ReimbursementTable.js',
    'js/components/ExportPreviewModal.js',
    'js/components/SystemModals.js',
    'js/components/AppHeader.js'
  ];
  const sources = await Promise.all(paths.map(readProjectFile));
  return Object.fromEntries(paths.map((file, index) => [file, sources[index]]));
}

async function loadClassicScript(relativePath, extraWindow = {}) {
  const source = await readProjectFile(relativePath);
  const window = { ...extraWindow };
  const context = vm.createContext({
    console,
    window,
    URL: { createObjectURL: file => `blob:${file?.name || 'file'}` },
    AbortController,
    DOMException,
    File,
    Blob,
    Intl,
    fetch: extraWindow.fetch || (async () => ({ ok: true, status: 200, json: async () => ({}) })),
    setTimeout,
    clearTimeout
  });
  context.window.window = window;
  context.window.URL = context.URL;
  context.window.fetch = context.fetch;
  context.window.AbortController = AbortController;
  context.window.DOMException = DOMException;
  context.window.setTimeout = setTimeout;
  context.window.clearTimeout = clearTimeout;
  vm.runInContext(source, context);
  return context.window;
}

test('finance formatter reuses Intl.NumberFormat and always shows two decimals', async () => {
  const source = await readProjectFile('js/utils/finance.js');
  const window = await loadClassicScript('js/utils/finance.js');

  assert.match(source, /new Intl\.NumberFormat\(['"]zh-CN['"]/u);
  assert.match(source, /minimumFractionDigits:\s*2/u);
  assert.match(source, /maximumFractionDigits:\s*2/u);
  assert.equal(window.formatCurrency(0), '0.00');
  assert.equal(window.formatCurrency(12.3), '12.30');
  assert.equal(window.formatCurrency(1234.5), '1,234.50');
  assert.equal(window.formatCurrency(Number.NaN), '0.00');
});

test('upload zone explains formats limits privacy and exposes accessible progress', async () => {
  const [source, indexSource] = await Promise.all([
    readProjectFile('js/components/UploadZone.js'),
    readProjectFile('index.html')
  ]);

  assert.match(source, /拖入发票，自动整理报销明细/u);
  assert.match(source, /支持 JPG、PNG、PDF。/u);
  assert.match(source, /单次最多 10 个文件，PDF 默认识别第 1 页。/u);
  assert.doesNotMatch(source, /浏览器中压缩图片/u);
  assert.doesNotMatch(source, /原始文件不会保存在服务器/u);
  assert.match(source, /accept="image\/jpeg,image\/png,application\/pdf"/u);
  assert.match(source, /aria-live="polite"/u);
  assert.match(source, /role="progressbar"/u);
  assert.match(source, /aria-valuemin=\{0\}/u);
  assert.match(source, /aria-valuemax=\{100\}/u);
  assert.match(source, /aria-label=\{`取消/u);
  assert.match(indexSource, /prefers-reduced-motion:\s*reduce/u);
});

test('batch and row statuses use the approved user language', async () => {
  const sources = await readUiSources();
  const upload = `${sources['js/utils/uploadWorkspaceState.js']}\n${sources['js/components/UploadZone.js']}`;
  const table = sources['js/components/ReimbursementTable.js'];

  for (const label of ['等待识别', '正在识别', '识别完成', '建议检查', '识别失败']) {
    assert.match(`${upload}\n${table}`, new RegExp(label, 'u'));
  }
  assert.doesNotMatch(upload, /等待中|处理中\.\.\.|>完成<|>失败</u);
  assert.doesNotMatch(table, /label:\s*['"](?:处理中|待检查|就绪|失败)['"]/u);
});

test('failed and review rows expose every required recovery action', async () => {
  const table = await readProjectFile('js/components/ReimbursementTable.js');
  for (const action of ['重新识别', '增强识别', '手动填写', '确认无误', '手动修改']) {
    assert.match(table, new RegExp(action, 'u'));
  }
  assert.match(table, /mode:\s*['"]normal['"]/u);
  assert.match(table, /mode:\s*['"]high_accuracy['"]/u);
  assert.match(table, /warningFlags:\s*\[\]/u);
  assert.match(table, /status:\s*['"]ready['"]/u);
  assert.match(table, /需要重新选择文件/u);
});

test('table interactions use native buttons, named inputs, sorting state and long-list containment', async () => {
  const table = await readProjectFile('js/components/ReimbursementTable.js');

  assert.match(table, /aria-sort=/u);
  assert.match(table, /<button[\s\S]*?onClick=\{\(\) => handleSort\(col\.id\)\}/u);
  assert.match(table, /aria-label=\{`预览/u);
  assert.match(table, /width=\{48\}/u);
  assert.match(table, /height=\{48\}/u);
  assert.match(table, /name=\{`invoice-/u);
  assert.match(table, /aria-label=\{`第 \$\{rowIndex \+ 1\} 行/u);
  assert.match(table, /inputMode="decimal"/u);
  assert.match(table, /tabular-nums/u);
  assert.match(table, /contentVisibility:\s*['"]auto['"]/u);
  assert.match(table, /containIntrinsicSize:/u);
  assert.doesNotMatch(table, /<img[^>]*onClick=/u);
});

test('recognition sources map to approved copy without exposing technical metadata', async () => {
  const table = await readProjectFile('js/components/ReimbursementTable.js');
  for (const copy of [
    '已从本地记录恢复',
    '系统已自动再识别一次',
    '已使用增强识别',
    '已手动修改'
  ]) {
    assert.match(table, new RegExp(copy, 'u'));
  }
  assert.doesNotMatch(table, />[^<{]*(?:fallback|schema|JSON|MD5|IndexedDB|DashScope|model|Bearer|Token|OCR 失败|缓存命中|Popup Blocker|Draft)[^<{]*</iu);
});

test('recognition errors are sanitized and always give a next action', async () => {
  const window = await loadClassicScript('js/utils/ocrClient.js');
  const file = new File(['demo'], 'invoice.jpg', { type: 'image/jpeg' });
  const raw = 'HTTP 500 DashScope JSON schema model failure /private/secret';
  const item = window.createFailedItem(
    file,
    false,
    new Error(raw),
    { reimburser: 'Lin', project: 'Kairos' }
  );

  assert.equal(item.status, 'failed');
  assert.match(item.description, /暂时没有识别成功/u);
  assert.match(item.description, /重新识别/u);
  assert.match(item.description, /增强识别/u);
  assert.match(item.description, /手动填写/u);
  assert.doesNotMatch(`${item.description}\n${item.lastError}`, /HTTP|DashScope|JSON|schema|model|secret/iu);
});

test('enhanced recognition bypasses recovery and records only a safe local source', async () => {
  let cacheReads = 0;
  let historyReads = 0;
  const window = await loadClassicScript('js/utils/ocrClient.js', {
    processImage: async () => ({
      compressedBase64: 'data:image/jpeg;base64,Zm9v',
      fileHash: 'phase4-enhanced'
    }),
    storageRepo: {
      getCachedOcrResult: async () => { cacheReads += 1; return null; },
      findRecordByHash: async () => { historyReads += 1; return null; },
      saveCachedOcrResult: async () => {}
    },
    fetch: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'ready',
        data: {
          date: '2026-07-06',
          invoiceNumber: 'INV-4',
          amount: 10,
          tax: 0,
          subtotal: 10,
          totalWithTax: 10,
          description: '测试'
        },
        warnings: [],
        meta: { model: 'private-model-name', fallbackUsed: false, latencyMs: 5 }
      })
    })
  });

  const item = await window.processInvoiceFile(
    new File(['demo'], 'invoice.jpg', { type: 'image/jpeg' }),
    false,
    { reimburser: 'Lin', project: 'Kairos' },
    { mode: 'high_accuracy' }
  );

  assert.equal(cacheReads, 0);
  assert.equal(historyReads, 0);
  assert.equal(item.recognitionSource, 'high_accuracy');
  assert.doesNotMatch(item.description, /private-model-name/u);
});

test('single-item retry forwards mode and visible batch errors never interpolate raw messages', async () => {
  const indexSource = await readProjectFile('index.html');
  assert.match(indexSource, /processInvoiceFile\(file, isPDF, reimbursementInfo, \{[\s\S]*?mode:\s*options\.mode\s*\|\|\s*['"]normal['"]/u);
  assert.doesNotMatch(indexSource, /triggerToast\(`[^`]*\$\{error\.message\}/u);
  assert.doesNotMatch(indexSource, /triggerToast\([^\n]*(?:OCR|缓存命中|fallback|schema|JSON|MD5|IndexedDB|DashScope|model|Bearer|Token|Popup Blocker|Draft)/iu);
});

test('dialogs expose names modal semantics Escape support and explicit transitions', async () => {
  const sources = await readUiSources();
  const modalSource = `${sources['js/components/SystemModals.js']}\n${sources['js/components/ExportPreviewModal.js']}\n${sources['index.html']}`;

  assert.match(modalSource, /role="dialog"/u);
  assert.match(modalSource, /aria-modal="true"/u);
  assert.match(modalSource, /aria-labelledby=/u);
  assert.match(modalSource, /event\.key === ['"]Escape['"]/u);
  assert.match(modalSource, /overscroll-contain/u);
  // Focus states are provided globally via the shared :focus-visible ring, so
  // shell controls (btn-primary / footer-link / modal-close) inherit it.
  const css = await readProjectFile('css/style.css');
  assert.match(css, /:focus-visible/u);
  assert.doesNotMatch(modalSource, /transition-all/u);
  assert.doesNotMatch(modalSource, />[^\n<{]*(?:OCR|Draft|Popup Blocker)[^\n<{]*</iu);
});

test('export preview distinguishes review and failure actions in user language', async () => {
  const source = await readProjectFile('js/components/ExportPreviewModal.js');
  for (const copy of ['已完成', '建议检查', '识别失败', '先去检查', '查看失败项', '导出 Excel', '打印 / 另存 PDF']) {
    assert.match(source, new RegExp(copy, 'u'));
  }
  assert.doesNotMatch(source, /仍然导出|仍然打印/u);
  assert.doesNotMatch(source, /['"]OCR 失败['"]|['"]就绪['"]|['"]待检查['"]|['"]失败['"]/u);
});

test('print page declares the same Dexie v5 stores used by the app', async () => {
  const [printSource, storageSource] = await Promise.all([
    readProjectFile('print.html'),
    readProjectFile('js/utils/storageRepository.js')
  ]);
  const expectedSchema = [
    "drafts: '++id, timestamp'",
    "history: '++id, timestamp, total, count, fileHashIndex'",
    "templates: '++id, timestamp, name'",
    "ocrCache: 'fileHash, updatedAt, modelVersion, promptVersion'",
    "printJobs: '++id, timestamp'"
  ];
  assert.match(printSource, /db\.version\(5\)\.stores\(/u);
  for (const entry of expectedSchema) {
    assert.match(storageSource, new RegExp(entry.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
    assert.match(printSource, new RegExp(entry.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
  }
});

test('cancelling a queued batch item before its controller exists prevents all work and results', async () => {
  const processedFiles = [];
  const window = await loadClassicScript('js/utils/ocrClient.js', {
    processImage: async file => {
      processedFiles.push(file.name);
      return { compressedBase64: 'data:image/jpeg;base64,Zm9v', fileHash: `hash-${file.name}` };
    },
    storageRepo: {
      getCachedOcrResult: async () => null,
      findRecordByHash: async () => null,
      saveCachedOcrResult: async () => {}
    },
    fetch: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'ready',
        data: { date: '2026-07-06', invoiceNumber: 'INV', amount: 1, tax: 0, subtotal: 1, totalWithTax: 1, description: '测试' },
        warnings: [],
        meta: {}
      })
    })
  });
  const files = ['one.jpg', 'two.jpg', 'queued.jpg'].map(name => new File(['x'], name, { type: 'image/jpeg' }));
  const progress = [];
  const results = await window.processBatchFiles(
    files,
    { reimburser: 'Lin', project: 'Kairos' },
    (index, status) => progress.push([index, status]),
    (index, controller) => { if (index === 2) controller.abort(); }
  );

  assert.equal(processedFiles.includes('queued.jpg'), false);
  assert.equal(results[2], null);
  assert.equal(progress.some(([index, status]) => index === 2 && status === 'cancelled'), true);
});

test('queue cancellation state survives until delayed controllers register', async () => {
  const indexSource = await readProjectFile('index.html');
  assert.match(indexSource, /cancelledIndexes(?:Ref)?\s*=\s*React\.useRef\(new Set\(\)\)/u);
  assert.match(indexSource, /cancelledIndexes(?:Ref)?\.current\.add\(index\)/u);
  assert.match(indexSource, /cancelledIndexes(?:Ref)?\.current\.has\(index\)[\s\S]*?controller\.abort\(\)/u);
  assert.match(indexSource, /if \(cancelledIndexes(?:Ref)?\.current\.has\(index\)\) return/u);
  assert.match(indexSource, /status:\s*['"]cancelled['"]/u);
});

test('editable money formatting keeps finite values at two decimals without grouping', async () => {
  const window = await loadClassicScript('js/utils/finance.js');
  const table = await readProjectFile('js/components/ReimbursementTable.js');
  assert.equal(window.formatEditableMoney(10), '10.00');
  assert.equal(window.formatEditableMoney(12.3), '12.30');
  assert.equal(window.formatEditableMoney(Number.NaN), '0.00');
  assert.match(table, /const MoneyInput\s*=\s*React\.memo/u);
  assert.match(table, /formatEditableMoney/u);
  assert.match(table, /onBlur=/u);
});

test('invoice rows use identity memoization and stable handler indirection', async () => {
  const table = await readProjectFile('js/components/ReimbursementTable.js');
  assert.match(table, /const MemoizedInvoiceRow\s*=\s*React\.memo/u);
  assert.match(table, /previous\.item === next\.item/u);
  assert.match(table, /previous\.visibleColumns === next\.visibleColumns/u);
  assert.match(table, /handlerRef\s*=\s*React\.useRef/u);
  assert.match(table, /React\.useMemo\(\(\) => \(\{/u);
});

test('every large dialog shares the same focus trap and scroll lock hook', async () => {
  const [system, exportPreview, indexSource] = await Promise.all([
    readProjectFile('js/components/SystemModals.js'),
    readProjectFile('js/components/ExportPreviewModal.js'),
    readProjectFile('index.html')
  ]);
  assert.match(system, /window\.useModalAccessibility\s*=\s*useAccessibleModal/u);
  assert.match(exportPreview, /window\.useModalAccessibility\(/u);
  assert.match(indexSource, /window\.useModalAccessibility\(/u);
  assert.match(system, /event\.key !== ['"]Tab['"]/u);
  assert.match(system, /previousFocusRef\.current\?\.focus/u);
  assert.match(system, /document\.body\.style\.overflow = ['"]hidden['"]/u);
  assert.match(system, /FOCUSABLE_MODAL_SELECTOR\s*=\s*['"][\s\S]*?button:not\(\[disabled\]\)[\s\S]*?input:not\(\[disabled\]\)[\s\S]*?select:not\(\[disabled\]\)[\s\S]*?textarea:not\(\[disabled\]\)/u);
  assert.match(system, /querySelectorAll\(FOCUSABLE_MODAL_SELECTOR\)/u);
  assert.match(system, /querySelector\(FOCUSABLE_MODAL_SELECTOR\)/u);
  assert.match(system, /!dialogRef\.current\?\.contains\(document\.activeElement\)/u);
  assert.match(system, /if \(!focusable\?\.length\) \{[\s\S]*?event\.preventDefault\(\);[\s\S]*?dialogRef\.current\?\.focus\?\.\(\);[\s\S]*?return;[\s\S]*?\}/u);
});

test('hidden upload input has a name and leaves the tab order', async () => {
  const upload = await readProjectFile('js/components/UploadZone.js');
  assert.match(upload, /id="fileInput"[\s\S]*?aria-label="选择发票文件"/u);
  assert.match(upload, /id="fileInput"[\s\S]*?tabIndex=\{-1\}/u);
});

test('export and print failures use safe user copy with a next action', async () => {
  const [exportManager, printSource] = await Promise.all([
    readProjectFile('js/utils/exportManager.js'),
    readProjectFile('print.html')
  ]);
  assert.doesNotMatch(exportManager, /alert\([^\n]*(?:ExcelJS|Popup Blocker|e\.message)/u);
  assert.match(exportManager, /请刷新页面后重试/u);
  assert.match(exportManager, /请允许当前页面打开新窗口/u);
  assert.doesNotMatch(printSource, /error-message['"]\)\.textContent\s*=\s*error\.message/u);
  assert.match(printSource, /请返回主页面重新打开打印预览/u);
});

test('empty save toast explains how to create saveable content', async () => {
  const indexSource = await readProjectFile('index.html');
  assert.match(indexSource, /triggerToast\('当前没有可保存内容。请先添加发票或填写项目信息后再保存。', 'warning'\)/u);
  assert.doesNotMatch(indexSource, /alert\('无可保存内容'\)|alert\('当前没有可保存内容/u);
});

test('phase 4 docs describe export manager and print safe-error boundaries', async () => {
  const [implementationPlan, uxPlan] = await Promise.all([
    readProjectFile('docs/plans/2026-07-06-phase-4-ux-implementation.md'),
    readProjectFile('docs/ux-design-plan.md')
  ]);

  for (const source of [implementationPlan, uxPlan]) {
    assert.match(source, /exportManager\.js/u);
    assert.match(source, /print\.html/u);
    assert.match(source, /安全(?:打印)?错误(?:提示)?文案/u);
  }
});

test('row deletion asks for confirmation before mutating data', async () => {
  const [table, system] = await Promise.all([
    readProjectFile('js/components/ReimbursementTable.js'),
    readProjectFile('js/components/SystemModals.js')
  ]);
  assert.match(table, /await requestConfirm\(\{[\s\S]*title: '删除这条发票记录？'[\s\S]*confirmText: '确认删除'/u);
  assert.match(table, /if \(!confirmed\) return;[\s\S]*deleteItem\(item\.id\);/u);
  assert.match(system, /ConfirmDialog: \(\{ confirmDialog, onCancel, onConfirm \}\)/u);
});

test('minor accessibility copy fixes keep controls and images explicit', async () => {
  const [indexSource, appHeader, system] = await Promise.all([
    readProjectFile('index.html'),
    readProjectFile('js/components/AppHeader.js'),
    readProjectFile('js/components/SystemModals.js')
  ]);
  assert.match(indexSource, /<button[\s\S]*?versionData[\s\S]*?v\{versionData/u);
  assert.match(appHeader, /<img[^>]*width=/u);
  assert.match(system, /<img[^>]*width=/u);
  assert.match(system, /正在准备导出文件/u);
  assert.doesNotMatch(system, /Processing Request/u);
  assert.match(await readProjectFile('js/components/ReimbursementTable.js'), /autoComplete="off"/u);
});

test('v2 upgrade badge and first-run report use safe user-facing copy', async () => {
  const [indexSource, modalSource, versionRaw, packageRaw, readme] = await Promise.all([
    readProjectFile('index.html'),
    readProjectFile('js/components/VersionModal.js'),
    readProjectFile('data/version.json'),
    readProjectFile('package.json'),
    readProjectFile('README.md')
  ]);
  const versionData = JSON.parse(versionRaw);
  const packageData = JSON.parse(packageRaw);
  const visibleUpgradeCopy = [
    versionData.title,
    versionData.intro,
    ...(versionData.updates || []),
    versionData.reminder || ''
  ].join('\n');

  assert.equal(versionData.version, '2.0.0');
  assert.equal(packageData.version, '2.0.0');
  assert.match(readme, /当前网页版本：v2\.0\.0/u);
  assert.match(indexSource, /v\{versionData \? versionData\.version : ['"]\.\.\.['"]\}/u);
  assert.match(versionData.title, /Kairos Finance 已升级到 v2\.0\.0/u);
  assert.match(modalSource, /开始使用/u);
  assert.match(modalSource, /查看历史更新内容/u);
  assert.match(indexSource, /Kairos Studio©️ 2026/u);
  assert.match(indexSource, /数据仅保存在本地/u);
  assert.match(indexSource, /Powered by Qwen/u);
  const oldVersionPattern = new RegExp([
    ['1', '2', '4'].join('\\.') + '-alpha',
    ['1', '2', '5'].join('\\.') + '-alpha',
    'v1\\.[0-9]+\\.[0-9]+',
    `© Kairos ${'Finance'}`
  ].join('|'), 'u');
  assert.doesNotMatch(`${indexSource}\n${modalSource}\n${versionRaw}\n${packageRaw}\n${readme}`, oldVersionPattern);
  assert.doesNotMatch(visibleUpgradeCopy, /fallback|schema|JSON|MD5|IndexedDB|DashScope|model/iu);
});

test('v2 upgrade report stores only a versioned seen flag and does not repeat after reading', async () => {
  const [indexSource, modalSource, versionRaw] = await Promise.all([
    readProjectFile('index.html'),
    readProjectFile('js/components/VersionModal.js'),
    readProjectFile('data/version.json')
  ]);
  const versionData = JSON.parse(versionRaw);
  const expectedKey = `kairos-finance.seenUpgrade.v${versionData.version}`;

  assert.equal(expectedKey, 'kairos-finance.seenUpgrade.v2.0.0');
  assert.match(indexSource, /const seenUpgradeKey = data && data\.version \? `kairos-finance\.seenUpgrade\.v\$\{data\.version\}` : null/u);
  assert.match(indexSource, /localStorage\.getItem\(seenUpgradeKey\) !== ['"]true['"]/u);
  assert.match(indexSource, /localStorage\.setItem\(`kairos-finance\.seenUpgrade\.v\$\{versionData\.version\}`, ['"]true['"]\)/u);
  assert.doesNotMatch(indexSource, /last_seen_version/u);
  assert.doesNotMatch(`${indexSource}\n${modalSource}\n${versionRaw}`, /OCR_ACCESS_TOKEN|QWEN_API_KEY|sk-[A-Za-z0-9]|data:image\/(?:jpeg|png);base64/iu);
});
