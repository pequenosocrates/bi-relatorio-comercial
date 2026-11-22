import { AlertCircle, CheckCircle2, Info } from 'lucide-react';
import type { ToastItem } from '../types/report';

interface ToastContainerProps {
  toasts: ToastItem[];
}

export function ToastContainer({ toasts }: ToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 pointer-events-none flex flex-col gap-2 w-11/12 max-w-sm"
      aria-live="polite"
    >
      {toasts.map((toast) => {
        const styleClass =
          toast.type === 'success'
            ? 'bg-emerald-900 text-white border-emerald-700'
            : toast.type === 'error'
              ? 'bg-red-900 text-white border-red-700'
              : 'bg-brand-900 text-white border-brand-cyan';

        return (
          <div
            key={toast.id}
            className={`px-4 py-3 rounded-xl shadow-xl border text-xs sm:text-sm font-semibold flex items-center gap-2.5 transition-all ${styleClass}`}
          >
            {toast.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
            {toast.type === 'error' && <AlertCircle className="w-4 h-4 text-red-300 shrink-0" />}
            {toast.type === 'info' && <Info className="w-4 h-4 text-brand-gold shrink-0" />}
            <span>{toast.message}</span>
          </div>
        );
      })}
    </div>
  );
}
