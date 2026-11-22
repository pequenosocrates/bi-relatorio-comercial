import { AlertTriangle, Check, Copy, Info, LockOpen, MessageCircle, Power } from 'lucide-react';
import { useState } from 'react';
import type { ModalConfig } from '../types/report';

interface ConfirmModalProps {
  modal: ModalConfig | null;
  onClose: () => void;
  onToast: (message: string, type: 'success' | 'info' | 'error') => void;
}

export function ConfirmModal({ modal, onClose, onToast }: ConfirmModalProps) {
  const [copied, setCopied] = useState(false);

  if (!modal) return null;

  const variant = modal.variant ?? 'info';

  const iconWrapClass =
    variant === 'danger'
      ? 'bg-red-100 text-red-600'
      : variant === 'warning'
        ? 'bg-amber-100 text-amber-700'
        : variant === 'whatsapp'
          ? 'bg-emerald-100 text-emerald-700'
          : 'bg-sky-100 text-brand-cyan';

  const renderIcon = () => {
    if (variant === 'danger') {
      return modal.title.toLowerCase().includes('sessão') ? (
        <Power className="w-5 h-5" />
      ) : (
        <AlertTriangle className="w-5 h-5" />
      );
    }
    if (variant === 'warning') return <LockOpen className="w-5 h-5" />;
    if (variant === 'whatsapp') return <MessageCircle className="w-5 h-5" />;
    return <Info className="w-5 h-5" />;
  };

  const handleCopy = async () => {
    if (!modal.copyText) return;
    try {
      await navigator.clipboard.writeText(modal.copyText);
      setCopied(true);
      onToast('Texto do relatório copiado para a área de transferência.', 'success');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      onToast('Não foi possível copiar automaticamente.', 'error');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-brand-950/65 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 border border-slate-200">
        <div className="flex items-center gap-3 mb-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${iconWrapClass}`}>
            {renderIcon()}
          </div>
          <h3 id="modal-title" className="text-lg font-bold text-brand-900 leading-tight">
            {modal.title}
          </h3>
        </div>

        <p className="text-slate-600 text-sm leading-relaxed mb-5">{modal.message}</p>

        {modal.copyText && (
          <div className="mb-5">
            <div className="max-h-36 overflow-y-auto rounded-xl bg-brand-surface border border-slate-200 p-3 text-xs text-slate-700 whitespace-pre-wrap font-mono">
              {modal.copyText}
            </div>
          </div>
        )}

        <div className="flex flex-col-reverse sm:flex-row gap-2.5 justify-end">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto min-h-[44px] px-4 py-2.5 rounded-xl font-semibold text-sm text-slate-700 bg-slate-100 hover:bg-slate-200 active:scale-[0.99] transition whitespace-nowrap"
          >
            {modal.cancelText || 'Cancelar'}
          </button>

          {modal.copyText && (
            <button
              type="button"
              onClick={handleCopy}
              className="w-full sm:w-auto min-h-[44px] px-4 py-2.5 rounded-xl font-semibold text-sm text-brand-900 bg-sky-50 hover:bg-sky-100 border border-sky-200 active:scale-[0.99] transition flex items-center justify-center gap-2 whitespace-nowrap"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
              <span>{copied ? 'Copiado' : 'Copiar texto'}</span>
            </button>
          )}

          {modal.externalHref ? (
            <a
              href={modal.externalHref}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onClose}
              className="w-full sm:w-auto min-h-[44px] px-5 py-2.5 rounded-xl font-bold text-sm text-white bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] transition shadow-sm flex items-center justify-center gap-2 whitespace-nowrap"
            >
              <MessageCircle className="w-4 h-4" />
              <span>{modal.confirmText}</span>
            </a>
          ) : (
            <button
              type="button"
              onClick={() => {
                onClose();
                modal.onConfirm?.();
              }}
              className={`w-full sm:w-auto min-h-[44px] px-5 py-2.5 rounded-xl font-bold text-sm active:scale-[0.99] transition shadow-sm whitespace-nowrap ${
                variant === 'danger'
                  ? 'bg-red-600 hover:bg-red-700 text-white'
                  : 'bg-brand-gold hover:bg-brand-goldHover text-brand-950'
              }`}
            >
              {modal.confirmText}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
