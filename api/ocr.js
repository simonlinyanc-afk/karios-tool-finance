import { createRequestId, ocrLogger } from './logger.js';
import { mapOcrServiceError, recognizeInvoiceFromImage } from './ocr-service.js';
import {
  OcrSecurityError,
  assertContentLength,
  assertJsonContentType,
  authenticateOcrRequest,
  createSecurityError,
  getParsedBodySize,
  normalizeTokenSource,
  toSecurityResponse,
  validateImageDataUrl
} from './security.js';

// Vercel Serverless Function - OCR Proxy
// This protects your Qwen API key by keeping it server-side

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '15mb'
    }
  }
};

function logOcrResult(logger, fields) {
  try {
    logger?.log?.(fields);
  } catch {
    // Logging failures must not expose data or replace the HTTP response.
  }
}

export function createOcrHandler({
  ocrService = recognizeInvoiceFromImage,
  env = process.env,
  logger = ocrLogger,
  requestIdFactory = createRequestId
} = {}) {
  return async function handler(req, res) {
    const requestId = requestIdFactory();
    if (req.method !== 'POST') {
      const safeError = toSecurityResponse(createSecurityError('METHOD_NOT_ALLOWED'));
      logOcrResult(logger, {
        requestId,
        status: safeError.statusCode,
        errorType: safeError.payload.code,
        tokenSource: normalizeTokenSource(req.headers?.['x-ocr-token-source']),
        authResult: 'denied'
      });
      return res.status(safeError.statusCode).json(safeError.payload);
    }

    let auth = {
      tokenSource: normalizeTokenSource(req.headers?.['x-ocr-token-source']),
      authResult: 'denied'
    };
    try {
      auth = authenticateOcrRequest({ headers: req.headers, env });
      assertJsonContentType(req.headers);
      assertContentLength(req.headers);
      getParsedBodySize(req.body);
      const { image, mode = 'normal' } = req.body || {};
      validateImageDataUrl(image);

      const parsedData = await ocrService({ image, mode, request: req });
      logOcrResult(logger, {
        requestId,
        model: parsedData?.meta?.model,
        latencyMs: parsedData?.meta?.latencyMs,
        status: parsedData?.status || 200,
        tokenSource: auth.tokenSource,
        authResult: auth.authResult
      });
      return res.status(200).json(parsedData);
    } catch (error) {
      if (error instanceof OcrSecurityError) {
        const safeError = toSecurityResponse(error);
        logOcrResult(logger, {
          requestId,
          status: safeError.statusCode,
          errorType: safeError.payload.code,
          tokenSource: auth.tokenSource,
          authResult: error.code === 'SECURITY_NOT_CONFIGURED'
            ? 'configuration_error'
            : auth.authResult
        });
        return res.status(safeError.statusCode).json(safeError.payload);
      }

      const safeError = mapOcrServiceError(error);
      logOcrResult(logger, {
        requestId,
        status: safeError.statusCode,
        errorType: safeError.payload.code,
        tokenSource: auth.tokenSource,
        authResult: auth.authResult
      });
      return res.status(safeError.statusCode).json(safeError.payload);
    }
  };
}

export default createOcrHandler();
