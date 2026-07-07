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

async function loadUploadWorkspaceHelpers() {
  const source = await readProjectFile('js/utils/uploadWorkspaceState.js');
  const context = vm.createContext({ console, window: {} });
  vm.runInContext(source, context);
  return context.window.UploadWorkspaceHelpers;
}

test('phase 9 maps OCR pipeline statuses to upload file statuses', async () => {
  const { mapQueueItemToFileStatus, FILE_STATUS } = await loadUploadWorkspaceHelpers();

  assert.equal(mapQueueItemToFileStatus({ status: 'waiting' }), FILE_STATUS.PENDING);
  assert.equal(mapQueueItemToFileStatus({ status: 'queued' }), FILE_STATUS.PENDING);
  assert.equal(mapQueueItemToFileStatus({ status: 'processing' }), FILE_STATUS.PROCESSING);
  assert.equal(mapQueueItemToFileStatus({ status: 'completed', resultStatus: 'ready' }), FILE_STATUS.DONE);
  assert.equal(mapQueueItemToFileStatus({ status: 'completed', resultStatus: 'needs_review' }), FILE_STATUS.REVIEW);
  assert.equal(mapQueueItemToFileStatus({ status: 'failed', resultStatus: 'failed' }), FILE_STATUS.FAILED);
  assert.equal(mapQueueItemToFileStatus({ status: 'processing', displayStatus: 'enhancing' }), FILE_STATUS.ENHANCING);
});

test('phase 9.1 maps resultStatus and terminal statuses with clear priority', async () => {
  const { mapQueueItemToFileStatus, FILE_STATUS } = await loadUploadWorkspaceHelpers();

  assert.equal(
    mapQueueItemToFileStatus({ status: 'processing', resultStatus: 'needs_review' }),
    FILE_STATUS.REVIEW
  );
  assert.equal(
    mapQueueItemToFileStatus({ status: 'completed', resultStatus: 'failed' }),
    FILE_STATUS.FAILED
  );
  assert.equal(mapQueueItemToFileStatus({ status: 'completed' }), FILE_STATUS.DONE);
  assert.equal(mapQueueItemToFileStatus({ status: 'cancelled' }), FILE_STATUS.CANCELLED);
});

test('phase 9.1 cancelled status is defined and excluded from issue counts', async () => {
  const { FILE_STATUS, STATUS_META, countBatch, mapQueueItemToFileStatus } = await loadUploadWorkspaceHelpers();

  assert.equal(FILE_STATUS.CANCELLED, 'cancelled');
  assert.equal(STATUS_META[FILE_STATUS.CANCELLED].note, '已取消');
  assert.equal(mapQueueItemToFileStatus({ status: 'cancelled' }), FILE_STATUS.CANCELLED);

  const counts = countBatch([
    { id: 'a', status: 'completed', resultStatus: 'ready' },
    { id: 'b', status: 'cancelled' }
  ]);
  assert.equal(counts.done, 1);
  assert.equal(counts.review, 0);
  assert.equal(counts.failed, 0);
  assert.equal(counts.finished, 2);
});

test('phase 9.1 upload workspace css covers reduced motion and progress tokens', async () => {
  const css = await readProjectFile('css/style.css');
  const uploadSource = await readProjectFile('js/components/UploadZone.js');

  assert.match(css, /@media \(prefers-reduced-motion:\s*reduce\)[\s\S]*\.upload-workspace::before[\s\S]*animation:\s*none !important/u);
  assert.match(css, /\.upload-working-title::before[\s\S]*animation:\s*none !important/u);
  assert.match(css, /\.upload-file-row\[data-status="processing"\] \.upload-status-icon::before[\s\S]*animation:\s*none !important/u);
  assert.match(css, /html\[data-theme="light"\][\s\S]*--upload-progress-fill:\s*#0f1012/u);
  assert.match(css, /html\[data-theme="dark"\][\s\S]*--upload-progress-fill:\s*#ffffff/u);
  assert.match(css, /\.upload-progress-fill[\s\S]*background:\s*var\(--upload-progress-fill\)/u);
  assert.doesNotMatch(css, /html\[data-theme="light"\]\s*\.upload-progress-fill[\s\S]*background:\s*#0f1012/u);
  assert.match(uploadSource, /onContinueUpload/u);
  assert.match(uploadSource, /Optional parent hook/u);
});

test('phase 9.1 auto-review timers are tracked per item', async () => {
  const uploadSource = await readProjectFile('js/components/UploadZone.js');

  assert.match(uploadSource, /autoReviewTimersRef/u);
  assert.match(uploadSource, /timers\.set\(item\.id/u);
  assert.doesNotMatch(uploadSource, /\}, \[processingQueue, autoReviewIds\]\);/u);
});

test('phase 9 complete summary and batch counts follow the three result rules', async () => {
  const { countBatch, buildCompleteSummary, FILE_STATUS, mapQueueItemToFileStatus } = await loadUploadWorkspaceHelpers();

  const successQueue = [
    { id: 'a', status: 'completed', resultStatus: 'ready' },
    { id: 'b', status: 'completed', resultStatus: 'ready' }
  ];
  const reviewQueue = [
    ...successQueue,
    { id: 'c', status: 'completed', resultStatus: 'needs_review' }
  ];
  const failureQueue = [
    ...reviewQueue,
    { id: 'd', status: 'failed', resultStatus: 'failed' }
  ];

  assert.equal(buildCompleteSummary(countBatch(successQueue)), '2 份已完成。');
  assert.equal(buildCompleteSummary(countBatch(reviewQueue)), '2 份已完成，1 份建议检查。');
  assert.equal(buildCompleteSummary(countBatch(failureQueue)), '2 份已完成，1 份建议检查，1 份失败。');
  assert.equal(mapQueueItemToFileStatus({ status: 'processing', id: 'slow' }, new Set(['slow'])), FILE_STATUS.AUTO_REVIEWING);
});

test('phase 9 upload workspace structure exposes state machine and failure-only actions', async () => {
  const [uploadSource, stateSource, indexSource, css] = await Promise.all([
    readProjectFile('js/components/UploadZone.js'),
    readProjectFile('js/utils/uploadWorkspaceState.js'),
    readProjectFile('index.html'),
    readProjectFile('css/style.css')
  ]);
  const uiSource = `${uploadSource}\n${stateSource}\n${indexSource}`;

  assert.match(uploadSource, /data-workspace-state/u);
  assert.match(uploadSource, /WORKSPACE_STATE/u);
  assert.match(uiSource, /识别完成/u);
  assert.match(uploadSource, /识别已结束/u);
  assert.match(uploadSource, /增强识别失败项/u);
  assert.match(uploadSource, /继续上传/u);
  assert.match(uiSource, /正在自动复查/u);
  assert.match(uiSource, /正在增强识别/u);
  assert.match(uploadSource, /hasFailure &&/u);
  assert.match(indexSource, /handleEnhanceFailed/u);
  assert.match(indexSource, /mode:\s*['"]high_accuracy['"]/u);
  assert.match(indexSource, /onWorkspaceIdle/u);
  assert.match(indexSource, /displayStatus:\s*['"]enhancing['"]/u);
  assert.match(indexSource, /uploadWorkspaceState\.js/u);
  assert.doesNotMatch(uiSource, />[^<{]*(?:查看识别结果|去检查|查看发票列表)[^<{]*</u);
  assert.doesNotMatch(uiSource, />[^<{]*(?:fallback|schema|JSON|DashScope|model|IndexedDB|MD5|Token|API Key|Nginx|server|route)[^<{]*</iu);

  assert.match(css, /\.upload-workspace\[data-workspace-state="processing"\]/u);
  assert.match(css, /\.upload-workspace\[data-workspace-state="complete"\]\s*\.upload-complete-overlay/u);
  assert.match(css, /--motion-upload-text-sheen:\s*8s/u);
  assert.match(css, /--motion-upload-scan:\s*11\.8s/u);
});

test('phase 9 enhance failed only targets failed queue items with stored files', async () => {
  const indexSource = await readProjectFile('index.html');
  const enhanceBlock = indexSource.match(/const handleEnhanceFailed = async \(\) => \{[\s\S]*?\n      \};/u)?.[0] || '';
  assert.match(indexSource, /file,/u);
  assert.match(enhanceBlock, /pipelineStatus === 'failed'/u);
  assert.match(enhanceBlock, /item\.file/u);
  assert.match(enhanceBlock, /processInvoiceFile/u);
  assert.doesNotMatch(enhanceBlock, /processBatchFiles/u);
});
