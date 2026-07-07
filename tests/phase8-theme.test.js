import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const themeStorageKey = 'kairos-finance.theme';
const allowedPreferences = ['system', 'light', 'dark'];
const themeTokens = [
  'background',
  'foreground',
  'surface',
  'surface-elevated',
  'muted-surface',
  'border',
  'subtle-border',
  'primary-text',
  'secondary-text',
  'tertiary-text',
  'primary-button-bg',
  'primary-button-text',
  'secondary-button-bg',
  'secondary-button-text',
  'focus-ring',
  'brand-warm',
  'danger',
  'warning',
  'success'
];

const readProjectFile = relativePath => fs.readFile(path.join(projectRoot, relativePath), 'utf8');

function extractThemeBootstrap(indexSource) {
  const match = indexSource.match(/<!-- Kairos theme bootstrap -->\s*<script>\s*([\s\S]*?)\s*<\/script>/u);
  assert.ok(match, 'index.html should include a Kairos theme bootstrap script before CSS loads');
  return match[1];
}

function createThemeRuntime({ storedPreference, prefersDark = false } = {}) {
  const storage = new Map();
  if (storedPreference !== undefined) {
    storage.set(themeStorageKey, storedPreference);
  }

  const listeners = new Set();
  const mediaQuery = {
    matches: prefersDark,
    media: '(prefers-color-scheme: dark)',
    addEventListener(eventName, listener) {
      if (eventName === 'change') listeners.add(listener);
    },
    removeEventListener(eventName, listener) {
      if (eventName === 'change') listeners.delete(listener);
    },
    addListener(listener) {
      listeners.add(listener);
    },
    removeListener(listener) {
      listeners.delete(listener);
    }
  };

  const documentElement = {
    dataset: {},
    style: {}
  };
  const window = {
    matchMedia(query) {
      assert.equal(query, '(prefers-color-scheme: dark)');
      return mediaQuery;
    }
  };

  const context = vm.createContext({
    console,
    window,
    document: { documentElement },
    localStorage: {
      getItem(key) {
        return storage.has(key) ? storage.get(key) : null;
      },
      setItem(key, value) {
        storage.set(key, String(value));
      },
      removeItem(key) {
        storage.delete(key);
      }
    }
  });
  context.window.window = window;
  context.window.document = context.document;
  context.window.localStorage = context.localStorage;

  return {
    context,
    documentElement,
    storage,
    dispatchSystemTheme(matches) {
      mediaQuery.matches = matches;
      for (const listener of listeners) {
        listener({ matches });
      }
    }
  };
}

async function loadThemeRuntime(options) {
  const indexSource = await readProjectFile('index.html');
  const source = extractThemeBootstrap(indexSource);
  const runtime = createThemeRuntime(options);
  vm.runInContext(source, runtime.context);
  return runtime;
}

test('theme bootstrap initializes system preference before CSS and exposes safe KairosTheme API', async () => {
  const runtime = await loadThemeRuntime({ prefersDark: false });

  assert.equal(runtime.documentElement.dataset.theme, 'light');
  assert.equal(runtime.documentElement.style.colorScheme, 'light');
  assert.equal(runtime.context.window.KairosTheme.getPreference(), 'system');
  assert.equal(runtime.context.window.KairosTheme.getActualTheme(), 'light');
  assert.equal(runtime.storage.size, 0, 'default system preference should not create storage noise');
});

test('theme API stores only light dark system preferences and normalizes invalid values', async () => {
  for (const preference of allowedPreferences) {
    const runtime = await loadThemeRuntime({ prefersDark: true });
    runtime.context.window.KairosTheme.setPreference(preference);

    assert.equal(runtime.storage.get(themeStorageKey), preference);
    assert.equal(runtime.context.window.KairosTheme.getPreference(), preference);
    assert.match(runtime.documentElement.dataset.theme, /^(light|dark)$/u);
  }

  const invalidRuntime = await loadThemeRuntime({ storedPreference: 'sepia', prefersDark: false });
  assert.equal(invalidRuntime.context.window.KairosTheme.getPreference(), 'system');
  assert.equal(invalidRuntime.documentElement.dataset.theme, 'light');
  invalidRuntime.context.window.KairosTheme.setPreference('sepia');
  assert.equal(invalidRuntime.storage.get(themeStorageKey), 'system');
});

test('system preference follows prefers-color-scheme changes without overriding explicit themes', async () => {
  const runtime = await loadThemeRuntime({ prefersDark: false });

  assert.equal(runtime.documentElement.dataset.theme, 'light');
  runtime.dispatchSystemTheme(true);
  assert.equal(runtime.documentElement.dataset.theme, 'dark');
  runtime.dispatchSystemTheme(false);
  assert.equal(runtime.documentElement.dataset.theme, 'light');

  runtime.context.window.KairosTheme.setPreference('dark');
  runtime.dispatchSystemTheme(false);
  assert.equal(runtime.documentElement.dataset.theme, 'dark');
});

test('theme CSS declares required tokens for light and dark and base classes consume them', async () => {
  const css = await readProjectFile('css/style.css');

  assert.match(css, /html\[data-theme="light"\]/u);
  assert.match(css, /html\[data-theme="dark"\]/u);
  for (const token of themeTokens) {
    assert.match(css, new RegExp(`--${token}\\s*:`, 'u'), `missing --${token}`);
  }

  const requiredClassPatterns = [
    /body\s*\{[\s\S]*var\(--background\)[\s\S]*var\(--foreground\)/u,
    /\.card-modern\s*\{[\s\S]*var\(--surface\)[\s\S]*var\(--border\)/u,
    /\.input-modern\s*\{[\s\S]*var\(--muted-surface\)[\s\S]*var\(--primary-text\)/u,
    /\.btn-primary\s*\{[\s\S]*var\(--primary-button-bg\)[\s\S]*var\(--primary-button-text\)/u,
    /\.btn-secondary\s*\{[\s\S]*var\(--secondary-button-bg\)[\s\S]*var\(--secondary-button-text\)/u,
    /\.table-modern\s+th\s*\{[\s\S]*var\(--surface-elevated\)[\s\S]*var\(--secondary-text\)/u,
    /\.modal-overlay\s*\{[\s\S]*var\(--overlay\)/u,
    /\.modal-panel\s*\{[\s\S]*var\(--surface-elevated\)[\s\S]*var\(--border\)/u,
    /:focus-visible\s*\{[\s\S]*var\(--focus-ring\)/u
  ];

  for (const pattern of requiredClassPatterns) {
    assert.match(css, pattern);
  }
});

test('theme bootstrap and CSS do not reference credentials or invoice payload storage', async () => {
  const [indexSource, css] = await Promise.all([
    readProjectFile('index.html'),
    readProjectFile('css/style.css')
  ]);
  const themeSource = `${extractThemeBootstrap(indexSource)}\n${css}`;

  assert.match(themeSource, new RegExp(themeStorageKey, 'u'));
  assert.doesNotMatch(themeSource, /OCR_ACCESS_TOKEN|QWEN_API_KEY|Bearer|api[_-]?key|token/i);
  assert.doesNotMatch(extractThemeBootstrap(indexSource), /base64|invoice|recognition|发票|识别/u);
  assert.doesNotMatch(themeSource, /data:image\/(?:jpeg|png);base64,[A-Za-z0-9+/=]{40,}/u);
});

test('phase 8.3A header exposes safe theme controls and neutral visual classes', async () => {
  const [headerSource, indexSource, css, versionRaw] = await Promise.all([
    readProjectFile('js/components/AppHeader.js'),
    readProjectFile('index.html'),
    readProjectFile('css/style.css'),
    readProjectFile('data/version.json')
  ]);
  const versionData = JSON.parse(versionRaw);

  assert.match(headerSource, /aria-label="切换界面主题"/u);
  for (const label of ['跟随系统', '浅色', '深色']) {
    assert.match(headerSource, new RegExp(label, 'u'));
  }
  assert.match(headerSource, /window\.KairosTheme\?\.setPreference\?\.\(preference\)/u);
  assert.match(headerSource, /aria-pressed=\{themePreference === option\.value\}/u);
  assert.match(headerSource, /role="switch"/u);
  assert.match(headerSource, /aria-checked=\{autoSaveEnabled\}/u);
  assert.match(headerSource, /assets\/Kairos Finance Black\.svg/u);
  assert.match(headerSource, /assets\/Kairos Finance\.svg/u);
  assert.doesNotMatch(headerSource, /app-logo[^"]*\bh-9\b/u);
  assert.doesNotMatch(headerSource, /app-logo[^"]*\bw-auto\b/u);

  assert.equal(versionData.version, '2.0.0');
  assert.match(indexSource, /version-badge/u);
  assert.match(indexSource, /v\{versionData \? versionData\.version : ['"]\.\.\.['"]\}/u);
  assert.match(indexSource, /Kairos Studio©️ 2026/u);
  assert.match(indexSource, /className="app-shell"/u);

  for (const className of [
    'app-header',
    'theme-toggle',
    'autosave-toggle',
    'save-status',
    'version-badge',
    'btn-ghost',
    'icon-button'
  ]) {
    assert.match(css, new RegExp(`\\.${className}\\b`, 'u'), `missing .${className}`);
  }

  assert.match(css, /\.app-header\s*\{[\s\S]*var\(--surface\)[\s\S]*var\(--border\)/u);
  assert.match(css, /\.app-logo\s*\{[\s\S]*width:\s*clamp\(12\.5rem,\s*28\.7vw,\s*19\.55rem\)[\s\S]*height:\s*auto/u);
  assert.match(css, /html\[data-theme="dark"\]\s+\.app-logo--light\s*\{[\s\S]*display:\s*none/u);
  assert.match(css, /\.theme-toggle\s*\{[\s\S]*var\(--muted-surface\)[\s\S]*var\(--border\)/u);
  assert.match(css, /\.theme-toggle__button\.is-active\s*\{[\s\S]*var\(--surface-elevated\)[\s\S]*var\(--primary-text\)/u);
  assert.match(css, /\.app-header__history-button\s*\{[\s\S]*min-height:\s*calc\(1\.875rem \+ 0\.375rem\)[\s\S]*var\(--muted-surface\)[\s\S]*var\(--border\)/u);
  assert.match(css, /\.version-badge\s*\{[\s\S]*border:\s*0[\s\S]*background:\s*transparent/u);
});

test('phase 8.3A UI additions avoid legacy naming engineering copy and secrets', async () => {
  const [headerSource, indexSource, css] = await Promise.all([
    readProjectFile('js/components/AppHeader.js'),
    readProjectFile('index.html'),
    readProjectFile('css/style.css')
  ]);
  const phase83aSource = `${headerSource}\n${indexSource}\n${css}`;
  const legacyNamingPattern = new RegExp(`${['yellow', 'bird'].join('-')}|K${'arios'}`, 'u');

  assert.doesNotMatch(phase83aSource, legacyNamingPattern);
  assert.doesNotMatch(phase83aSource, />[^<{]*(?:fallback|schema|JSON|DashScope|model|IndexedDB|MD5)[^<{]*</iu);
  assert.doesNotMatch(phase83aSource, /OCR_ACCESS_TOKEN|QWEN_API_KEY|Bearer\s+|sk-[A-Za-z0-9]/u);
  assert.doesNotMatch(headerSource, /bg-yellow|text-yellow|ring-yellow|shadow-\[0_0_8px/u);
});

test('phase 8.3B upload zone uses theme tokens while preserving upload copy and accessibility', async () => {
  const [uploadSource, css] = await Promise.all([
    readProjectFile('js/components/UploadZone.js'),
    readProjectFile('css/style.css')
  ]);

  assert.match(uploadSource, /拖入发票，自动整理报销明细/u);
  assert.match(uploadSource, /支持 JPG、PNG、PDF。/u);
  assert.match(uploadSource, /单次最多 10 个文件，PDF 默认识别第 1 页。/u);
  assert.doesNotMatch(uploadSource, /系统会先在浏览器中压缩图片/u);
  assert.doesNotMatch(uploadSource, /原始文件不会保存在服务器/u);
  assert.match(uploadSource, /accept="image\/jpeg,image\/png,application\/pdf"/u);
  assert.match(uploadSource, /aria-live="polite"/u);
  assert.match(uploadSource, /role="progressbar"/u);
  assert.match(uploadSource, /upload-workspace/u);
  assert.match(uploadSource, /data-workspace-state/u);
  assert.match(uploadSource, /data-status=\{fileStatus\}/u);
  assert.match(uploadSource, /upload-complete-overlay/u);
  assert.doesNotMatch(css, /\.upload-icon::after/u);

  const uploadCssPatterns = [
    /\.upload-workspace\s*\{[\s\S]*var\(--upload-idle-border\)[\s\S]*var\(--upload-idle-bg\)/u,
    /\.upload-workspace\.drag-active\s*\{[\s\S]*var\(--brand-warm\)[\s\S]*box-shadow/u,
    /\.upload-icon\s*\{[\s\S]*var\(--upload-icon-color\)[\s\S]*var\(--upload-icon-bg\)/u,
    /\.upload-file-row\[data-status="done"\]\s*\.upload-status-icon\s*\{[\s\S]*var\(--upload-state-success\)/u,
    /\.upload-file-row\[data-status="review"\]\s*\.upload-status-icon/u,
    /\.upload-file-row\[data-status="failed"\]\s*\.upload-status-icon\s*\{[\s\S]*var\(--upload-state-danger\)/u,
    /html\[data-theme="light"\][\s\S]*--upload-progress-fill:\s*#0f1012/u,
    /html\[data-theme="dark"\][\s\S]*--upload-progress-fill:\s*#ffffff/u,
    /\.upload-progress-fill[\s\S]*background:\s*var\(--upload-progress-fill\)/u,
    /--motion-upload-text-sheen:\s*8s/u
  ];
  for (const pattern of uploadCssPatterns) {
    assert.match(css, pattern);
  }

  assert.doesNotMatch(uploadSource, /bg-yellow|text-yellow|ring-yellow|border-yellow|shadow-\[0_0_8px/u);
  assert.doesNotMatch(uploadSource, /bg-\[#|text-gray-|border-\[#|bg-gray-/u);
});

test('phase 8.3B upload UI avoids engineering terms and sensitive credentials', async () => {
  const [uploadSource, stateSource, css] = await Promise.all([
    readProjectFile('js/components/UploadZone.js'),
    readProjectFile('js/utils/uploadWorkspaceState.js'),
    readProjectFile('css/style.css')
  ]);
  const uploadUiSource = `${uploadSource}\n${stateSource}\n${css}`;

  assert.doesNotMatch(uploadUiSource, />[^<{]*(?:fallback|schema|JSON|DashScope|model|IndexedDB|MD5)[^<{]*</iu);
  assert.doesNotMatch(uploadUiSource, /OCR_ACCESS_TOKEN|QWEN_API_KEY|Bearer\s+|sk-[A-Za-z0-9]/u);
  assert.doesNotMatch(uploadUiSource, /data:image\/(?:jpeg|png);base64,[A-Za-z0-9+/=]{40,}/u);
});

test('phase 8.3B table uses tokenized shell badge controls and keeps invoice columns available', async () => {
  const [tableSource, indexSource, css] = await Promise.all([
    readProjectFile('js/components/ReimbursementTable.js'),
    readProjectFile('index.html'),
    readProjectFile('css/style.css')
  ]);

  for (const label of ['日期', '发票号码', '销售方', '金额', '税额', '价税合计']) {
    assert.match(indexSource, new RegExp(label, 'u'), `missing column label ${label}`);
  }
  assert.match(indexSource, /\{ id: 'totalWithTax', label: '价税合计', visible: false/u);
  assert.match(tableSource, /invoice-table-shell/u);
  assert.match(tableSource, /invoice-table-header/u);
  assert.match(tableSource, /invoice-table-row/u);
  assert.match(tableSource, /invoice-table-summary/u);
  assert.match(tableSource, /status-badge--ready/u);
  assert.match(tableSource, /status-badge--review/u);
  assert.match(tableSource, /status-badge--failed/u);
  assert.match(tableSource, /已完成/u);
  assert.match(tableSource, /建议检查/u);
  assert.match(tableSource, /识别失败/u);
  assert.match(tableSource, /手动填写/u);
  assert.match(tableSource, /增强识别/u);
  assert.match(tableSource, /系统已自动再识别一次/u);
  assert.match(tableSource, /money-input/u);
  assert.match(tableSource, /tabular-nums/u);
  assert.match(tableSource, /row-action/u);
  assert.match(tableSource, /table-icon-action--danger/u);

  for (const pattern of [
    /\.invoice-table-shell\s*\{[\s\S]*var\(--surface\)[\s\S]*var\(--border\)/u,
    /\.invoice-table-row:hover\s*\{[\s\S]*var\(--muted-surface\)/u,
    /\.status-badge--ready\s*\{[\s\S]*var\(--success-bg\)[\s\S]*var\(--success\)/u,
    /\.status-badge--review\s*\{[\s\S]*var\(--warning-bg\)[\s\S]*var\(--warning\)/u,
    /\.status-badge--failed\s*\{[\s\S]*var\(--danger-bg\)[\s\S]*var\(--danger\)/u,
    /\.money-cell,\s*\n\s*\.money-input\s*\{[\s\S]*tabular-nums[\s\S]*text-align:\s*right/u,
    /\.row-action\s*\{[\s\S]*var\(--secondary-button-bg\)[\s\S]*var\(--secondary-button-text\)/u
  ]) {
    assert.match(css, pattern);
  }

  assert.doesNotMatch(tableSource, /bg-yellow|text-yellow|ring-yellow|border-yellow|shadow-yellow/u);
  assert.doesNotMatch(tableSource, /bg-\[#|text-gray-|border-\[#|bg-gray-/u);
});

test('phase 8.3B modals and export preview use shared modal tokens without changing export actions', async () => {
  const [systemModalsSource, exportPreviewSource, versionModalSource, heroModalSource, indexSource, css] = await Promise.all([
    readProjectFile('js/components/SystemModals.js'),
    readProjectFile('js/components/ExportPreviewModal.js'),
    readProjectFile('js/components/VersionModal.js'),
    readProjectFile('js/components/HeroModal.js'),
    readProjectFile('index.html'),
    readProjectFile('css/style.css')
  ]);
  const modalSources = `${systemModalsSource}\n${exportPreviewSource}\n${versionModalSource}\n${indexSource}`;

  assert.match(systemModalsSource, /modal-shell/u);
  assert.match(systemModalsSource, /modal-overlay/u);
  assert.match(systemModalsSource, /toast--success/u);
  assert.match(systemModalsSource, /toast--warning/u);
  assert.match(systemModalsSource, /toast--error/u);
  assert.match(systemModalsSource, /closeAriaLabel="关闭使用教程"/u);
  assert.match(heroModalSource, /aria-label=\{closeAriaLabel\}/u);
  assert.match(exportPreviewSource, /export-preview-shell/u);
  assert.match(exportPreviewSource, /export-compact-summary/u);
  assert.match(exportPreviewSource, /export-preview-sidebar-rail/u);
  assert.match(exportPreviewSource, /export-side-panel/u);
  assert.match(exportPreviewSource, /preview-zoom-toolbar/u);
  assert.match(exportPreviewSource, /检查清单/u);
  assert.match(exportPreviewSource, /导出 Excel/u);
  assert.match(exportPreviewSource, /打印 \/ 另存 PDF/u);
  assert.doesNotMatch(exportPreviewSource, /仍然导出|仍然打印/u);
  assert.match(exportPreviewSource, /识别失败/u);
  assert.match(exportPreviewSource, /建议检查/u);
  assert.match(exportPreviewSource, /window\.exportToExcel\(items, columns, reimbursementInfo\)/u);
  assert.match(exportPreviewSource, /window\.exportToPrint\(items, columns, reimbursementInfo\)/u);
  assert.match(indexSource, /column-option/u);
  assert.match(indexSource, /fixed-column-badge/u);
  assert.match(versionModalSource, /<window\.HeroModal/u);
  assert.match(heroModalSource, /modal-shell/u);

  for (const pattern of [
    /\.modal-shell\s*\{[\s\S]*var\(--surface-elevated\)[\s\S]*var\(--border\)/u,
    /\.modal-close\s*\{[\s\S]*var\(--muted-surface\)[\s\S]*var\(--secondary-text\)/u,
    /\.export-preview-shell\s*\{[\s\S]*var\(--surface-elevated\)[\s\S]*var\(--border\)/u,
    /\.export-compact-summary\s*\{[\s\S]*var\(--surface-elevated\)[\s\S]*var\(--border\)/u,
    /\.export-readiness-card,\s*\n\s*\.export-stat-card,\s*\n\s*\.export-issue-card\s*\{[\s\S]*var\(--surface\)[\s\S]*var\(--border\)/u,
    /\.preview-zoom-toolbar\s*\{[\s\S]*var\(--surface-elevated\)[\s\S]*var\(--border\)/u,
    /\.preview-zoom-button\s*\{[\s\S]*display:\s*inline-flex[\s\S]*white-space:\s*nowrap/u,
    /\.btn-secondary:hover\s*\{[\s\S]*color-mix\(in srgb, var\(--primary-text\) 22%, var\(--border\)\)/u,
    /\.icon-button:hover\s*\{[\s\S]*color-mix\(in srgb, var\(--primary-text\) 22%, var\(--border\)\)/u,
    /\.app-header__history-button\s*\{[\s\S]*min-height:\s*calc\(1\.875rem \+ 0\.375rem\)[\s\S]*box-shadow:\s*var\(--shadow-sm\)/u,
    /\.column-option:hover,[\s\S]*\.column-option\.is-visible\s*\{[\s\S]*var\(--muted-surface\)/u,
    /\.toast--error\s*\{[\s\S]*var\(--danger\)/u
  ]) {
    assert.match(css, pattern);
  }

  assert.doesNotMatch(modalSources, /API Key|Qwen Key|Token/u);
  assert.doesNotMatch(modalSources, /bg-yellow|text-yellow|ring-yellow|border-yellow|shadow-yellow/u);
  assert.doesNotMatch(modalSources, /bg-\[#|text-gray-|border-\[#|bg-gray-/u);
});

test('phase 8.3B credential boundary remains session scoped and UI avoids engineering terms', async () => {
  const [ocrClientSource, tableSource, systemModalsSource, exportPreviewSource, versionModalSource, indexSource] = await Promise.all([
    readProjectFile('js/utils/ocrClient.js'),
    readProjectFile('js/components/ReimbursementTable.js'),
    readProjectFile('js/components/SystemModals.js'),
    readProjectFile('js/components/ExportPreviewModal.js'),
    readProjectFile('js/components/VersionModal.js'),
    readProjectFile('index.html')
  ]);
  const uiSource = `${tableSource}\n${systemModalsSource}\n${exportPreviewSource}\n${versionModalSource}\n${indexSource}`;

  assert.match(ocrClientSource, /window\.sessionStorage\?\.setItem\(OCR_ACCESS_CREDENTIAL_SESSION_KEY, credential\)/u);
  assert.doesNotMatch(ocrClientSource, /localStorage\?\.setItem\(OCR_ACCESS_CREDENTIAL_SESSION_KEY/u);
  assert.doesNotMatch(uiSource, />[^<{]*(?:fallback|schema|JSON|DashScope|model|IndexedDB|MD5)[^<{]*</iu);
  assert.doesNotMatch(uiSource, /OCR_ACCESS_TOKEN|QWEN_API_KEY|API Key|Qwen Key|Bearer\s+|sk-[A-Za-z0-9]/u);
  assert.doesNotMatch(uiSource, /data:image\/(?:jpeg|png);base64,[A-Za-z0-9+/=]{40,}/u);
});

test('phase 8.3B visual QA fix covers export preview layout zoom and visible theme drawers', async () => {
  const [exportPreviewSource, historySource, reimbursementInfoSource, imagePreviewSource, css, appHeaderSource, tableSource, systemSource, indexSource, iconsSource] = await Promise.all([
    readProjectFile('js/components/ExportPreviewModal.js'),
    readProjectFile('js/components/HistorySidebar.js'),
    readProjectFile('js/components/ReimbursementInfo.js'),
    readProjectFile('js/components/ImagePreviewModal.js'),
    readProjectFile('css/style.css'),
    readProjectFile('js/components/AppHeader.js'),
    readProjectFile('js/components/ReimbursementTable.js'),
    readProjectFile('js/components/SystemModals.js'),
    readProjectFile('index.html'),
    readProjectFile('js/components/icons.js')
  ]);

  assert.match(exportPreviewSource, /showColumnSettings/u);
  assert.match(exportPreviewSource, /shouldShowZoomToolbar = !showColumnSettings && !showCheckDetails/u);
  assert.match(exportPreviewSource, /收起列设置/u);
  assert.match(exportPreviewSource, /展开列设置/u);
  assert.match(exportPreviewSource, /showCheckDetails/u);
  assert.match(exportPreviewSource, /收起检查清单/u);
  assert.match(exportPreviewSource, /关闭检查清单/u);
  assert.match(exportPreviewSource, /previewViewportRef/u);
  assert.match(exportPreviewSource, /previewStageRef/u);
  assert.match(exportPreviewSource, /setPreviewZoom/u);
  assert.match(exportPreviewSource, /export-preview-close/u);
  assert.match(css, /\.export-preview-close\s*\{[\s\S]*position:\s*absolute[\s\S]*right:\s*1rem/u);
  assert.match(iconsSource, /window\.ZoomIn[\s\S]*M10\.5 18a7\.5 7\.5[\s\S]*M10\.5 7\.5v6[\s\S]*M7\.5 10\.5h6/u);
  assert.match(iconsSource, /window\.ZoomOut[\s\S]*M10\.5 18a7\.5 7\.5[\s\S]*M7\.5 10\.5h6/u);
  for (const copy of ['缩小', '放大', '适应宽度', '实际大小']) {
    assert.match(exportPreviewSource, new RegExp(copy, 'u'));
  }
  assert.match(exportPreviewSource, /style=\{\{ transform: `scale\(\$\{previewZoom\}\)` \}\}/u);
  assert.match(exportPreviewSource, /window\.exportToExcel\(items, columns, reimbursementInfo\)/u);
  assert.match(exportPreviewSource, /window\.exportToPrint\(items, columns, reimbursementInfo\)/u);

  for (const className of [
    'history-overlay',
    'history-sidebar',
    'history-card',
    'history-card__summary',
    'history-action',
    'history-action--danger',
    'history-clear-button',
    'image-preview-overlay',
    'image-preview-shell',
    'image-preview-toolbar'
  ]) {
    assert.match(`${historySource}\n${imagePreviewSource}`, new RegExp(className, 'u'), `missing ${className}`);
    assert.match(css, new RegExp(`\\.${className.replace('__', '__')}\\b`, 'u'), `missing CSS ${className}`);
  }

  assert.match(appHeaderSource, /onOpenHistory/u);
  assert.match(appHeaderSource, /历史记录/u);
  assert.match(indexSource, /onOpenHistory=\{\(\) => setShowHistory\(true\)\}/u);
  assert.doesNotMatch(reimbursementInfoSource, /版本记录|CLEAN|SAVE/u);
  assert.match(tableSource, /清空/u);
  assert.match(tableSource, /保存当前记录/u);
  assert.match(indexSource, /handleSaveProject=\{handleSaveProject\}/u);
  assert.match(indexSource, /handleCleanProject=\{handleCleanProject\}/u);
  assert.match(systemSource, /ConfirmDialog/u);
  assert.match(systemSource, /confirm-dialog__icon/u);
  assert.match(css, /\.confirm-dialog__icon--danger\s*\{[\s\S]*var\(--danger-bg\)/u);

  assert.match(css, /\.export-preview-sidebar\.is-collapsed\s*\{[\s\S]*width:\s*0/u);
  assert.match(css, /\.export-preview-canvas\s*\{[\s\S]*var\(--background\)/u);
  assert.match(css, /\.history-sidebar\s*\{[\s\S]*var\(--surface-elevated\)[\s\S]*var\(--border\)/u);
  assert.match(historySource, /历史记录/u);
  assert.match(historySource, /最近保存的报销记录/u);
  assert.match(historySource, /清空历史记录/u);
  assert.match(historySource, /自动保留最近 30 天记录/u);
  assert.doesNotMatch(historySource, /版本记录|VERSION RECORDS|CLEAR ALL|AUTO-CLEANUP/u);
  assert.match(css, /\.image-preview-shell\s*\{[\s\S]*var\(--surface-elevated\)[\s\S]*var\(--border\)/u);
  assert.doesNotMatch(`${exportPreviewSource}\n${historySource}\n${reimbursementInfoSource}\n${imagePreviewSource}`, /bg-black|bg-\[#(?:000|111|121|171|1a|2a)|bg-neutral-900|bg-zinc-900|text-gray-500|text-gray-600|text-gray-700|border-\[#2a|border-gray-800|border-gray-700/u);
  assert.doesNotMatch(`${exportPreviewSource}\n${historySource}`, /transition-all/u);
  assert.doesNotMatch(`${indexSource}\n${historySource}\n${tableSource}\n${imagePreviewSource}`, /alert\(|confirm\(|window\.confirm/u);
});
