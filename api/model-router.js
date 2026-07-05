class ModelRoutingError extends Error {
  constructor(message, {
    code = 'MODEL_ROUTING_ERROR',
    canFallback = false
  } = {}) {
    super(message);
    this.name = 'ModelRoutingError';
    this.code = code;
    this.canFallback = canFallback;
  }
}

function requireModel(env, variableName) {
  const value = String(env[variableName] || '').trim();
  if (!value) {
    throw new ModelRoutingError(`${variableName} is not configured`, {
      code: 'CONFIG_ERROR',
      canFallback: false
    });
  }
  return value;
}

export function loadModelRoutingConfig(env = process.env) {
  return {
    primary: requireModel(env, 'QWEN_PRIMARY_MODEL'),
    fallback: requireModel(env, 'QWEN_FALLBACK_MODEL'),
    highAccuracy: requireModel(env, 'QWEN_HIGH_ACCURACY_MODEL')
  };
}

export function shouldUseFallback(error) {
  return error?.canFallback === true;
}

function createRoutingMeta(model, fallbackUsed, startedAt, now) {
  const elapsed = Number(now()) - Number(startedAt);
  return {
    model,
    fallbackUsed,
    latencyMs: Math.max(0, Math.round(Number.isFinite(elapsed) ? elapsed : 0))
  };
}

function createRoutedResult(result, model, fallbackUsed, startedAt, now) {
  return {
    result,
    meta: createRoutingMeta(model, fallbackUsed, startedAt, now)
  };
}

function attachRoutingMeta(error, model, fallbackUsed, startedAt, now) {
  const routingMeta = createRoutingMeta(model, fallbackUsed, startedAt, now);
  if (error && (typeof error === 'object' || typeof error === 'function')) {
    try {
      error.routingMeta = routingMeta;
      return error;
    } catch {
      // Fall through to a safe wrapper when an upstream error is immutable.
    }
  }

  const wrapped = new ModelRoutingError('Model request failed', {
    code: typeof error?.code === 'string' ? error.code : 'MODEL_ROUTING_ERROR',
    canFallback: false
  });
  wrapped.routingMeta = routingMeta;
  return wrapped;
}

export async function routeModelRequest({
  mode = 'normal',
  models,
  invokeModel,
  validateResult = () => true,
  now = Date.now
}) {
  const startedAt = now();

  if (mode === 'high_accuracy') {
    try {
      const result = await invokeModel({
        model: models.highAccuracy,
        attempt: 'high_accuracy'
      });
      return createRoutedResult(result, models.highAccuracy, false, startedAt, now);
    } catch (error) {
      throw attachRoutingMeta(error, models.highAccuracy, false, startedAt, now);
    }
  }

  if (mode !== 'normal') {
    throw new ModelRoutingError('Unsupported OCR mode', {
      code: 'CONFIG_ERROR',
      canFallback: false
    });
  }

  try {
    const primaryResult = await invokeModel({
      model: models.primary,
      attempt: 'primary'
    });

    if (await validateResult(primaryResult)) {
      return createRoutedResult(primaryResult, models.primary, false, startedAt, now);
    }
  } catch (error) {
    if (!shouldUseFallback(error)) {
      throw attachRoutingMeta(error, models.primary, false, startedAt, now);
    }
  }

  try {
    const fallbackResult = await invokeModel({
      model: models.fallback,
      attempt: 'fallback'
    });
    return createRoutedResult(fallbackResult, models.fallback, true, startedAt, now);
  } catch (error) {
    throw attachRoutingMeta(error, models.fallback, true, startedAt, now);
  }
}
