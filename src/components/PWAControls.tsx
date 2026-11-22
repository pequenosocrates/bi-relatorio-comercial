import { Download, Smartphone, WifiOff } from 'lucide-react';
import { useState } from 'react';
import { useOnlineStatus, usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  compact?: boolean;
}

export function PWAInstallButton({ compact = false }: PWAInstallButtonProps) {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) return null;

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className={
          compact
            ? 'min-h-[38px] px-3 py-1.5 rounded-xl bg-brand-gold hover:bg-brand-goldHover text-brand-950 text-xs font-extrabold transition flex items-center gap-1.5 whitespace-nowrap shrink-0'
            : 'w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-brand-900 hover:bg-brand-800 text-white text-sm font-bold transition flex items-center justify-center gap-2'
        }
      >
        <Download className="w-4 h-4 shrink-0" />
        <span>Instalar App</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className={
            compact
              ? 'min-h-[38px] px-3 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap shrink-0'
              : 'w-full min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-brand-900 text-sm font-bold transition flex items-center justify-center gap-2'
          }
        >
          <Smartphone className="w-4 h-4 shrink-0" />
          <span>Instalar no iOS</span>
        </button>

        {showIOSGuide && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-brand-950/65 backdrop-blur-xs p-4"
            role="dialog"
            aria-modal="true"
          >
            <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl border border-slate-200">
              <h3 className="text-lg font-extrabold text-brand-900">
                Instalar no iPhone / iPad
              </h3>
              <p className="mt-2.5 text-sm text-slate-600 leading-relaxed">
                1. Toque no ícone <strong>Partilhar</strong> na barra do Safari.
                <br />
                2. Deslize e seleccione <strong>Adicionar ao Ecrã Principal</strong>.
              </p>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 w-full min-h-[44px] rounded-xl bg-brand-gold hover:bg-brand-goldHover py-2.5 text-sm font-bold text-brand-950 transition"
              >
                Fechar
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
}

export function OfflineBanner() {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      className="bg-amber-50 border-b border-amber-200 text-amber-900 text-xs font-semibold px-4 py-2 print:hidden"
      role="status"
    >
      <div className="max-w-6xl mx-auto flex items-center justify-center gap-2">
        <WifiOff className="w-3.5 h-3.5 text-amber-700 shrink-0" />
        <span>
          Modo Offline — Os dados continuam a ser guardados com segurança neste dispositivo.
        </span>
      </div>
    </div>
  );
}
