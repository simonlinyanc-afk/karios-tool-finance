import { createQwenClient } from './qwen-client.js';
import { loadModelRoutingConfig, routeModelRequest } from './model-router.js';
import {
  InvoiceResponseError,
  createFailedInvoiceResult,
  evaluateInvoice,
  extractInvoiceModelObject,
  parseInvoiceModelPayload,
  shouldRecheckInvoice
} from './invoice-schema.js';

const OCR_PROMPT_VERSION = 'v2-short-keys';

const QWEN_OCR_PROMPT = `请识别这张发票，并且只返回一个 JSON 对象，不要 Markdown，不要解释，不要代码块。

使用以下短键返回：
{
  "d": "YYYY-MM-DD",
  "n": "发票号码",
  "b": "购买方",
  "m": "销售方",
  "c": "类别",
  "i": "主要项目名称",
  "g": "规格型号",
  "u": "单位",
  "q": 0,
  "p": 0,
  "t": 0,
  "r": "税率",
  "x": 0,
  "y": 0,
  "w": 0,
  "k": "备注",
  "s": "简要报销说明"
}

字段说明：
- d=date
- n=invoiceNumber
- b=buyerName
- m=sellerName
- c=category，限定：餐饮美食 / 交通出行 / 酒店住宿 / 办公用品 / 服务费 / 其他
- i=itemName
- g=specification
- u=unit
- q=quantity
- p=unitPrice
- t=amount，必须取“价税合计”最终含税金额
- r=taxRate
- x=tax，必须取“合计”行最后一列税额
- y=subtotal，必须取“合计”行第一列不含税金额
- w=totalWithTax，通常与 t 相同
- k=remarks
- s=description，必须是适合报销表格的摘要说明

重要规则：
- 如果有多个项目，i 和 s 必须总结，不要只写第一项
- s 最好结合类别和项目，例如“餐饮美食 - 员工聚餐”
- 未找到时，字符串返回 ""，数字返回 0
- 只返回 JSON 对象本身`;

const QWEN_REVIEW_PROMPT = `请重新独立查看原图并完成一次复查识别。
重点核对日期、发票号码、金额、税额和价税合计，不要沿用任何先前识别结论。

${QWEN_OCR_PROMPT}`;

export function extractJsonObject(payload) {
  return extractInvoiceModelObject(payload);
}

function parseModelResult(payload) {
  return parseInvoiceModelPayload(payload);
}

export function mapOcrServiceError(error) {
  const rawCode = typeof error?.code === 'string' ? error.code : '';
  const code = /^[A-Z][A-Z0-9_]{0,63}$/.test(rawCode) ? rawCode : 'OCR_ERROR';

  return {
    statusCode: 500,
    payload: {
      error: '识别服务暂时不可用。',
      code,
      action: '请稍后重新识别；如果仍然失败，请联系管理员。'
    }
  };
}

export async function recognizeInvoiceFromImage({
  image,
  mode = 'normal',
  env = process.env,
  fetchImpl = globalThis.fetch,
  now = Date.now
}) {
  if (!image) {
    const error = new Error('Missing image data');
    error.code = 'INVALID_INPUT';
    error.canFallback = false;
    throw error;
  }

  const client = createQwenClient({ env, fetchImpl, now });
  const models = loadModelRoutingConfig(env);
  try {
    const routed = await routeModelRequest({
      mode,
      models,
      now,
      validateResult: result => !shouldRecheckInvoice(result),
      invokeModel: async ({ model, attempt }) => {
        const payload = await client.generate({
          model,
          image,
          prompt: attempt === 'fallback' ? QWEN_REVIEW_PROMPT : QWEN_OCR_PROMPT
        });
        return parseModelResult(payload);
      }
    });
    const evaluated = evaluateInvoice(routed.result);

    return {
      ...evaluated,
      meta: routed.meta
    };
  } catch (error) {
    if (error instanceof InvoiceResponseError) {
      return createFailedInvoiceResult(error.routingMeta || {});
    }
    throw error;
  }
}

export { QWEN_OCR_PROMPT, QWEN_REVIEW_PROMPT, OCR_PROMPT_VERSION };
