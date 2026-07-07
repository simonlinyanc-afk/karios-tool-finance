import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const readProjectFile = async (relativePath) => {
  const fullPath = path.join(projectRoot, relativePath);
  return fs.readFile(fullPath, 'utf8');
};

const extractZIndex = (source, pattern, label) => {
  const match = source.match(pattern);
  assert.ok(match, `Expected to find ${label}`);
  return Number(match[1] || match[2]);
};

test('modal overlays stay above the sticky reimbursement table header', async () => {
  const [cssSource, tableSource, systemModalsSource, exportPreviewSource, indexSource] = await Promise.all([
    readProjectFile('css/style.css'),
    readProjectFile('js/components/ReimbursementTable.js'),
    readProjectFile('js/components/SystemModals.js'),
    readProjectFile('js/components/ExportPreviewModal.js'),
    readProjectFile('index.html')
  ]);

  /* Header z-index is defined via CSS token --z-table-header.
     The JSX no longer carries inline Tailwind z-index on <th>. */
  const stickyHeaderZIndex = extractZIndex(
    cssSource,
    /--z-table-header:\s*(\d+)/,
    'sticky table header z-index token'
  );

  const overlayZIndexes = [
    {
      label: 'tutorial modal',
      value: extractZIndex(
        systemModalsSource,
        /TutorialModal:[\s\S]*?className="[^"]*fixed inset-0[^"]*z-(?:\[(\d+)\]|(\d+))/,
        'tutorial modal overlay z-index'
      )
    },
    {
      label: 'close-project dialog',
      value: extractZIndex(
        systemModalsSource,
        /CloseProjectDialog:[\s\S]*?className="[^"]*fixed inset-0[^"]*z-(?:\[(\d+)\]|(\d+))/,
        'close-project dialog overlay z-index'
      )
    },
    {
      label: 'OCR confirmation dialog',
      value: extractZIndex(
        systemModalsSource,
        /OcrConfirmationDialog:[\s\S]*?className="[^"]*fixed inset-0[^"]*z-(?:\[(\d+)\]|(\d+))/,
        'OCR confirmation dialog overlay z-index'
      )
    },
    {
      label: 'export preview modal',
      value: extractZIndex(
        exportPreviewSource,
        /className="[^"]*fixed inset-0[^"]*z-(?:\[(\d+)\]|(\d+))/,
        'export preview modal overlay z-index'
      )
    },
    {
      label: 'column manager modal',
      value: extractZIndex(
        indexSource,
        /showColumnManager && \([\s\S]*?className="[^"]*fixed inset-0[^"]*z-(?:\[(\d+)\]|(\d+))/,
        'column manager overlay z-index'
      )
    }
  ];

  overlayZIndexes.forEach(({ label, value }) => {
    assert.ok(
      value > stickyHeaderZIndex,
      `${label} should sit above the sticky table header (${value} <= ${stickyHeaderZIndex})`
    );
  });
});

test('Phase 4 dialogs use modal semantics and named close buttons', async () => {
  const [systemModalsSource, exportPreviewSource, indexSource] = await Promise.all([
    readProjectFile('js/components/SystemModals.js'),
    readProjectFile('js/components/ExportPreviewModal.js'),
    readProjectFile('index.html')
  ]);
  const source = `${systemModalsSource}\n${exportPreviewSource}\n${indexSource}`;

  assert.match(source, /role="dialog"/u);
  assert.match(source, /aria-modal="true"/u);
  assert.match(source, /aria-labelledby=/u);
  assert.match(source, /aria-label="关闭/u);
  assert.match(source, /event\.key === ['"]Escape['"]/u);
});
