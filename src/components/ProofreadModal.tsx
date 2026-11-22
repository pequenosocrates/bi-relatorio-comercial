import { Check, Sparkles } from 'lucide-react';
import type { ProofreadResult } from '../types/report';

interface ProofreadModalProps {
  isOpen: boolean;
  original: ProofreadResult;
  corrected: ProofreadResult | null;
  onApply: () => void;
  onCancel: () => void;
}

export function ProofreadModal({
  isOpen,
  original,
  corrected,
  onApply,
  onCancel,
}: ProofreadModalProps) {
  if (!isOpen || !corrected) return null;

  const sections: Array<{ key: keyof ProofreadResult; label: string }> = [
    { key: 'description', label: '02. Descrição' },
    { key: 'problem', label: '04. Problema' },
    { key: 'feedback', label: '05. Feedback do cliente' },
  ];

  const visibleSections = sections.filter(
    (s) => original[s.key].trim().length > 0 || corrected[s.key].trim().length > 0
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-brand-950/65 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="proofread-modal-title"
    >
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-sky-100 text-brand-cyan flex items-center justify-center shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h3 id="proofread-modal-title" className="text-base sm:text-lg font-extrabold text-brand-900">
              Revisão Ortográfica (PT-PT pré-1990)
            </h3>
            <p className="text-xs text-slate-500">
              Compare o texto original com a proposta corrigida antes de aplicar.
            </p>
          </div>
        </div>

        <div className="p-5 sm:p-6 overflow-y-auto space-y-4">
          {visibleSections.map((sec) => (
            <div key={sec.key} className="space-y-2 pb-4 border-b border-slate-100 last:border-b-0 last:pb-0">
              <p className="text-xs font-extrabold text-brand-900">{sec.label}</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="block text-[11px] font-bold text-slate-500 mb-1">
                    Original
                  </span>
                  <p className="text-xs sm:text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                    {original[sec.key] || '---'}
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-sky-50/70 border border-sky-200">
                  <span className="block text-[11px] font-bold text-brand-cyan mb-1">
                    Corrigido (PT-PT pré-1990)
                  </span>
                  <p className="text-xs sm:text-sm text-brand-950 font-medium whitespace-pre-wrap leading-relaxed">
                    {corrected[sec.key] || '---'}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 bg-brand-surface flex flex-col-reverse sm:flex-row justify-end gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            className="w-full sm:w-auto min-h-[44px] px-5 py-2.5 rounded-xl font-semibold text-sm text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 transition"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onApply}
            className="w-full sm:w-auto min-h-[44px] px-5 py-2.5 rounded-xl font-extrabold text-sm text-brand-950 bg-brand-gold hover:bg-brand-goldHover transition shadow-sm flex items-center justify-center gap-2"
          >
            <Check className="w-4 h-4" />
            <span>Aplicar Correcção</span>
          </button>
        </div>
      </div>
    </div>
  );
}
