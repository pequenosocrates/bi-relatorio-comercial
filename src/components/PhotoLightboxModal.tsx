import { X } from 'lucide-react';
import type { VisitPhoto } from '../types/report';
import { isSafeImageDataUrl } from '../utils/photo';

interface PhotoLightboxModalProps {
  photo: VisitPhoto | null;
  caption?: string;
  onClose: () => void;
}

export function PhotoLightboxModal({ photo, caption, onClose }: PhotoLightboxModalProps) {
  if (!photo || !isSafeImageDataUrl(photo.dataUrl)) return null;

  const timeStr = (() => {
    try {
      return new Date(photo.createdAt).toLocaleString('pt-PT', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '';
    }
  })();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-brand-950/85 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Visualização ampliada da fotografia"
      onClick={onClose}
    >
      <div
        className="relative max-w-3xl w-full bg-white rounded-2xl overflow-hidden shadow-2xl border border-white/20"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 bg-brand-900 text-white flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs sm:text-sm font-bold truncate">
              {caption || 'Evidência Fotográfica do Local'}
            </p>
            {timeStr && (
              <p className="text-[11px] text-sky-200 font-mono tabular-nums">{timeStr}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar ampliação"
            className="min-w-[36px] min-h-[36px] rounded-xl bg-white/15 hover:bg-white/25 text-white flex items-center justify-center transition shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="bg-slate-950 flex items-center justify-center max-h-[75vh] overflow-hidden p-2">
          <img
            src={photo.dataUrl}
            alt={caption || 'Fotografia do local'}
            className="max-h-[70vh] w-auto object-contain rounded-lg"
          />
        </div>
      </div>
    </div>
  );
}
