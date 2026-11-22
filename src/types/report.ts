export type UserRole = 'seller' | 'admin';

export type ProbabilityLevel =
  | ''
  | 'Muito baixa'
  | 'Baixa'
  | 'Neutra'
  | 'Maior'
  | 'Muito maior';

export type NextActionOption =
  | ''
  | 'Ligação'
  | 'Nova visita'
  | 'Apresentar proposta'
  | 'Encerramento'
  | 'Outro';

export interface ClientAiAnalysis {
  diagnosticoRapido: string;
  propostaValorBi: string;
  argumentoObjeccoes: string;
  proximoPassoRecomendado: string;
  generatedAt: string;
}

export interface ProofreadResult {
  description: string;
  problem: string;
  feedback: string;
}

export interface VisitPhoto {
  id: string;
  dataUrl: string;
  width: number;
  height: number;
  createdAt: string;
}

export interface SupportComment {
  id: string;
  authorName: string;
  authorRole: UserRole;
  message: string;
  createdAt: string;
}

export interface Visit {
  id: number;
  company: string;
  contactName?: string;
  contactPhone?: string;
  description: string;
  location: string;
  latitude?: number;
  longitude?: number;
  problem: string;
  feedback: string;
  probability: ProbabilityLevel;
  nextAction: NextActionOption;
  otherAction: string;
  isLocked: boolean;
  updatedAt: string | null;
  aiAnalysis?: ClientAiAnalysis;
  photos?: VisitPhoto[];
  managerComments?: SupportComment[];
}

export interface CloudSyncMetadata {
  date: string;
  mode: 'google_drive' | 'local_contingency';
  email: string | null;
  fileName: string;
  fileId?: string;
  webViewLink?: string;
  syncedAt: string;
  visitsCount: number;
}

export interface DailyReport {
  date: string;
  sellerName: string;
  lastUpdated: string;
  isDemo?: boolean;
  visits: Visit[];
  dailyManagerComments?: SupportComment[];
}

export type ViewName = 'dashboard' | 'visit' | 'summary' | 'analytics' | 'settings' | 'admin';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
}

export type ModalVariant = 'info' | 'warning' | 'danger' | 'whatsapp';

export interface ModalConfig {
  title: string;
  message: string;
  confirmText: string;
  cancelText?: string;
  variant?: ModalVariant;
  externalHref?: string;
  copyText?: string;
  onConfirm?: () => void;
}
