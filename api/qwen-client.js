export class QwenClientError extends Error {
  constructor(message, {
    code = 'QWEN_CLIENT_ERROR',
    statusCode,
    canFallback = false
  } = {}) {
    super(message);
    this.name = 'QwenClientError';
    this.code = code;
    this.canFallback = canFallback;
    if (statusCode !== undefined) this.statusCode = statusCode;
  }
}

function configError(variableName) {
  return new QwenClientError(`${variableName} is not configured correctly`, {
    code: 'CONFIG_ERROR',
    canFallback: false
  });
}

function parseNonNegativeInteger(value, variableName, defaultValue) {
  const source = value === undefined || value === '' ? defaultValue : Number(value);
  if (!Number.isFinite(source) || !Number.isInteger(source) || source < 0) {
    throw configError(variableName);
  }
  return source;
}

export function loadQwenClientConfig(env = process.env) {
  const apiKey = String(env.QWEN_API_KEY || '').trim();
  const endpoint = String(env.QWEN_ENDPOINT || '').trim();
  const thinkingValue = String(env.QWEN_ENABLE_THINKING ?? 'false').trim().toLowerCase();

  if (!apiKey) throw configError('QWEN_API_KEY');
  if (!endpoint) throw configError('QWEN_ENDPOINT');
  if (thinkingValue !== 'false') throw configError('QWEN_ENABLE_THINKING');

  return {
    apiKey,
    endpoint,
    enableThinking: false,
    timeoutMs: parseNonNegativeInteger(env.QWEN_TIMEOUT_MS, 'QWEN_TIMEOUT_MS', 60000),
    maxRetries: parseNonNegativeInteger(env.QWEN_MAX_RETRIES, 'QWEN_MAX_RETRIES', 1)
  };
}

export function buildQwenRequest({ model, image, prompt }) {
  return {
    model,
    input: {
      messages: [
        {
          role: 'user',
          content: [
            { image },
            { text: prompt }
          ]
        }
      ]
    },
    parameters: {
      result_format: 'message',
      enable_thinking: false,
      response_format: { type: 'json_object' }
    }
  };
}

function createHttpError(statusCode) {
  const canFallback = statusCode === 408 || statusCode === 429 || statusCode >= 500;
  return new QwenClientError(`DashScope request failed with HTTP ${statusCode}`, {
    code: 'UPSTREAM_HTTP_ERROR',
    statusCode,
    canFallback
  });
}

function createTransportError(error) {
  const isTimeout = error?.name === 'AbortError';
  return new QwenClientError(
    isTimeout ? 'DashScope request timed out' : 'DashScope network request failed',
    {
      code: isTimeout ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_NETWORK_ERROR',
      canFallback: true
    }
  );
}

export function createQwenClient({
  env = process.env,
  fetchImpl = globalThis.fetch,
  now = Date.now
} = {}) {
  const config = loadQwenClientConfig(env);

  return {
    async generate({ model, image, prompt }) {
      const requestBody = buildQwenRequest({ model, image, prompt });
      const deadline = now() + config.timeoutMs;

      for (let attempt = 0; attempt <= config.maxRetries; attempt += 1) {
        const remainingMs = Math.max(0, deadline - now());
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), remainingMs);

        let response;
        try {
          response = await fetchImpl(config.endpoint, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${config.apiKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody),
            signal: controller.signal
          });
        } catch (error) {
          clearTimeout(timeoutId);
          const safeError = createTransportError(error);
          if (attempt < config.maxRetries && now() < deadline) continue;
          throw safeError;
        }

        if (!response.ok) {
          clearTimeout(timeoutId);
          const safeError = createHttpError(response.status);
          if (safeError.canFallback && attempt < config.maxRetries && now() < deadline) {
            continue;
          }
          throw safeError;
        }

        try {
          return await response.json();
        } catch (error) {
          if (error?.name === 'AbortError') throw createTransportError(error);
          throw new QwenClientError('DashScope returned an unreadable response', {
            code: 'UPSTREAM_RESPONSE_ERROR',
            canFallback: true
          });
        } finally {
          clearTimeout(timeoutId);
        }
      }

      throw new QwenClientError('DashScope request failed', {
        code: 'UPSTREAM_REQUEST_ERROR',
        canFallback: true
      });
    }
  };
}
