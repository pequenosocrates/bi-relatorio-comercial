import 'dotenv/config';
import { GoogleGenAI, Type } from '@google/genai';
import express, { type Request, type Response } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const MODEL_NAME = 'gemini-2.5-flash';
const MAX_FIELD_CHARS = 1500;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 30;

// Simple sliding-window rate limiter to protect free-tier Gemini quota
const rateLimitStore = new Map<string, number[]>();

function isRateLimited(clientKey: string): boolean {
  const now = Date.now();
  const timestamps = (rateLimitStore.get(clientKey) ?? []).filter(
    (ts) => now - ts < RATE_WINDOW_MS
  );
  if (timestamps.length >= MAX_REQUESTS_PER_WINDOW) {
    rateLimitStore.set(clientKey, timestamps);
    return true;
  }
  timestamps.push(now);
  rateLimitStore.set(clientKey, timestamps);

  // Prevent unbounded map growth across long uptimes
  if (rateLimitStore.size > 2000) {
    for (const [key, list] of rateLimitStore.entries()) {
      const fresh = list.filter((ts) => now - ts < RATE_WINDOW_MS);
      if (fresh.length === 0) {
        rateLimitStore.delete(key);
      }
    }
  }
  return false;
}

function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || 'unknown';
}

function sanitizeInputText(value: unknown, maxLen = MAX_FIELD_CHARS): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLen);
}

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      timeout: 18000,
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function extractErrorMessage(err: unknown): { status: number; message: string } {
  const rawMessage = err instanceof Error ? err.message : String(err);
  const lower = rawMessage.toLowerCase();

  if (lower.includes('api_key') || lower.includes('permission_denied') || lower.includes('403')) {
    return {
      status: 503,
      message:
        'Chave da API Gemini indisponível ou inválida. Verifique a configuração em Settings > Secrets. Os seus dados locais continuam seguros.',
    };
  }
  if (lower.includes('429') || lower.includes('resource_exhausted') || lower.includes('quota')) {
    return {
      status: 429,
      message:
        'Limite temporário de pedidos à IA atingido. Tente novamente dentro de alguns instantes.',
    };
  }
  if (lower.includes('timeout') || lower.includes('aborted')) {
    return {
      status: 504,
      message:
        'O serviço de IA demorou demasiado a responder. Os seus dados locais continuam seguros; tente novamente.',
    };
  }
  if (lower.includes('fetch failed') || lower.includes('enotfound') || lower.includes('network')) {
    return {
      status: 503,
      message:
        'Sem ligação à Internet neste momento. O registo local continua seguro e a IA estará disponível assim que houver rede.',
    };
  }

  return {
    status: 500,
    message:
      'Não foi possível contactar o serviço de IA neste momento. O registo local continua seguro.',
  };
}

const PROOFREAD_SYSTEM_INSTRUCTION = `És um revisor linguístico sénior especializado em Português de Portugal (norma europeia) e em comunicação comercial B2B.
A tua tarefa é rever e aperfeiçoar os textos de um relatório comercial de campo (Descrição, Problema e Feedback do cliente).

Regras obrigatórias e inegociáveis:
1. Rever gramática, ortografia, pontuação, concordância verbal e nominal, clareza e tom profissional comercial.
2. Utilizar RIGOROSAMENTE o Português de Portugal ANTERIOR ao Acordo Ortográfico de 1990 (grafia clássica com consoantes mudas):
   - Exemplos obrigatórios: acção, actual, objectivo, optimizar, projecto, directo, facto, sector, óptimo, exacto, recepção, director, contacto, adopção, espectáculo, eléctrico, arquitectura, colecção, selecção, protecção, correcção, inspecção, direcção, reacção, objecção, económico.
   - Usar também grafia clássica de acentuação e hífens pré-1990 quando aplicável (ex: "para" com acento diferencial "pára" do verbo parar, "pêlo", "pólo", "micro-empresa", "auto-estrada", etc.).
3. NÃO inventar factos, números, nomes ou promessas. Preserva integralmente o sentido técnico e factual do que o vendedor escreveu.
4. Se um campo de entrada estiver vazio (""), devolve exactamente uma string vazia ("") para esse campo.
5. Mantém os textos concisos, naturais e prontos para leitura pela direcção comercial.`;

const CLIENT_ANALYSIS_SYSTEM_INSTRUCTION = `És um consultor comercial sénior da empresa BI (Business Intelligence para PMEs Moçambicanas, Grupo CTS · Maputo).
A BI é especializada em ajudar PMEs em Moçambique a centralizar dados dispersos (vendas, stock, despesas, ficheiros Excel, POS e ERP), criar dashboards de gestão em tempo real, reduzir rupturas de stock, controlar desvios financeiros e aumentar a margem líquida.

A tua tarefa é analisar os dados de uma visita comercial no terreno e gerar exactamente 4 tópicos curtos, práticos e accionáveis para o vendedor.

Regras obrigatórias de idioma e estilo:
1. Escrever RIGOROSAMENTE em Português de Portugal ANTERIOR ao Acordo Ortográfico de 1990 (manter consoantes mudas como: acção, actual, objectivo, optimizar, projecto, directo, facto, sector, óptimo, exacto, recepção, director, protecção, reacção, objecção).
2. Ser muito prático, comercial e focado na realidade das PMEs moçambicanas (gestão de caixa, stock, filiais, folhas de Excel soltas, tomada de decisão rápida).
3. Responder estritamente no formato JSON pedido, com 2 a 3 frases objectivas por tópico.`;

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '128kb' }));

  app.post('/api/gemini/proofread', async (req: Request, res: Response) => {
    if (isRateLimited(getClientIp(req))) {
      res.status(429).json({
        error:
          'Limite temporário de pedidos à IA atingido para proteger o serviço gratuito. Aguarde alguns minutos.',
      });
      return;
    }

    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        error:
          'Serviço de IA não configurado (GEMINI_API_KEY ausente). Os seus dados locais continuam seguros.',
      });
      return;
    }

    const body = req.body as {
      description?: unknown;
      problem?: unknown;
      feedback?: unknown;
    };

    const description = sanitizeInputText(body.description);
    const problem = sanitizeInputText(body.problem);
    const feedback = sanitizeInputText(body.feedback);

    if (!description && !problem && !feedback) {
      res.status(400).json({
        error: 'Preencha pelo menos um dos campos (Descrição, Problema ou Feedback) para corrigir.',
      });
      return;
    }

    try {
      const prompt = JSON.stringify({ description, problem, feedback }, null, 2);

      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: `Corrige e melhora os seguintes campos de um relatório comercial em Português de Portugal (ortografia pré-1990). Mantém vazios os campos que estiverem vazios:\n\n${prompt}`,
        config: {
          systemInstruction: PROOFREAD_SYSTEM_INSTRUCTION,
          temperature: 0.2,
          maxOutputTokens: 900,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              description: {
                type: Type.STRING,
                description: 'Texto corrigido do campo Descrição (ou vazio se entrada vazia).',
              },
              problem: {
                type: Type.STRING,
                description: 'Texto corrigido do campo Problema (ou vazio se entrada vazia).',
              },
              feedback: {
                type: Type.STRING,
                description: 'Texto corrigido do campo Feedback do cliente (ou vazio se entrada vazia).',
              },
            },
            required: ['description', 'problem', 'feedback'],
          },
        },
      });

      const rawText = (response.text ?? '{}').trim();
      const parsed = JSON.parse(rawText) as {
        description?: string;
        problem?: string;
        feedback?: string;
      };

      res.json({
        corrected: {
          description: description ? (parsed.description ?? description).trim() : '',
          problem: problem ? (parsed.problem ?? problem).trim() : '',
          feedback: feedback ? (parsed.feedback ?? feedback).trim() : '',
        },
      });
    } catch (err) {
      const mapped = extractErrorMessage(err);
      res.status(mapped.status).json({ error: mapped.message });
    }
  });

  app.post('/api/gemini/analyze-client', async (req: Request, res: Response) => {
    if (isRateLimited(getClientIp(req))) {
      res.status(429).json({
        error:
          'Limite temporário de pedidos à IA atingido para proteger o serviço gratuito. Aguarde alguns minutos.',
      });
      return;
    }

    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        error:
          'Serviço de IA não configurado (GEMINI_API_KEY ausente). Os seus dados locais continuam seguros.',
      });
      return;
    }

    const body = req.body as {
      company?: unknown;
      description?: unknown;
      problem?: unknown;
      feedback?: unknown;
      probability?: unknown;
      nextAction?: unknown;
      otherAction?: unknown;
    };

    const company = sanitizeInputText(body.company, 200);
    const description = sanitizeInputText(body.description);
    const problem = sanitizeInputText(body.problem);
    const feedback = sanitizeInputText(body.feedback);
    const probability = sanitizeInputText(body.probability, 60);
    const nextAction = sanitizeInputText(body.nextAction, 60);
    const otherAction = sanitizeInputText(body.otherAction, 200);

    if (!company && !description && !problem) {
      res.status(400).json({
        error: 'Preencha pelo menos a Empresa, Descrição ou Problema antes de analisar o cliente.',
      });
      return;
    }

    const actionDisplay =
      nextAction === 'Outro'
        ? `Outro (${otherAction || 'Não especificado'})`
        : nextAction || 'Não definida';

    try {
      const prompt = [
        `Dados da visita comercial:`,
        `- Empresa: ${company || 'Não informada'}`,
        `- Descrição: ${description || 'Não informada'}`,
        `- Problema identificado: ${problem || 'Não informado'}`,
        `- Feedback do cliente: ${feedback || 'Sem observações registadas'}`,
        `- Possibilidade de fechar a venda: ${probability || 'Não definida'}`,
        `- Acção a seguir definida: ${actionDisplay}`,
      ].join('\n');

      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: prompt,
        config: {
          systemInstruction: CLIENT_ANALYSIS_SYSTEM_INSTRUCTION,
          temperature: 0.4,
          maxOutputTokens: 900,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              diagnosticoRapido: {
                type: Type.STRING,
                description:
                  '1. Diagnóstico Rápido: Qual a dor operacional ou financeira crítica deste cliente.',
              },
              propostaValorBi: {
                type: Type.STRING,
                description:
                  '2. Proposta de Valor BI: Como os dashboards e soluções da BI resolvem exactamente esse problema.',
              },
              argumentoObjeccoes: {
                type: Type.STRING,
                description:
                  '3. Argumento para Objecções: Como responder ao feedback ou receios manifestados pelo cliente.',
              },
              proximoPassoRecomendado: {
                type: Type.STRING,
                description:
                  '4. Próximo Passo Recomendado: Abordagem objectiva para a acção seguinte definida.',
              },
            },
            required: [
              'diagnosticoRapido',
              'propostaValorBi',
              'argumentoObjeccoes',
              'proximoPassoRecomendado',
            ],
          },
        },
      });

      const rawText = (response.text ?? '{}').trim();
      const parsed = JSON.parse(rawText) as {
        diagnosticoRapido?: string;
        propostaValorBi?: string;
        argumentoObjeccoes?: string;
        proximoPassoRecomendado?: string;
      };

      res.json({
        analysis: {
          diagnosticoRapido: (parsed.diagnosticoRapido ?? '').trim(),
          propostaValorBi: (parsed.propostaValorBi ?? '').trim(),
          argumentoObjeccoes: (parsed.argumentoObjeccoes ?? '').trim(),
          proximoPassoRecomendado: (parsed.proximoPassoRecomendado ?? '').trim(),
          generatedAt: new Date().toISOString(),
        },
      });
    } catch (err) {
      const mapped = extractErrorMessage(err);
      res.status(mapped.status).json({ error: mapped.message });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      const indexFile = path.join(distPath, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
