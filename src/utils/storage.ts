import type {
  DailyReport,
  NextActionOption,
  ProbabilityLevel,
  SupportComment,
  UserRole,
  Visit,
} from '../types/report';

export const STORAGE_KEYS = {
  AUTH_SESSION: 'rcd_session_authenticated',
  AUTH_ROLE: 'rcd_session_role',
  CONFIG_CODE: 'rcd_configured_access_code',
  ADMIN_CONFIG_CODE: 'rcd_admin_configured_code',
  SELLER_NAME: 'rcd_seller_name',
  MANAGER_NAME: 'rcd_manager_name',
  REPORTS_PREFIX: 'rcd_report_',
  CLOUD_SYNC_PREFIX: 'rcd_cloud_sync_',
  CLOUD_CONTINGENCY_PREFIX: 'rcd_cloud_contingency_',
} as const;

export const VISITS_PER_DAY = 10;

export const CODE_REGEX = /^[A-Z]{2}[0-9]{3}$/;

export interface ProbabilityConfig {
  id: Exclude<ProbabilityLevel, ''>;
  label: string;
  idleClass: string;
  activeClass: string;
}

export const PROBABILITY_OPTIONS: ProbabilityConfig[] = [
  {
    id: 'Muito baixa',
    label: 'Muito baixa',
    idleClass: 'border-red-200 text-red-700 bg-red-50/60 hover:bg-red-50',
    activeClass: 'bg-red-600 text-white border-red-600 shadow-sm',
  },
  {
    id: 'Baixa',
    label: 'Baixa',
    idleClass: 'border-orange-200 text-orange-700 bg-orange-50/60 hover:bg-orange-50',
    activeClass: 'bg-orange-500 text-white border-orange-500 shadow-sm',
  },
  {
    id: 'Neutra',
    label: 'Neutra',
    idleClass: 'border-slate-200 text-slate-700 bg-slate-50 hover:bg-slate-100',
    activeClass: 'bg-slate-700 text-white border-slate-700 shadow-sm',
  },
  {
    id: 'Maior',
    label: 'Maior',
    idleClass: 'border-sky-200 text-sky-800 bg-sky-50/60 hover:bg-sky-50',
    activeClass: 'bg-brand-cyan text-white border-brand-cyan shadow-sm',
  },
  {
    id: 'Muito maior',
    label: 'Muito maior',
    idleClass: 'border-emerald-200 text-emerald-700 bg-emerald-50/60 hover:bg-emerald-50',
    activeClass: 'bg-emerald-600 text-white border-emerald-600 shadow-sm',
  },
];

export const ACTION_OPTIONS: Exclude<NextActionOption, ''>[] = [
  'Ligação',
  'Nova visita',
  'Apresentar proposta',
  'Encerramento',
  'Outro',
];

const SHA256_PREFIX = 'sha256:';

export async function hashAccessCode(code: string, role: UserRole = 'seller'): Promise<string> {
  const normalized = code.trim().toUpperCase();
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoded = new TextEncoder().encode(`bi-rcd:${role}:${normalized}`);
    const digest = await crypto.subtle.digest('SHA-256', encoded);
    const hex = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    return `${SHA256_PREFIX}${hex}`;
  }
  return normalized;
}

export async function saveHashedAccessCode(code: string, role: UserRole = 'seller'): Promise<void> {
  const hashed = await hashAccessCode(code, role);
  const key = role === 'admin' ? STORAGE_KEYS.ADMIN_CONFIG_CODE : STORAGE_KEYS.CONFIG_CODE;
  localStorage.setItem(key, hashed);
}

export async function verifyAccessCode(candidate: string, role: UserRole = 'seller'): Promise<boolean> {
  const key = role === 'admin' ? STORAGE_KEYS.ADMIN_CONFIG_CODE : STORAGE_KEYS.CONFIG_CODE;
  const stored = localStorage.getItem(key);
  if (!stored) return false;
  const normalized = candidate.trim().toUpperCase();

  if (stored.startsWith(SHA256_PREFIX)) {
    const candidateHash = await hashAccessCode(normalized, role);
    if (candidateHash === stored) return true;
    // Also check legacy seller salt format if seller hash was saved prior to role parameter
    if (role === 'seller' && typeof crypto !== 'undefined' && crypto.subtle) {
      const legacyEncoded = new TextEncoder().encode(`bi-rcd:${normalized}`);
      const legacyDigest = await crypto.subtle.digest('SHA-256', legacyEncoded);
      const legacyHex = Array.from(new Uint8Array(legacyDigest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
      if (`${SHA256_PREFIX}${legacyHex}` === stored) {
        await saveHashedAccessCode(normalized, 'seller');
        return true;
      }
    }
    return false;
  }

  // Backward-compatible migration from legacy plaintext 5-char code
  if (normalized === stored) {
    await saveHashedAccessCode(normalized, role);
    return true;
  }
  return false;
}

export function getTodayISO(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatDatePT(isoDate: string): string {
  if (!isoDate) return '';
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  const [y, m, d] = parts;
  return `${d}/${m}/${y}`;
}

export function createEmptyVisitsArray(count = VISITS_PER_DAY): Visit[] {
  return Array.from({ length: count }, (_, idx) => ({
    id: idx + 1,
    company: '',
    contactName: '',
    contactPhone: '',
    description: '',
    location: '',
    problem: '',
    feedback: '',
    probability: '',
    nextAction: '',
    otherAction: '',
    isLocked: false,
    updatedAt: null,
    photos: [],
    managerComments: [],
  }));
}

function hasVisitContent(v: Visit): boolean {
  return Boolean(
    v.company.trim() ||
      v.contactName?.trim() ||
      v.contactPhone?.trim() ||
      v.description.trim() ||
      v.location.trim() ||
      v.problem.trim() ||
      v.feedback.trim() ||
      v.probability ||
      v.nextAction ||
      v.isLocked ||
      (v.photos && v.photos.length > 0) ||
      (v.managerComments && v.managerComments.length > 0)
  );
}

export function normalizeVisitsLength(existing: Visit[]): Visit[] {
  if (existing.length === VISITS_PER_DAY) return existing;

  // Preserve any filled slots beyond VISITS_PER_DAY from prior sessions
  let targetLength = VISITS_PER_DAY;
  if (existing.length > VISITS_PER_DAY) {
    let lastFilledIdx = -1;
    for (let i = existing.length - 1; i >= VISITS_PER_DAY; i--) {
      if (hasVisitContent(existing[i])) {
        lastFilledIdx = i;
        break;
      }
    }
    if (lastFilledIdx >= VISITS_PER_DAY) {
      targetLength = lastFilledIdx + 1;
    }
  }

  const normalized = createEmptyVisitsArray(targetLength);
  for (let i = 0; i < Math.min(existing.length, targetLength); i++) {
    normalized[i] = { ...normalized[i], ...existing[i], id: i + 1 };
  }
  return normalized;
}

export function loadDailyReportRecord(dateISO: string): {
  visits: Visit[];
  dailyManagerComments: SupportComment[];
} {
  const storageKey = STORAGE_KEYS.REPORTS_PREFIX + dateISO;
  const raw = localStorage.getItem(storageKey);

  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Partial<DailyReport>;
      const dailyManagerComments = Array.isArray(parsed.dailyManagerComments)
        ? parsed.dailyManagerComments
        : [];
      if (Array.isArray(parsed.visits) && parsed.visits.length > 0) {
        const normalized = normalizeVisitsLength(parsed.visits);
        if (normalized.length !== parsed.visits.length) {
          saveDailyReport(dateISO, normalized, dailyManagerComments);
        }
        return { visits: normalized, dailyManagerComments };
      }
    } catch {
      // Fallback to fresh visits array if corrupted
    }
  }

  const emptyVisits = createEmptyVisitsArray();
  saveDailyReport(dateISO, emptyVisits, []);
  return { visits: emptyVisits, dailyManagerComments: [] };
}

export function loadDailyReport(dateISO: string): Visit[] {
  return loadDailyReportRecord(dateISO).visits;
}

export function saveDailyReport(
  dateISO: string,
  visits: Visit[],
  dailyManagerComments?: SupportComment[]
): { ok: boolean; error?: string } {
  const storageKey = STORAGE_KEYS.REPORTS_PREFIX + dateISO;

  let commentsToSave = dailyManagerComments;
  if (commentsToSave === undefined) {
    const existingRaw = localStorage.getItem(storageKey);
    if (existingRaw) {
      try {
        const parsed = JSON.parse(existingRaw) as Partial<DailyReport>;
        if (Array.isArray(parsed.dailyManagerComments)) {
          commentsToSave = parsed.dailyManagerComments;
        }
      } catch {
        // Ignore
      }
    }
  }

  const payload: DailyReport = {
    date: dateISO,
    sellerName: localStorage.getItem(STORAGE_KEYS.SELLER_NAME) || '',
    lastUpdated: new Date().toISOString(),
    visits,
    dailyManagerComments: commentsToSave ?? [],
  };
  try {
    localStorage.setItem(storageKey, JSON.stringify(payload));
    return { ok: true };
  } catch {
    return {
      ok: false,
      error:
        'Memória local do navegador cheia. Exporte ou remova dados de demonstração nas Definições.',
    };
  }
}

export function getSavedReportDates(): string[] {
  const dates: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(STORAGE_KEYS.REPORTS_PREFIX)) {
      dates.push(key.replace(STORAGE_KEYS.REPORTS_PREFIX, ''));
    }
  }
  return dates.sort().reverse();
}

export type VisitStatusCode = 'locked' | 'in_progress' | 'empty';

export function getVisitStatus(visit: Visit): {
  code: VisitStatusCode;
  label: string;
} {
  if (visit.isLocked) {
    return { code: 'locked', label: 'Bloqueada' };
  }
  const hasAnyData = Boolean(
    visit.company.trim() ||
      visit.contactName?.trim() ||
      visit.contactPhone?.trim() ||
      visit.description.trim() ||
      visit.location.trim() ||
      visit.problem.trim() ||
      visit.feedback.trim() ||
      visit.probability ||
      visit.nextAction ||
      (visit.photos && visit.photos.length > 0)
  );
  if (hasAnyData) {
    return { code: 'in_progress', label: 'Em curso' };
  }
  return { code: 'empty', label: 'Por preencher' };
}

export function getRecordedVisits(visits: Visit[]): Visit[] {
  return visits.filter(
    (v) =>
      v.company.trim() !== '' ||
      v.description.trim() !== '' ||
      v.problem.trim() !== '' ||
      v.isLocked
  );
}

export function validateVisitRequiredFields(visit: Visit): string | null {
  if (!visit.company.trim()) {
    return 'Por favor, preencha o nome da Empresa (Campo 01).';
  }
  if (!visit.description.trim()) {
    return 'Por favor, preencha a Descrição da visita (Campo 02).';
  }
  if (!visit.problem.trim()) {
    return 'Por favor, registe o Problema identificado (Campo 04).';
  }
  if (!visit.nextAction) {
    return 'Por favor, seleccione a Acção a seguir (Campo 07).';
  }
  if (visit.nextAction === 'Outro' && !visit.otherAction.trim()) {
    return 'Por favor, especifique qual é a outra acção a seguir.';
  }
  return null;
}

export function loadAllReportsByDate(): Array<{ date: string; report: DailyReport }> {
  const results: Array<{ date: string; report: DailyReport }> = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith(STORAGE_KEYS.REPORTS_PREFIX)) continue;
    const date = key.replace(STORAGE_KEYS.REPORTS_PREFIX, '');
    const raw = localStorage.getItem(key);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as DailyReport;
      if (Array.isArray(parsed.visits)) {
        results.push({ date, report: parsed });
      }
    } catch {
      // Ignore malformed entry
    }
  }
  return results.sort((a, b) => a.date.localeCompare(b.date));
}

export function parseCoordinatesFromLocation(input: string): { lat: number; lng: number } | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const patterns = [
    /^(-?\d{1,2}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)$/,
    /[?&](?:q|query|ll|destination|center)=(-?\d{1,2}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)/i,
    /@(-?\d{1,2}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)/,
    /!3d(-?\d{1,2}(?:\.\d+)?)!4d(-?\d{1,3}(?:\.\d+)?)/,
  ];

  for (const regex of patterns) {
    const match = trimmed.match(regex);
    if (match) {
      const lat = Number(match[1]);
      const lng = Number(match[2]);
      if (
        Number.isFinite(lat) &&
        Number.isFinite(lng) &&
        lat >= -90 &&
        lat <= 90 &&
        lng >= -180 &&
        lng <= 180
      ) {
        return { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) };
      }
    }
  }

  return null;
}

export function formatGoogleMapsPointUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps?q=${lat.toFixed(6)},${lng.toFixed(6)}`;
}

export function getVisitCoordinates(visit: Visit): { lat: number; lng: number } | null {
  if (
    typeof visit.latitude === 'number' &&
    typeof visit.longitude === 'number' &&
    Number.isFinite(visit.latitude) &&
    Number.isFinite(visit.longitude)
  ) {
    return { lat: visit.latitude, lng: visit.longitude };
  }
  if (visit.location) {
    return parseCoordinatesFromLocation(visit.location);
  }
  return null;
}

export function buildGoogleMapsRouteUrl(
  points: Array<{ lat: number; lng: number }>
): string | null {
  if (points.length === 0) return null;
  if (points.length === 1) {
    return `https://www.google.com/maps/search/?api=1&query=${points[0].lat.toFixed(6)},${points[0].lng.toFixed(6)}`;
  }

  let routePoints = points;
  if (points.length > 10) {
    const step = (points.length - 1) / 9;
    routePoints = Array.from({ length: 10 }, (_, idx) =>
      idx === 9 ? points[points.length - 1] : points[Math.round(idx * step)]
    );
  }

  const origin = `${routePoints[0].lat.toFixed(6)},${routePoints[0].lng.toFixed(6)}`;
  const destination = `${routePoints[routePoints.length - 1].lat.toFixed(6)},${routePoints[routePoints.length - 1].lng.toFixed(6)}`;
  const waypoints = routePoints
    .slice(1, -1)
    .map((p) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`)
    .join('|');

  const params = new URLSearchParams({
    api: '1',
    origin,
    destination,
    travelmode: 'driving',
  });
  if (waypoints) {
    params.set('waypoints', waypoints);
  }
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export function haversineDistanceKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng;
  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function buildBackupPayload() {
  return {
    exportedAt: new Date().toISOString(),
    sellerName: localStorage.getItem(STORAGE_KEYS.SELLER_NAME) || '',
    reports: loadAllReportsByDate().map((entry) => entry.report),
  };
}

export function restoreReportEntriesFromJson(rawJson: string): {
  restoredDates: string[];
  sellerNameUpdated: boolean;
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    throw new Error('Ficheiro JSON inválido ou corrompido.');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Estrutura de backup não reconhecida.');
  }

  const obj = parsed as {
    date?: unknown;
    sellerName?: unknown;
    visits?: unknown;
    dailyManagerComments?: unknown;
    reports?: unknown;
  };

  const candidates: Array<{
    date: string;
    sellerName?: string;
    visits: Visit[];
    dailyManagerComments?: SupportComment[];
  }> = [];

  if (Array.isArray(obj.reports)) {
    for (const rep of obj.reports) {
      if (
        rep &&
        typeof rep === 'object' &&
        typeof (rep as DailyReport).date === 'string' &&
        /^\d{4}-\d{2}-\d{2}$/.test((rep as DailyReport).date) &&
        Array.isArray((rep as DailyReport).visits)
      ) {
        const typed = rep as DailyReport;
        candidates.push({
          date: typed.date,
          sellerName: typeof typed.sellerName === 'string' ? typed.sellerName : undefined,
          visits: typed.visits,
          dailyManagerComments: Array.isArray(typed.dailyManagerComments)
            ? typed.dailyManagerComments
            : [],
        });
      }
    }
  } else if (
    typeof obj.date === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(obj.date) &&
    Array.isArray(obj.visits)
  ) {
    candidates.push({
      date: obj.date,
      sellerName: typeof obj.sellerName === 'string' ? obj.sellerName : undefined,
      visits: obj.visits as Visit[],
      dailyManagerComments: Array.isArray(obj.dailyManagerComments)
        ? (obj.dailyManagerComments as SupportComment[])
        : [],
    });
  }

  if (candidates.length === 0) {
    throw new Error('Nenhum relatório válido encontrado no ficheiro seleccionado.');
  }

  let sellerNameUpdated = false;
  if (
    typeof obj.sellerName === 'string' &&
    obj.sellerName.trim() &&
    !localStorage.getItem(STORAGE_KEYS.SELLER_NAME)
  ) {
    localStorage.setItem(STORAGE_KEYS.SELLER_NAME, obj.sellerName.trim());
    sellerNameUpdated = true;
  }

  const restoredDates: string[] = [];
  for (const item of candidates) {
    const normalized = normalizeVisitsLength(item.visits);
    const result = saveDailyReport(item.date, normalized, item.dailyManagerComments);
    if (!result.ok) {
      throw new Error(result.error || 'Memória local insuficiente para concluir o restauro.');
    }
    restoredDates.push(item.date);
  }

  return { restoredDates, sellerNameUpdated };
}

const DEMO_COMPANIES: Array<{
  company: string;
  contactName: string;
  contactPhone: string;
  description: string;
  problem: string;
  feedback: string;
  probability: ProbabilityLevel;
  nextAction: NextActionOption;
  isLocked: boolean;
  latitude: number;
  longitude: number;
}> = [
  {
    company: 'Distribuidora Maputo Sul, Lda',
    contactName: 'Carlos Tembe',
    contactPhone: '84 312 4401',
    description: 'Armazenista de produtos alimentares com 3 armazéns na Matola.',
    problem: 'Rupturas de stock frequentes e controlo manual em várias folhas Excel.',
    feedback: 'Director interessado em ver dados diários de margem e stock no telemóvel.',
    probability: 'Muito maior',
    nextAction: 'Apresentar proposta',
    isLocked: true,
    latitude: -25.969248,
    longitude: 32.573174,
  },
  {
    company: 'Farmácia Central da Baixa',
    contactName: 'Dra. Helena Cossa',
    contactPhone: '82 409 1180',
    description: 'Rede com 2 balcões de atendimento e alto volume de facturas diárias.',
    problem: 'Dificuldade em conciliar caixa entre turnos e identificar produtos sem rotação.',
    feedback: 'Pediu demonstração rápida com dados semelhantes aos da farmácia.',
    probability: 'Maior',
    nextAction: 'Nova visita',
    isLocked: true,
    latitude: -25.974612,
    longitude: 32.571218,
  },
  {
    company: 'Ferragens & Construção Zimpeto',
    contactName: 'Armando Sitoe',
    contactPhone: '84 778 9023',
    description: 'Loja de materiais de construção com equipa de 14 funcionários.',
    problem: 'Despesas operacionais dispersas e falta de visibilidade do lucro real semanal.',
    feedback: 'Receia complexidade técnica para a equipa administrativa.',
    probability: 'Neutra',
    nextAction: 'Ligação',
    isLocked: true,
    latitude: -25.86214,
    longitude: 32.58391,
  },
  {
    company: 'Padaria & Pastelaria Polana',
    contactName: 'Sofia Mondlane',
    contactPhone: '86 551 3340',
    description: 'Unidade de fabrico e venda directa com entregas a hotéis locais.',
    problem: 'Desperdício de matéria-prima e atrasos no fecho de contas mensais.',
    feedback: 'Sócio-gerente quer iniciar com um piloto de vendas e compras.',
    probability: 'Muito maior',
    nextAction: 'Encerramento',
    isLocked: true,
    latitude: -25.96581,
    longitude: 32.59245,
  },
  {
    company: 'Auto Peças Avenida 24 de Julho',
    contactName: 'Rui Nhantumbo',
    contactPhone: '84 220 7156',
    description: 'Comércio de peças automóveis importadas com mais de 4.000 referências.',
    problem: 'Stock empatado em peças antigas e encomendas urgentes sem previsão.',
    feedback: 'Solicitou orçamento formal após validação com o contabilista.',
    probability: 'Maior',
    nextAction: 'Apresentar proposta',
    isLocked: true,
    latitude: -25.96123,
    longitude: 32.57862,
  },
  {
    company: 'Agro-Comercial Boane',
    contactName: 'Mateus Chissano',
    contactPhone: '87 610 2295',
    description: 'Fornecedor de insumos agrícolas e rações para produtores locais.',
    problem: 'Registo de vendas a crédito disperso entre cadernos e folhas soltas.',
    feedback: 'Preocupação com o investimento inicial nesta época do ano.',
    probability: 'Baixa',
    nextAction: 'Ligação',
    isLocked: false,
    latitude: -26.04195,
    longitude: 32.32914,
  },
];

export function generateDemoHistoricalReports(): number {
  const year = new Date().getFullYear();
  const sellerName = localStorage.getItem(STORAGE_KEYS.SELLER_NAME) || 'Equipa Comercial BI';
  const todayISO = getTodayISO();
  let createdCount = 0;

  const currentMonth = new Date().getMonth() + 1;
  const candidateMonths = Array.from({ length: currentMonth }, (_, idx) => idx + 1);

  candidateMonths.forEach((month, mIdx) => {
    const daysInSample = [4, 12, 21];
    daysInSample.forEach((day, dIdx) => {
      const mm = String(month).padStart(2, '0');
      const dd = String(day).padStart(2, '0');
      const dateISO = `${year}-${mm}-${dd}`;

      if (dateISO >= todayISO) return;
      const key = STORAGE_KEYS.REPORTS_PREFIX + dateISO;
      if (localStorage.getItem(key)) return;

      const visits = createEmptyVisitsArray();
      const fillTotal = 3 + ((mIdx + dIdx) % 5);

      for (let i = 0; i < fillTotal; i++) {
        const template = DEMO_COMPANIES[(mIdx + dIdx + i) % DEMO_COMPANIES.length];
        visits[i] = {
          ...visits[i],
          company: template.company,
          contactName: template.contactName,
          contactPhone: template.contactPhone,
          description: template.description,
          location: formatGoogleMapsPointUrl(template.latitude, template.longitude),
          latitude: template.latitude,
          longitude: template.longitude,
          problem: template.problem,
          feedback: template.feedback,
          probability: template.probability,
          nextAction: template.nextAction,
          isLocked: template.isLocked,
          updatedAt: `${dateISO}T16:30:00.000Z`,
        };
      }

      const payload: DailyReport = {
        date: dateISO,
        sellerName,
        lastUpdated: new Date().toISOString(),
        isDemo: true,
        visits,
      };
      try {
        localStorage.setItem(key, JSON.stringify(payload));
        createdCount += 1;
      } catch {
        // Stop gracefully if localStorage quota is full
      }
    });
  });

  return createdCount;
}

export function clearDemoHistoricalReports(): number {
  let removed = 0;
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith(STORAGE_KEYS.REPORTS_PREFIX)) continue;
    const raw = localStorage.getItem(key);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as DailyReport;
      if (parsed.isDemo === true) {
        keysToRemove.push(key);
      }
    } catch {
      // Ignore
    }
  }
  keysToRemove.forEach((key) => {
    localStorage.removeItem(key);
    removed += 1;
  });
  return removed;
}
