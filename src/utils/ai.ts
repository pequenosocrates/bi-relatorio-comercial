import type {
  ClientAiAnalysis,
  NextActionOption,
  ProbabilityLevel,
  ProofreadResult,
} from '../types/report';

const OFFLINE_MESSAGE =
  'Sem ligação à Internet neste momento. O registo local continua seguro e a IA estará disponível assim que houver rede.';

// Client-side session cache avoids duplicate Gemini API calls on identical text
const proofreadCache = new Map<string, ProofreadResult>();
const analysisCache = new Map<string, ClientAiAnalysis>();

function setBoundedCache<T>(cache: Map<string, T>, key: string, value: T, maxEntries = 40) {
  if (cache.size >= maxEntries) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) {
      cache.delete(oldestKey);
    }
  }
  cache.set(key, value);
}

export async function proofreadVisitTexts(payload: {
  description: string;
  problem: string;
  feedback: string;
}): Promise<ProofreadResult> {
  const normalized = {
    description: payload.description.trim(),
    problem: payload.problem.trim(),
    feedback: payload.feedback.trim(),
  };

  const cacheKey = JSON.stringify(normalized);
  const cached = proofreadCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error(OFFLINE_MESSAGE);
  }

  let response: Response;
  try {
    response = await fetch('/api/gemini/proofread', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(normalized),
    });
  } catch {
    throw new Error(OFFLINE_MESSAGE);
  }

  const data = (await response.json().catch(() => ({}))) as {
    corrected?: ProofreadResult;
    error?: string;
  };

  if (!response.ok || !data.corrected) {
    throw new Error(
      data.error ||
        'Não foi possível concluir a correcção neste momento. Os seus dados locais continuam seguros.'
    );
  }

  setBoundedCache(proofreadCache, cacheKey, data.corrected);
  return data.corrected;
}

export async function analyzeClientVisit(payload: {
  company: string;
  description: string;
  problem: string;
  feedback: string;
  probability: ProbabilityLevel;
  nextAction: NextActionOption;
  otherAction: string;
}): Promise<ClientAiAnalysis> {
  const normalized = {
    company: payload.company.trim(),
    description: payload.description.trim(),
    problem: payload.problem.trim(),
    feedback: payload.feedback.trim(),
    probability: payload.probability,
    nextAction: payload.nextAction,
    otherAction: payload.otherAction.trim(),
  };

  const cacheKey = JSON.stringify(normalized);
  const cached = analysisCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error(OFFLINE_MESSAGE);
  }

  let response: Response;
  try {
    response = await fetch('/api/gemini/analyze-client', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(normalized),
    });
  } catch {
    throw new Error(OFFLINE_MESSAGE);
  }

  const data = (await response.json().catch(() => ({}))) as {
    analysis?: ClientAiAnalysis;
    error?: string;
  };

  if (!response.ok || !data.analysis) {
    throw new Error(
      data.error ||
        'Não foi possível gerar a análise comercial neste momento. Os seus dados locais continuam seguros.'
    );
  }

  setBoundedCache(analysisCache, cacheKey, data.analysis);
  return data.analysis;
}
