// Vercel Serverless Function - OCR Proxy
// This protects your Qwen API key by keeping it server-side

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { image } = req.body;

    if (!image) {
      return res.status(400).json({ error: 'Missing image data' });
    }

    // Call Qwen API
    const response = await fetch(
      'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.QWEN_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'qwen-vl-max-latest',
          input: {
            messages: [{
              role: 'user',
              content: [
                { image: image },
                {
                  text: `请识别这张发票并以 JSON 格式返回以下信息。只返回 JSON 对象，不要其他格式。

必需的 JSON 结构：
{
    "date": "YYYY-MM-DD",
    "invoiceNumber": "string (如果可见，以 No. 或类似开头)",
    "buyerName": "string",
    "sellerName": "string",
    "category": "string (猜测类别：餐饮美食, 交通出行, 酒店住宿, 办公用品, 服务费，无法确定→其他)",
    "itemName": "string (主要项目名称，如果发票有多个项目，请总结如'餐饮费等'，不要只列出第一个)",
    "specification": "string",
    "unit": "string",
    "quantity": float,
    "unitPrice": float,
    "amount": float (从发票的"价税合计"栏提取，这是发票最终含税总金额),
    "taxRate": "string (例如 1%, 6%)",
    "tax": float (从发票"合计"行的最后一列提取，即税额),
    "subtotal": float (从发票"合计"行的第一列提取，即不含税金额),
    "totalWithTax": float (与amount相同，表示总金额),
    "remarks": "string",
    "description": "string (简要报销说明，必须包含项目总结)"
}

重要说明：
- 对于 amount（税后）：必须从发票的"价税合计"栏提取
- 对于 subtotal（税前）：必须从发票"合计"行的第一列提取（不含税金额）
- 对于 tax（税额）：必须从发票"合计"行的最后一列提取（税额）
- 如果发票有多个项目：
  1. 金额必须使用发票底部的合计金额
  2. itemName 栏必须总结所有项目（例如："办公用品一批" 或 "餐饮费等"），不要只写第一个项目名称
  3. description 栏同理，进行概括
- 如果字段未找到或不清楚，字符串使用空字符串 ""，数字使用 0
- 对于 'description'，最好结合类别和项目名称（例如："餐饮美食 - 员工聚餐"）`
                }
              ]
            }]
          }
        })
      }
    );

    const data = await response.json();

    if (!data.output || !data.output.choices || !data.output.choices[0]) {
      throw new Error('Invalid response from Qwen API');
    }

    const responseText = data.output.choices[0].message.content[0].text;

    // Extract JSON from response
    const startIdx = responseText.indexOf('{');
    const endIdx = responseText.lastIndexOf('}');

    if (startIdx === -1 || endIdx === -1) {
      throw new Error('No JSON found in response');
    }

    const jsonStr = responseText.substring(startIdx, endIdx + 1);
    const parsedData = JSON.parse(jsonStr);

    // Return parsed data
    return res.status(200).json(parsedData);

  } catch (error) {
    console.error('OCR Error:', error);
    return res.status(500).json({
      error: 'OCR processing failed',
      details: error.message
    });
  }
}
