import { mapOcrServiceError, recognizeInvoiceFromImage } from './ocr-service.js';

// Vercel Serverless Function - OCR Proxy
// This protects your Qwen API key by keeping it server-side

export function createOcrHandler({ ocrService = recognizeInvoiceFromImage } = {}) {
  return async function handler(req, res) {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
      const { image, mode = 'normal' } = req.body || {};

      if (!image) {
        return res.status(400).json({ error: 'Missing image data' });
      }

      const parsedData = await ocrService({ image, mode, request: req });
      return res.status(200).json(parsedData);
    } catch (error) {
      const safeError = mapOcrServiceError(error);
      console.error('OCR Error', {
        code: safeError.payload.code,
        statusCode: safeError.statusCode
      });
      return res.status(safeError.statusCode).json(safeError.payload);
    }
  };
}

export default createOcrHandler();
