/**
 * CF Pages Function: /api/generate
 * AI 流程架构生成接口 — 支持 OpenAI 兼容 API
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

async function callAI({ baseUrl, apiKey, model, messages, maxTokens = 8192, temperature = 0.7 }) {
  const resp = await fetch(`${baseUrl}chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`AI API error (${resp.status}): ${errText}`);
  }

  const data = await resp.json();
  return data.choices?.[0]?.message?.content?.trim() || '';
}

export async function onRequestOptions() {
  return new Response(null, { headers: CORS_HEADERS });
}

export async function onRequestPost(context) {
  try {
    const body = await context.request.json();
    const {
      messages = [],
      modelConfig = {},
      action = 'generate',
    } = body;

    const apiKey = modelConfig.apiKey || context.env?.AI_API_KEY || '';
    const baseUrl = modelConfig.baseUrl || context.env?.AI_BASE_URL || 'https://api.deepseek.com';
    const model = modelConfig.model || context.env?.AI_MODEL || 'deepseek-chat';

    if (!apiKey) {
      return jsonResponse({ error: '未配置 AI API Key，请在设置中配置' }, 400);
    }

    // Test connection mode
    if (action === 'test') {
      const result = await callAI({
        baseUrl,
        apiKey,
        model,
        messages: [{ role: 'user', content: '你好，请回复"连接成功"' }],
        maxTokens: 50,
      });
      return jsonResponse({ success: true, message: result });
    }

    // Generate mode — requires messages array
    if (!messages || messages.length === 0) {
      return jsonResponse({ error: '请提供对话消息 (messages)' }, 400);
    }

    const response = await callAI({
      baseUrl,
      apiKey,
      model,
      messages,
      maxTokens: modelConfig.maxTokens || 8192,
      temperature: modelConfig.temperature ?? 0.7,
    });

    return jsonResponse({ success: true, content: response });
  } catch (error) {
    return jsonResponse({ error: `生成错误: ${error.message}` }, 500);
  }
}
