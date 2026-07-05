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

function validationError() {
  return new ModelRoutingError('Model result did not pass validation', {
    code: 'RESULT_VALIDATION_ERROR',
    canFallback: false
  });
}

function createRoutedResult(result, model, fallbackUsed, startedAt, now) {
  const elapsed = Number(now()) - Number(startedAt);
  return {
    result,
    meta: {
      model,
      fallbackUsed,
      latencyMs: Math.max(0, Math.round(Number.isFinite(elapsed) ? elapsed : 0))
    }
  };
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
    const result = await invokeModel({
      model: models.highAccuracy,
      attempt: 'high_accuracy'
    });
    if (!await validateResult(result)) throw validationError();
    return createRoutedResult(result, models.highAccuracy, false, startedAt, now);
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
    if (!shouldUseFallback(error)) throw error;
  }

  const fallbackResult = await invokeModel({
    model: models.fallback,
    attempt: 'fallback'
  });
  if (!await validateResult(fallbackResult)) throw validationError();

  return createRoutedResult(fallbackResult, models.fallback, true, startedAt, now);
}
