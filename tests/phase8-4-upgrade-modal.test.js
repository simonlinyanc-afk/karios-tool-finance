import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const readProjectFile = relativePath => fs.readFile(path.join(projectRoot, relativePath), 'utf8');

// Engineering jargon that must never leak into user-facing modal copy.
const engineeringTerms = [
  '模型', '路由', 'fallback', 'schema', 'JSON', 'DashScope',
  'Token', 'Nginx', 'IndexedDB', 'MD5', '部署', 'API Key', 'Qwen Key'
];

// Quick-start guide steps that must all be present in the guide modal.
const guideSteps = ['填写报销信息', '上传发票', '补充凭证', '导出报销单'];

test('phase 8.4 upgrade + guide modals reuse a single HeroModal shell', async () => {
  const [heroSource, versionSource, systemModalsSource] = await Promise.all([
    readProjectFile('js/components/HeroModal.js'),
    readProjectFile('js/components/VersionModal.js'),
    readProjectFile('js/components/SystemModals.js')
  ]);

  // F1. A dedicated reusable shell component exists.
  assert.match(heroSource, /window\.HeroModal\s*=\s*\(\{/u);
  assert.match(heroSource, /hero-modal hero-modal--\$\{variant\}/u);

  // Both the upgrade splash and the quick-start guide render through it.
  assert.match(versionSource, /<window\.HeroModal/u);
  assert.match(versionSource, /variant="upgrade"/u);
  assert.match(systemModalsSource, /<window\.HeroModal/u);
  assert.match(systemModalsSource, /variant="guide"/u);
});

test('phase 8.4 upgrade variant is scrollable and shows a bottom fade', async () => {
  const [heroSource, versionSource, css] = await Promise.all([
    readProjectFile('js/components/HeroModal.js'),
    readProjectFile('js/components/VersionModal.js'),
    readProjectFile('css/style.css')
  ]);

  // F2 + F4. Upgrade modal opts into scrolling and the fade mask.
  assert.match(versionSource, /scrollable=\{true\}/u);
  assert.match(versionSource, /showFadeMask=\{true\}/u);

  // The shell wires the fade only when both scrollable + showFadeMask are on.
  assert.match(heroSource, /const fadeEnabled = scrollable && showFadeMask/u);
  assert.match(heroSource, /hero-modal__scroll/u);
  assert.match(heroSource, /hero-modal__fade\$\{showFade \? ' is-visible' : ''\}/u);

  // The scroll area actually scrolls, and the fade resolves to the panel bg.
  assert.match(css, /\.hero-modal__scroll\s*\{[\s\S]*overflow-y:\s*auto/u);
  assert.match(css, /\.hero-modal__fade\s*\{[\s\S]*var\(--surface-elevated\)/u);
  assert.match(css, /\.hero-modal__fade\.is-visible\s*\{[\s\S]*opacity:\s*1/u);
});

test('phase 8.4 guide variant is static, fade-free and uses a 2x2 step grid', async () => {
  const [systemModalsSource, css] = await Promise.all([
    readProjectFile('js/components/SystemModals.js'),
    readProjectFile('css/style.css')
  ]);

  // F3 + F5. Guide modal disables scrolling and the fade mask.
  assert.match(systemModalsSource, /scrollable=\{false\}/u);
  assert.match(systemModalsSource, /showFadeMask=\{false\}/u);

  // F6. All four quick-start steps are present.
  for (const step of guideSteps) {
    assert.ok(systemModalsSource.includes(step), `guide modal should mention ${step}`);
  }

  // Steps render in a 2x2 grid that collapses to a single column on narrow screens.
  assert.match(systemModalsSource, /hero-modal__steps/u);
  assert.match(systemModalsSource, /hero-modal__step-index/u);
  assert.match(css, /\.hero-modal__steps\s*\{[\s\S]*grid-template-columns:\s*repeat\(2/u);
  assert.match(css, /@media \(max-width: 480px\)\s*\{[\s\S]*\.hero-modal__steps\s*\{[\s\S]*grid-template-columns:\s*1fr/u);
  // Numbered index is a circular outline.
  assert.match(css, /\.hero-modal__step-index\s*\{[\s\S]*border-radius:\s*9999px/u);
});

test('phase 8.4 both modals use an image hero and share the primary action', async () => {
  const [heroSource, versionSource, systemModalsSource, versionRaw] = await Promise.all([
    readProjectFile('js/components/HeroModal.js'),
    readProjectFile('js/components/VersionModal.js'),
    readProjectFile('js/components/SystemModals.js'),
    readProjectFile('data/version.json')
  ]);
  const versionData = JSON.parse(versionRaw);

  // F8. Both heroes are rendered as image assets, not re-typeset text.
  assert.match(heroSource, /<img\b[\s\S]*?src=\{heroSrc\}/u);
  assert.match(versionSource, /const heroSrc = versionData\.hero/u);
  assert.match(versionData.hero, /assets\/upgrade-v2\.0\.0-hero\.webp$/u);
  assert.match(systemModalsSource, /heroSrc="assets\/guide-welcome-hero\.webp"/u);
  await assert.doesNotReject(fs.access(path.join(projectRoot, 'assets/upgrade-v2.0.0-hero.webp')));
  await assert.doesNotReject(fs.access(path.join(projectRoot, 'assets/guide-welcome-hero.webp')));

  // Heroes are file assets, never inlined base64.
  assert.doesNotMatch(versionRaw, /data:image\/(?:jpeg|png);base64,/u);
  assert.doesNotMatch(systemModalsSource, /data:image\/(?:jpeg|png);base64,/u);

  // F7. Both variants expose "开始使用" as the primary action; upgrade adds the history link.
  assert.match(versionSource, /primaryActionText="开始使用"/u);
  assert.match(systemModalsSource, /primaryActionText="开始使用"/u);
  assert.match(versionSource, /查看历史更新内容/u);
  // The shell renders the primary button with the shared close/confirm handler.
  assert.match(heroSource, /onClick=\{onPrimaryAction \|\| onClose\}[\s\S]*?\{primaryActionText\}/u);
});

test('phase 8.4 shell + both variants are theme tokenized for light/dark', async () => {
  const [heroSource, css] = await Promise.all([
    readProjectFile('js/components/HeroModal.js'),
    readProjectFile('css/style.css')
  ]);

  // F9. Shared tokens keep the shell readable in light + dark themes.
  assert.match(heroSource, /btn-primary/u);
  assert.match(heroSource, /modal-shell/u);
  assert.match(css, /\.btn-primary\s*\{[\s\S]*var\(--primary-button-bg\)[\s\S]*var\(--primary-button-text\)/u);
  assert.match(css, /\.modal-description[\s\S]*var\(--secondary-text\)/u);
  assert.match(css, /\.hero-modal__step-index\s*\{[\s\S]*var\(--primary-text\)/u);

  // No hard-coded yellow/orange washes leak outside the hero art.
  assert.doesNotMatch(heroSource, /bg-yellow|text-yellow|bg-orange|text-orange|bg-\[#|text-gray-|bg-gray-/u);
});

test('phase 8.4 upgrade + guide keep independent, non-sensitive seen flags', async () => {
  const indexSource = await readProjectFile('index.html');

  // D. Upgrade uses a versioned key; guide keeps its own legacy key. They never share.
  assert.match(indexSource, /`kairos-finance\.seenUpgrade\.v\$\{versionData\.version\}`/u);
  assert.match(indexSource, /const seenUpgradeKey = data && data\.version \? `kairos-finance\.seenUpgrade\.v\$\{data\.version\}` : null/u);
  assert.match(indexSource, /localStorage\.getItem\(seenUpgradeKey\) !== ['"]true['"]/u);
  assert.match(indexSource, /localStorage\.(?:get|set)Item\(['"]tutorialCompleted['"]/u);

  // Only boolean-ish flags are stored, never sensitive payloads.
  assert.doesNotMatch(indexSource, /seenUpgrade[^\n]*(?:base64|data:image|Bearer)/iu);
});

test('phase 8.4 modals avoid engineering jargon and secrets', async () => {
  const [systemModalsSource, versionRaw] = await Promise.all([
    readProjectFile('js/components/SystemModals.js'),
    readProjectFile('data/version.json')
  ]);
  const versionData = JSON.parse(versionRaw);

  const userFacingCopy = [
    versionData.title,
    versionData.intro,
    versionData.changesHeading,
    ...(versionData.sections || []).flatMap(section => [section.heading, section.body])
  ].join('\n');

  // Guide step copy pulled straight from the source (title + desc strings).
  const guideCopy = (systemModalsSource.match(/(?:title|desc):\s*'([^']*)'/gu) || []).join('\n');

  const combinedCopy = `${userFacingCopy}\n${guideCopy}`;

  // F10. User-facing copy stays plain across both variants.
  for (const term of engineeringTerms) {
    assert.ok(!combinedCopy.includes(term), `user-facing copy should not mention ${term}`);
  }
  assert.doesNotMatch(`${systemModalsSource}\n${versionRaw}`, /OCR_ACCESS_TOKEN|QWEN_API_KEY|API Key|Qwen Key|Bearer\s+|sk-[A-Za-z0-9]/u);
});

test('phase 8.4 leaves export call chain untouched', async () => {
  const [heroSource, versionSource, systemModalsSource, exportPreviewSource] = await Promise.all([
    readProjectFile('js/components/HeroModal.js'),
    readProjectFile('js/components/VersionModal.js'),
    readProjectFile('js/components/SystemModals.js'),
    readProjectFile('js/components/ExportPreviewModal.js')
  ]);

  // F11. Excel/print export calls are unchanged and none of the splash modals touch them.
  assert.match(exportPreviewSource, /window\.exportToExcel\(items, columns, reimbursementInfo\)/u);
  assert.match(exportPreviewSource, /window\.exportToPrint\(items, columns, reimbursementInfo\)/u);
  assert.doesNotMatch(heroSource, /exportToExcel|exportToPrint/u);
  assert.doesNotMatch(versionSource, /exportToExcel|exportToPrint/u);
  assert.doesNotMatch(systemModalsSource, /exportToExcel|exportToPrint/u);
});
