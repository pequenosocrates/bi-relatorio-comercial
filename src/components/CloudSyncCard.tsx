import {
  CheckCircle2,
  Cloud,
  CloudDownload,
  CloudOff,
  Download,
  ExternalLink,
  FileSpreadsheet,
  HardDrive,
  Loader2,
  LogOut,
  Mail,
  RefreshCw,
  UploadCloud,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import type { CloudSyncMetadata, ModalConfig, ToastType, Visit } from '../types/report';
import {
  checkDriveReportStatus,
  downloadSingleReportJson,
  getCloudSyncMetadata,
  getInMemoryAccessToken,
  listDriveReports,
  restoreDriveReportFile,
  saveLocalContingencySync,
  signInWithGoogleDrive,
  signOutGoogleDrive,
  uploadExcelToGoogleDrive,
  uploadReportToGoogleDrive,
  type DriveReportSummary,
  type GoogleAuthSnapshot,
} from '../utils/driveSync';
import { buildVisitsExcelBlob } from '../utils/export';
import { formatDatePT, getRecordedVisits } from '../utils/storage';

interface CloudSyncCardProps {
  activeDateISO: string;
  visits: Visit[];
  sellerName: string;
  authSnapshot: GoogleAuthSnapshot;
  onAuthSnapshotChange: (snapshot: GoogleAuthSnapshot) => void;
  onRequestConfirmModal: (config: ModalConfig) => void;
  onReportsRestored?: (dates: string[]) => void;
  onToast: (message: string, type: ToastType) => void;
  compact?: boolean;
}

export function CloudSyncCard({
  activeDateISO,
  visits,
  sellerName,
  authSnapshot,
  onAuthSnapshotChange,
  onRequestConfirmModal,
  onReportsRestored,
  onToast,
  compact = false,
}: CloudSyncCardProps) {
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isUploadingExcel, setIsUploadingExcel] = useState(false);
  const [loadingDriveList, setLoadingDriveList] = useState(false);
  const [restoringFileId, setRestoringFileId] = useState<string | null>(null);
  const [driveFiles, setDriveFiles] = useState<DriveReportSummary[] | null>(null);
  const [syncMeta, setSyncMeta] = useState<CloudSyncMetadata | null>(() =>
    getCloudSyncMetadata(activeDateISO)
  );

  useEffect(() => {
    setSyncMeta(getCloudSyncMetadata(activeDateISO));
  }, [activeDateISO]);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const recordedCount = getRecordedVisits(visits).length;
  const isGoogleReady = Boolean(authSnapshot.email && authSnapshot.hasAccessToken && isOnline);

  const handleGoogleSignIn = async () => {
    if (!isOnline) {
      onToast(
        'Sem ligação à Internet. Utilize o modo de contingência local e sincronize mais tarde.',
        'info'
      );
      return;
    }

    setIsSigningIn(true);
    try {
      const next = await signInWithGoogleDrive();
      onAuthSnapshotChange(next);
      onToast(
        next.email
          ? `Conta Google ligada: ${next.email}`
          : 'Conta Google ligada ao Google Drive!',
        'success'
      );
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Não foi possível concluir o início de sessão com o Google.';
      onToast(msg, 'error');
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleGoogleSignOut = async () => {
    await signOutGoogleDrive();
    setDriveFiles(null);
    onAuthSnapshotChange({
      user: null,
      email: null,
      hasAccessToken: false,
      isConfigured: authSnapshot.isConfigured,
    });
    onToast('Conta Google desligada. Os relatórios locais mantêm-se guardados.', 'info');
  };

  const executeDriveUpload = async (params: {
    accessToken: string;
    folderId: string;
    fileName: string;
    existingFileId: string | null;
  }) => {
    setIsSyncing(true);
    try {
      const result = await uploadReportToGoogleDrive({
        dateISO: activeDateISO,
        visits,
        sellerName,
        email: authSnapshot.email,
        accessToken: params.accessToken,
        folderId: params.folderId,
        fileName: params.fileName,
        existingFileId: params.existingFileId,
      });
      setSyncMeta(result);
      onToast(`Relatório guardado no Google Drive (${result.fileName})!`, 'success');
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Falha ao guardar no Google Drive. Os dados locais continuam intactos.';
      onToast(msg, 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSyncToDrive = async () => {
    if (recordedCount === 0) {
      onToast('Registe pelo menos uma visita antes de guardar na nuvem.', 'error');
      return;
    }

    const token = getInMemoryAccessToken();
    if (!isOnline || !authSnapshot.email || !token) {
      const meta = saveLocalContingencySync({
        dateISO: activeDateISO,
        visits,
        sellerName,
        email: authSnapshot.email,
      });
      setSyncMeta(meta);
      onToast(
        !isOnline
          ? 'Sem Internet: cópia preparada em contingência local.'
          : 'Sessão Google não activa: cópia guardada em contingência local.',
        'info'
      );
      return;
    }

    setIsSyncing(true);
    try {
      const status = await checkDriveReportStatus(activeDateISO, token);
      if (status.existingFileId) {
        setIsSyncing(false);
        onRequestConfirmModal({
          title: 'Substituir Ficheiro no Google Drive?',
          message: `Já existe o ficheiro "${status.fileName}" na pasta "BI - Relatorios Comerciais" do Google Drive (${authSnapshot.email}). Deseja actualizá-lo com os dados actuais?`,
          confirmText: 'Sim, actualizar ficheiro',
          cancelText: 'Cancelar',
          variant: 'warning',
          onConfirm: () => {
            void executeDriveUpload({
              accessToken: token,
              folderId: status.folderId,
              fileName: status.fileName,
              existingFileId: status.existingFileId,
            });
          },
        });
        return;
      }

      await executeDriveUpload({
        accessToken: token,
        folderId: status.folderId,
        fileName: status.fileName,
        existingFileId: null,
      });
    } catch (err) {
      setIsSyncing(false);
      const msg =
        err instanceof Error ? err.message : 'Erro ao verificar pasta no Google Drive.';
      onToast(msg, 'error');
    }
  };

  const handleUploadExcelToDrive = async () => {
    if (recordedCount === 0) {
      onToast('Registe pelo menos uma visita antes de enviar o Excel para o Drive.', 'error');
      return;
    }
    const token = getInMemoryAccessToken();
    if (!isOnline || !token) {
      onToast('Inicie sessão com o Google (online) para enviar o Excel ao Drive.', 'info');
      return;
    }

    setIsUploadingExcel(true);
    try {
      const built = await buildVisitsExcelBlob(visits, activeDateISO);
      if (!built) return;
      const uploaded = await uploadExcelToGoogleDrive({
        blob: built.blob,
        fileName: built.fileName,
        accessToken: token,
      });
      onToast(`Excel "${uploaded.name}" enviado para o Google Drive!`, 'success');
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Falha ao enviar o ficheiro Excel para o Google Drive.';
      onToast(msg, 'error');
    } finally {
      setIsUploadingExcel(false);
    }
  };

  const handleLoadDriveList = async () => {
    const token = getInMemoryAccessToken();
    if (!isOnline || !token) {
      onToast('Ligue a conta Google para consultar os relatórios na nuvem.', 'info');
      return;
    }
    setLoadingDriveList(true);
    try {
      const files = await listDriveReports(token);
      setDriveFiles(files);
      if (files.length === 0) {
        onToast('Ainda não existem relatórios guardados na pasta do Drive.', 'info');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao consultar o Google Drive.';
      onToast(msg, 'error');
    } finally {
      setLoadingDriveList(false);
    }
  };

  const handleRestoreFromDrive = (file: DriveReportSummary) => {
    const token = getInMemoryAccessToken();
    if (!token) return;

    onRequestConfirmModal({
      title: 'Restaurar Relatório do Google Drive?',
      message: `Deseja importar "${file.name}" para o armazenamento local deste dispositivo? Se já existir um relatório local para essa data, será substituído pela cópia do Drive.`,
      confirmText: 'Restaurar para o dispositivo',
      cancelText: 'Cancelar',
      variant: 'warning',
      onConfirm: () => {
        void (async () => {
          setRestoringFileId(file.id);
          try {
            const result = await restoreDriveReportFile(file.id, token);
            onReportsRestored?.(result.restoredDates);
            onToast(
              `Relatório restaurado (${result.restoredDates.map(formatDatePT).join(', ')})!`,
              'success'
            );
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'Falha ao restaurar ficheiro do Drive.';
            onToast(msg, 'error');
          } finally {
            setRestoringFileId(null);
          }
        })();
      },
    });
  };

  const handleSaveContingency = () => {
    if (recordedCount === 0) {
      onToast('Registe pelo menos uma visita antes de preparar a cópia.', 'error');
      return;
    }
    const meta = saveLocalContingencySync({
      dateISO: activeDateISO,
      visits,
      sellerName,
      email: authSnapshot.email,
    });
    setSyncMeta(meta);
    onToast(
      'Cópia de contingência guardada localmente. Poderá enviar para o Google Drive quando estiver ligado.',
      'success'
    );
  };

  const formattedSyncTime = syncMeta?.syncedAt
    ? new Date(syncMeta.syncedAt).toLocaleString('pt-PT', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  return (
    <section className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-brand-cyan flex items-center gap-1.5">
            <Cloud className="w-3.5 h-3.5" />
            <span>Nuvem · Google Drive &amp; Contingência Offline-First</span>
          </p>
          <h3 className="text-base sm:text-lg font-extrabold text-brand-900 mt-0.5">
            Cópia de Segurança na Nuvem
          </h3>
        </div>

        {/* Status Indicator */}
        <div
          className={`px-3 py-1.5 rounded-xl border text-xs font-bold inline-flex items-center gap-1.5 self-start ${
            isGoogleReady
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-brand-surface border-slate-200 text-slate-700'
          }`}
        >
          {isGoogleReady ? (
            <>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>Google Drive Ligado</span>
            </>
          ) : !isOnline ? (
            <>
              <CloudOff className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span>Offline · Modo Local</span>
            </>
          ) : (
            <>
              <HardDrive className="w-3.5 h-3.5 text-brand-cyan shrink-0" />
              <span>Modo Local / Contingência</span>
            </>
          )}
        </div>
      </div>

      {/* Associated Email / Offline Info */}
      <div className="rounded-xl bg-brand-surface border border-slate-200 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <Mail className="w-4 h-4 text-brand-cyan shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-xs font-bold text-brand-900 truncate">
              {authSnapshot.email
                ? `E-mail associado: ${authSnapshot.email}`
                : 'Nenhuma conta Google associada'}
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {authSnapshot.email && !authSnapshot.hasAccessToken
                ? 'Sessão recarregada: volte a clicar no botão Google abaixo para renovar o envio ao Drive.'
                : authSnapshot.email
                  ? 'Os relatórios são guardados na sua pasta privada "BI - Relatorios Comerciais".'
                  : 'Todos os registos ficam imediatamente seguros no dispositivo mesmo sem rede.'}
            </p>
          </div>
        </div>

        {authSnapshot.email && (
          <button
            type="button"
            onClick={handleGoogleSignOut}
            className="min-h-[36px] px-3 py-1.5 rounded-lg bg-white hover:bg-red-50 text-slate-700 hover:text-red-700 border border-slate-200 text-xs font-bold inline-flex items-center gap-1.5 shrink-0 self-start sm:self-center transition"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Desligar</span>
          </button>
        )}
      </div>

      {/* Official Sign in with Google Button when token is not active */}
      {(!authSnapshot.email || !authSnapshot.hasAccessToken) && authSnapshot.isConfigured && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <button
            type="button"
            disabled={isSigningIn || !isOnline}
            onClick={handleGoogleSignIn}
            className="min-h-[44px] px-4 py-2.5 rounded-xl bg-white hover:bg-slate-50 text-[#1F1F1F] border border-[#747775]/40 shadow-xs font-semibold text-sm inline-flex items-center justify-center gap-3 transition disabled:opacity-50"
          >
            {isSigningIn ? (
              <Loader2 className="w-4 h-4 animate-spin text-brand-cyan" />
            ) : (
              <svg
                version="1.1"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 48 48"
                className="w-5 h-5 shrink-0"
                aria-hidden="true"
              >
                <path
                  fill="#EA4335"
                  d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                />
                <path
                  fill="#4285F4"
                  d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                />
                <path
                  fill="#FBBC05"
                  d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                />
                <path
                  fill="#34A853"
                  d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                />
              </svg>
            )}
            <span>
              {authSnapshot.email
                ? 'Renovar sessão com o Google'
                : 'Iniciar sessão com o Google'}
            </span>
          </button>

          {!compact && (
            <span className="text-xs text-slate-500">
              Associa o seu e-mail Google e permite guardar/restaurar relatórios directamente no seu Drive.
            </span>
          )}
        </div>
      )}

      {/* Action Buttons */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <button
          type="button"
          disabled={isSyncing}
          onClick={isGoogleReady ? handleSyncToDrive : handleSaveContingency}
          className={`w-full min-h-[44px] py-3 px-4 rounded-xl font-bold text-sm transition flex items-center justify-center gap-2 disabled:opacity-60 ${
            isGoogleReady
              ? 'bg-brand-900 hover:bg-brand-800 text-white shadow-sm'
              : 'bg-sky-50 hover:bg-sky-100 text-brand-900 border border-sky-200'
          }`}
        >
          {isSyncing ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <UploadCloud className="w-4 h-4 shrink-0" />
          )}
          <span>
            {isGoogleReady
              ? `Guardar no Google Drive (${formatDatePT(activeDateISO)})`
              : 'Guardar em Contingência Local'}
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            if (recordedCount === 0) {
              onToast('Registe pelo menos uma visita antes de descarregar o ficheiro.', 'error');
              return;
            }
            downloadSingleReportJson(activeDateISO, visits, sellerName, authSnapshot.email);
            onToast('Ficheiro JSON estruturado descarregado!', 'success');
          }}
          className="w-full min-h-[44px] py-3 px-4 rounded-xl border border-slate-200 hover:border-brand-900/30 bg-white text-brand-900 font-bold text-sm transition flex items-center justify-center gap-2"
        >
          <Download className="w-4 h-4 text-brand-cyan shrink-0" />
          <span>Descarregar JSON Estruturado</span>
        </button>
      </div>

      {/* Extra Drive actions when connected: Upload Excel + Restore from Drive */}
      {isGoogleReady && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <button
            type="button"
            disabled={isUploadingExcel}
            onClick={handleUploadExcelToDrive}
            className="w-full min-h-[40px] py-2 px-3 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200 font-bold text-xs transition flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {isUploadingExcel ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
            )}
            <span>Guardar Excel (.xlsx) no Drive</span>
          </button>

          <button
            type="button"
            disabled={loadingDriveList}
            onClick={handleLoadDriveList}
            className="w-full min-h-[40px] py-2 px-3 rounded-xl bg-brand-surface hover:bg-sky-100 text-brand-900 border border-slate-200 font-bold text-xs transition flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {loadingDriveList ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-cyan" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5 text-brand-cyan shrink-0" />
            )}
            <span>Listar &amp; Restaurar do Drive</span>
          </button>
        </div>
      )}

      {/* Drive File Restore List */}
      {driveFiles && driveFiles.length > 0 && (
        <div className="rounded-xl border border-sky-200 bg-brand-surface p-3 space-y-2">
          <p className="text-xs font-extrabold text-brand-900">
            Relatórios disponíveis no seu Google Drive:
          </p>
          <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
            {driveFiles.map((file) => (
              <div
                key={file.id}
                className="flex items-center justify-between gap-2 bg-white rounded-lg border border-slate-200 px-3 py-2 text-xs"
              >
                <span className="font-mono font-semibold text-brand-900 truncate">
                  {file.name}
                </span>
                <button
                  type="button"
                  disabled={restoringFileId === file.id}
                  onClick={() => handleRestoreFromDrive(file)}
                  className="shrink-0 min-h-[30px] px-2.5 py-1 rounded-lg bg-sky-50 hover:bg-sky-100 text-brand-cyan font-bold inline-flex items-center gap-1 border border-sky-200 disabled:opacity-50"
                >
                  {restoringFileId === file.id ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <CloudDownload className="w-3 h-3" />
                  )}
                  <span>Restaurar</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sync Status Footer */}
      {syncMeta && (
        <div
          className={`rounded-xl px-3.5 py-2.5 border text-xs flex flex-wrap items-center justify-between gap-2 ${
            syncMeta.mode === 'google_drive'
              ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
              : 'bg-amber-50/70 border-amber-200 text-amber-900'
          }`}
        >
          <div className="space-y-0.5">
            <p className="font-bold">
              {syncMeta.mode === 'google_drive'
                ? `Sincronizado no Google Drive · ${syncMeta.fileName}`
                : `Cópia em Contingência Local · ${syncMeta.fileName}`}
            </p>
            <p className="text-[11px] opacity-85 font-mono tabular-nums">
              {formattedSyncTime} · {syncMeta.visitsCount} visita(s)
              {syncMeta.email ? ` · ${syncMeta.email}` : ''}
            </p>
          </div>
          {syncMeta.webViewLink && (
            <a
              href={syncMeta.webViewLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-bold text-emerald-800 hover:underline"
            >
              <span>Abrir no Drive</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      )}
    </section>
  );
}
