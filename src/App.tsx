import {
  BarChart3,
  ClipboardList,
  FileText,
  Home,
  Loader2,
  Power,
  Settings,
  ShieldCheck,
} from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { AuthScreen } from './components/AuthScreen';
import { BiLogo } from './components/BiLogo';
import { ConfirmModal } from './components/ConfirmModal';
import { DashboardView } from './components/DashboardView';
import { ToastContainer } from './components/ToastContainer';
import { VisitFormView } from './components/VisitFormView';
import type {
  ModalConfig,
  SupportComment,
  ToastItem,
  ToastType,
  UserRole,
  ViewName,
  Visit,
} from './types/report';
import {
  initGoogleDriveAuth,
  isFirebaseOAuthConfigured,
  type GoogleAuthSnapshot,
} from './utils/driveSync';
import { buildWhatsAppPayload, exportVisitsToExcel } from './utils/export';
import { exportDailyReportToPdf } from './utils/pdfExport';
import {
  createEmptyVisitsArray,
  formatDatePT,
  getRecordedVisits,
  getTodayISO,
  loadDailyReportRecord,
  saveDailyReport,
  STORAGE_KEYS,
  VISITS_PER_DAY,
} from './utils/storage';

// Lazy-load heavy views (Chart.js, Google Maps SDK, Drive sync, Admin panel) for fast 3G/4G startup
const AnalyticsView = lazy(() =>
  import('./components/AnalyticsView').then((m) => ({ default: m.AnalyticsView }))
);
const SummaryView = lazy(() =>
  import('./components/SummaryView').then((m) => ({ default: m.SummaryView }))
);
const SettingsView = lazy(() =>
  import('./components/SettingsView').then((m) => ({ default: m.SettingsView }))
);
const AdminDashboardView = lazy(() =>
  import('./components/AdminDashboardView').then((m) => ({ default: m.AdminDashboardView }))
);

function ViewFallback() {
  return (
    <div className="bg-white rounded-2xl p-10 border border-slate-200 flex items-center justify-center gap-3 text-sm font-bold text-brand-900">
      <Loader2 className="w-5 h-5 animate-spin text-brand-cyan" />
      <span>A carregar módulo...</span>
    </div>
  );
}

export default function App() {
  const [currentDateISO] = useState<string>(() => getTodayISO());
  const [activeDateISO, setActiveDateISO] = useState<string>(() => getTodayISO());
  const [userRole, setUserRole] = useState<UserRole>(() =>
    sessionStorage.getItem(STORAGE_KEYS.AUTH_ROLE) === 'admin' ? 'admin' : 'seller'
  );
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    if (sessionStorage.getItem(STORAGE_KEYS.AUTH_SESSION) !== 'true') return false;
    const savedRole = sessionStorage.getItem(STORAGE_KEYS.AUTH_ROLE);
    if (savedRole === 'admin') {
      return Boolean(localStorage.getItem(STORAGE_KEYS.ADMIN_CONFIG_CODE));
    }
    return Boolean(localStorage.getItem(STORAGE_KEYS.CONFIG_CODE));
  });
  const [hasConfiguredCode, setHasConfiguredCode] = useState<boolean>(() =>
    Boolean(localStorage.getItem(STORAGE_KEYS.CONFIG_CODE))
  );
  const [hasConfiguredAdminCode, setHasConfiguredAdminCode] = useState<boolean>(() =>
    Boolean(localStorage.getItem(STORAGE_KEYS.ADMIN_CONFIG_CODE))
  );

  const [sellerName, setSellerName] = useState<string>(
    () => localStorage.getItem(STORAGE_KEYS.SELLER_NAME) || ''
  );
  const [managerName, setManagerName] = useState<string>(
    () => localStorage.getItem(STORAGE_KEYS.MANAGER_NAME) || ''
  );

  const [initialRecord] = useState(() => loadDailyReportRecord(getTodayISO()));
  const [visits, setVisits] = useState<Visit[]>(initialRecord.visits);
  const [dailyManagerComments, setDailyManagerComments] = useState<SupportComment[]>(
    initialRecord.dailyManagerComments
  );
  const [currentVisitIndex, setCurrentVisitIndex] = useState<number>(0);
  const [currentView, setCurrentView] = useState<ViewName>(() =>
    sessionStorage.getItem(STORAGE_KEYS.AUTH_ROLE) === 'admin' ? 'admin' : 'dashboard'
  );

  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [modal, setModal] = useState<ModalConfig | null>(null);
  const [mapsQuotaExceeded, setMapsQuotaExceeded] = useState(false);
  const [googleAuth, setGoogleAuth] = useState<GoogleAuthSnapshot>(() => ({
    user: null,
    email: null,
    hasAccessToken: false,
    isConfigured: isFirebaseOAuthConfigured(),
  }));

  const saveTimerRef = useRef<number | null>(null);
  const latestStateRef = useRef({ activeDateISO, visits, dailyManagerComments });
  latestStateRef.current = { activeDateISO, visits, dailyManagerComments };

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    if (!message) return;
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3200);
  }, []);

  const flushPendingSave = useCallback(() => {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
      const {
        activeDateISO: date,
        visits: currentVisits,
        dailyManagerComments: currentComments,
      } = latestStateRef.current;
      const res = saveDailyReport(date, currentVisits, currentComments);
      if (!res.ok && res.error) {
        showToast(res.error, 'error');
      }
    }
  }, [showToast]);

  useEffect(() => {
    const unsubscribeAuth = initGoogleDriveAuth((snapshot) => {
      setGoogleAuth(snapshot);
    });
    const handleQuotaExceeded = () => {
      setMapsQuotaExceeded(true);
    };
    const handlePageHide = () => flushPendingSave();
    window.addEventListener('gmp-quota-exceeded', handleQuotaExceeded);
    window.addEventListener('pagehide', handlePageHide);
    return () => {
      unsubscribeAuth();
      window.removeEventListener('gmp-quota-exceeded', handleQuotaExceeded);
      window.removeEventListener('pagehide', handlePageHide);
      flushPendingSave();
    };
  }, [flushPendingSave]);

  const navigateTo = useCallback(
    (view: ViewName, pushHistory = true, roleOverride?: UserRole) => {
      flushPendingSave();
      const effectiveRole = roleOverride ?? userRole;
      let targetView = view;
      // Humanized governance: Admin never enters draft seller forms/dashboards
      if (effectiveRole === 'admin' && (view === 'dashboard' || view === 'visit' || view === 'summary')) {
        targetView = 'admin';
      }
      if (effectiveRole === 'seller' && view === 'admin') {
        targetView = 'dashboard';
      }
      setCurrentView(targetView);
      if (pushHistory) {
        window.history.pushState({ view: targetView }, '');
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [flushPendingSave, userRole]
  );

  useEffect(() => {
    const handlePopState = () => {
      if (sessionStorage.getItem(STORAGE_KEYS.AUTH_SESSION) === 'true') {
        const homeView: ViewName = userRole === 'admin' ? 'admin' : 'dashboard';
        if (currentView !== homeView) {
          window.history.pushState({ view: homeView }, '');
          navigateTo(homeView, false);
        }
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [currentView, navigateTo, userRole]);

  const handleAuthenticated = (role: UserRole) => {
    setHasConfiguredCode(Boolean(localStorage.getItem(STORAGE_KEYS.CONFIG_CODE)));
    setHasConfiguredAdminCode(Boolean(localStorage.getItem(STORAGE_KEYS.ADMIN_CONFIG_CODE)));
    setManagerName(localStorage.getItem(STORAGE_KEYS.MANAGER_NAME) || '');
    setUserRole(role);
    setIsAuthenticated(true);
    const record = loadDailyReportRecord(activeDateISO);
    setVisits(record.visits);
    setDailyManagerComments(record.dailyManagerComments);
    const landingView: ViewName = role === 'admin' ? 'admin' : 'dashboard';
    window.history.pushState({ view: landingView }, '');
    navigateTo(landingView, false, role);
  };

  const handleLogout = () => {
    flushPendingSave();
    setModal({
      title: 'Terminar Sessão',
      message:
        'Os seus dados estão guardados com segurança no dispositivo. Deseja sair da plataforma?',
      confirmText: 'Sair',
      variant: 'danger',
      onConfirm: () => {
        sessionStorage.removeItem(STORAGE_KEYS.AUTH_SESSION);
        sessionStorage.removeItem(STORAGE_KEYS.AUTH_ROLE);
        setHasConfiguredCode(Boolean(localStorage.getItem(STORAGE_KEYS.CONFIG_CODE)));
        setHasConfiguredAdminCode(Boolean(localStorage.getItem(STORAGE_KEYS.ADMIN_CONFIG_CODE)));
        setIsAuthenticated(false);
      },
    });
  };

  const handleUpdateVisit = (index: number, patch: Partial<Visit>) => {
    const immediate =
      'isLocked' in patch ||
      'latitude' in patch ||
      'aiAnalysis' in patch ||
      'photos' in patch ||
      'managerComments' in patch;

    setVisits((prev) => {
      const next = prev.map((v, idx) =>
        idx === index ? { ...v, ...patch, updatedAt: new Date().toISOString() } : v
      );

      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }

      if (immediate) {
        const res = saveDailyReport(
          activeDateISO,
          next,
          latestStateRef.current.dailyManagerComments
        );
        if (!res.ok && res.error) {
          showToast(res.error, 'error');
        }
      } else {
        saveTimerRef.current = window.setTimeout(() => {
          saveTimerRef.current = null;
          const res = saveDailyReport(
            activeDateISO,
            next,
            latestStateRef.current.dailyManagerComments
          );
          if (!res.ok && res.error) {
            showToast(res.error, 'error');
          }
        }, 350);
      }

      return next;
    });
  };

  const handleAddVisitComment = (visitIndex: number, comment: SupportComment) => {
    flushPendingSave();
    setVisits((prev) => {
      const target = prev[visitIndex];
      if (!target) return prev;
      const existing = target.managerComments ?? [];
      const next = prev.map((v, idx) =>
        idx === visitIndex
          ? {
              ...v,
              managerComments: [...existing, comment],
            }
          : v
      );
      const res = saveDailyReport(
        activeDateISO,
        next,
        latestStateRef.current.dailyManagerComments
      );
      if (!res.ok && res.error) {
        showToast(res.error, 'error');
      } else {
        showToast('Comentário de apoio registado!', 'success');
      }
      return next;
    });
  };

  const handleAddDailyComment = (comment: SupportComment) => {
    flushPendingSave();
    setDailyManagerComments((prev) => {
      const next = [...prev, comment];
      const res = saveDailyReport(activeDateISO, latestStateRef.current.visits, next);
      if (!res.ok && res.error) {
        showToast(res.error, 'error');
      } else {
        showToast('Recomendação diária registada!', 'success');
      }
      return next;
    });
  };

  const handleOpenVisit = (index: number) => {
    if (userRole === 'admin') return;
    const maxLen = visits.length || VISITS_PER_DAY;
    if (index < 0 || index >= maxLen) return;
    setCurrentVisitIndex(index);
    navigateTo('visit');
  };

  const handleContinueReport = () => {
    const nextUnlocked = visits.findIndex((v) => !v.isLocked);
    handleOpenVisit(nextUnlocked !== -1 ? nextUnlocked : 0);
  };

  const handleRequestUnlock = (index: number) => {
    const target = visits[index];
    if (!target?.isLocked) return;

    setModal({
      title: 'Destrancar Visita para Edição',
      message:
        'Tem a certeza de que pretende desbloquear esta visita? Os dados registados serão mantidos, mas poderão ser editados.',
      confirmText: 'Destrancar para editar',
      variant: 'warning',
      onConfirm: () => {
        handleUpdateVisit(index, { isLocked: false });
        showToast(
          'Visita desbloqueada. Não se esqueça de voltar a trancar após editar.',
          'info'
        );
      },
    });
  };

  const handlePrepareWhatsApp = () => {
    flushPendingSave();
    const recorded = getRecordedVisits(visits);
    if (recorded.length === 0) {
      showToast('Registe pelo menos uma visita antes de enviar o relatório.', 'error');
      return;
    }

    const { fullText, whatsappHref, usedCompactUrl } = buildWhatsAppPayload(
      visits,
      activeDateISO,
      sellerName
    );

    setModal({
      title: 'Enviar pelo WhatsApp',
      message: usedCompactUrl
        ? 'O relatório completo é extenso: ao clicar em "Abrir WhatsApp" será enviada uma síntese para não ultrapassar o limite do link, ou pode copiar o texto completo abaixo.'
        : 'O relatório está pronto para envio. Clique em "Abrir WhatsApp" para enviar ou copie o texto abaixo.',
      confirmText: 'Abrir WhatsApp',
      variant: 'whatsapp',
      externalHref: whatsappHref,
      copyText: fullText,
    });
  };

  const handleExportExcel = async (shareAfterExport: boolean, adminOnlyLocked = false) => {
    flushPendingSave();
    const targetVisits = adminOnlyLocked ? visits.filter((v) => v.isLocked) : visits;
    if (adminOnlyLocked && targetVisits.length === 0) {
      showToast('Ainda não existem visitas concluídas e trancadas para exportar em Excel.', 'error');
      return;
    }
    const result = await exportVisitsToExcel(targetVisits, activeDateISO, shareAfterExport);
    if (result.message) {
      showToast(result.message, result.type);
    }
  };

  const handleExportPdf = async (shareAfterExport: boolean, adminOnlyLocked = false) => {
    flushPendingSave();
    try {
      const result = await exportDailyReportToPdf({
        visits,
        activeDateISO,
        sellerName,
        dailyManagerComments,
        adminOnlyLocked,
        shareAfterExport,
      });
      if (result.message) {
        showToast(result.message, result.type);
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Não foi possível gerar o relatório PDF.';
      showToast(msg, 'error');
    }
  };

  const handleSaveSellerName = (newName: string) => {
    flushPendingSave();
    localStorage.setItem(STORAGE_KEYS.SELLER_NAME, newName);
    setSellerName(newName);
    saveDailyReport(activeDateISO, visits, dailyManagerComments);
    showToast('Nome do vendedor guardado com sucesso!', 'success');
  };

  const handleSaveManagerName = (newName: string) => {
    localStorage.setItem(STORAGE_KEYS.MANAGER_NAME, newName);
    setManagerName(newName);
    showToast('Nome do gestor guardado com sucesso!', 'success');
  };

  const handleSwitchDate = (dateISO: string) => {
    flushPendingSave();
    setActiveDateISO(dateISO);
    const record = loadDailyReportRecord(dateISO);
    setVisits(record.visits);
    setDailyManagerComments(record.dailyManagerComments);
    setCurrentVisitIndex(0);
    showToast(`Relatório de ${formatDatePT(dateISO)} carregado.`, 'info');
    navigateTo(userRole === 'admin' ? 'admin' : 'dashboard');
  };

  const handleReportsRestored = (restoredDates: string[]) => {
    const storedName = localStorage.getItem(STORAGE_KEYS.SELLER_NAME);
    if (storedName) setSellerName(storedName);
    if (restoredDates.includes(activeDateISO)) {
      const record = loadDailyReportRecord(activeDateISO);
      setVisits(record.visits);
      setDailyManagerComments(record.dailyManagerComments);
    } else if (restoredDates.length === 1) {
      setActiveDateISO(restoredDates[0]);
      const record = loadDailyReportRecord(restoredDates[0]);
      setVisits(record.visits);
      setDailyManagerComments(record.dailyManagerComments);
      setCurrentVisitIndex(0);
    }
  };

  const handleConfirmReset = () => {
    flushPendingSave();
    setModal({
      title: 'Reiniciar Relatório de Hoje',
      message: `Tem a certeza absoluta de que pretende apagar todas as visitas registadas no dia ${formatDatePT(
        activeDateISO
      )}? Esta acção não pode ser desfeita.`,
      confirmText: 'Sim, apagar tudo',
      variant: 'danger',
      onConfirm: () => {
        const fresh = createEmptyVisitsArray();
        setVisits(fresh);
        setDailyManagerComments([]);
        setCurrentVisitIndex(0);
        saveDailyReport(activeDateISO, fresh, []);
        showToast('Relatório reiniciado com sucesso.', 'info');
        navigateTo('dashboard');
      },
    });
  };

  return (
    <div className="min-h-screen flex flex-col bg-brand-surface text-slate-800">
      {mapsQuotaExceeded && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm">
          <span>
            Google Maps Platform quota reached. If you are the app owner, visit{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold text-amber-950 hover:text-amber-800"
            >
              maps developer site
            </a>{' '}
            for instructions to update your account.
          </span>
        </div>
      )}
      <ConfirmModal modal={modal} onClose={() => setModal(null)} onToast={showToast} />
      <ToastContainer toasts={toasts} />

      {!isAuthenticated ? (
        <AuthScreen
          hasConfiguredSellerCode={hasConfiguredCode}
          hasConfiguredAdminCode={hasConfiguredAdminCode}
          onAuthenticated={handleAuthenticated}
          onToast={showToast}
        />
      ) : (
        <div className="min-h-screen flex flex-col">
          {/* Compact Single-Row Top Bar */}
          <header className="sticky top-0 z-30 h-14 bg-brand-900 text-white border-b border-white/10">
            <div className="max-w-6xl mx-auto h-full px-4 flex items-center justify-between gap-4">
              <button
                type="button"
                onClick={() => navigateTo(userRole === 'admin' ? 'admin' : 'dashboard')}
                className="flex items-center gap-2.5 text-left focus:outline-none whitespace-nowrap shrink-0"
              >
                <div className="w-10 h-8 rounded-lg bg-white flex items-center justify-center px-1 shrink-0">
                  <BiLogo />
                </div>
                <span className="font-bold text-sm sm:text-base text-white whitespace-nowrap">
                  Relatório Comercial Diário
                </span>
              </button>

              {/* Desktop Navigation Links */}
              {userRole === 'admin' ? (
                <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-sky-100">
                  <button
                    type="button"
                    onClick={() => navigateTo('admin')}
                    className={`whitespace-nowrap shrink-0 transition-colors hover:text-white inline-flex items-center gap-1.5 ${
                      currentView === 'admin' ? 'text-white underline underline-offset-4' : ''
                    }`}
                  >
                    <ShieldCheck className="w-3.5 h-3.5 text-brand-gold" />
                    <span>Painel Gestor</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => navigateTo('analytics')}
                    className={`whitespace-nowrap shrink-0 transition-colors hover:text-white ${
                      currentView === 'analytics' ? 'text-white underline underline-offset-4' : ''
                    }`}
                  >
                    Estatísticas
                  </button>
                  <button
                    type="button"
                    onClick={() => navigateTo('settings')}
                    className={`whitespace-nowrap shrink-0 transition-colors hover:text-white ${
                      currentView === 'settings' ? 'text-white underline underline-offset-4' : ''
                    }`}
                  >
                    Definições
                  </button>
                </nav>
              ) : (
                <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-sky-100">
                  <button
                    type="button"
                    onClick={() => navigateTo('dashboard')}
                    className={`whitespace-nowrap shrink-0 transition-colors hover:text-white ${
                      currentView === 'dashboard' ? 'text-white underline underline-offset-4' : ''
                    }`}
                  >
                    Painel
                  </button>
                  <button
                    type="button"
                    onClick={() => navigateTo('visit')}
                    className={`whitespace-nowrap shrink-0 transition-colors hover:text-white ${
                      currentView === 'visit' ? 'text-white underline underline-offset-4' : ''
                    }`}
                  >
                    Visitas
                  </button>
                  <button
                    type="button"
                    onClick={() => navigateTo('analytics')}
                    className={`whitespace-nowrap shrink-0 transition-colors hover:text-white ${
                      currentView === 'analytics' ? 'text-white underline underline-offset-4' : ''
                    }`}
                  >
                    Estatísticas
                  </button>
                  <button
                    type="button"
                    onClick={() => navigateTo('summary')}
                    className={`whitespace-nowrap shrink-0 transition-colors hover:text-white ${
                      currentView === 'summary' ? 'text-white underline underline-offset-4' : ''
                    }`}
                  >
                    Resumo
                  </button>
                  <button
                    type="button"
                    onClick={() => navigateTo('settings')}
                    className={`whitespace-nowrap shrink-0 transition-colors hover:text-white ${
                      currentView === 'settings' ? 'text-white underline underline-offset-4' : ''
                    }`}
                  >
                    Definições
                  </button>
                </nav>
              )}

              {/* Right Controls */}
              <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                <span className="hidden sm:inline text-xs font-mono tabular-nums text-sky-200 mr-1 whitespace-nowrap">
                  {formatDatePT(activeDateISO)}
                </span>
                <button
                  type="button"
                  onClick={() => navigateTo('settings')}
                  className="md:hidden min-w-[40px] min-h-[40px] rounded-xl bg-white/10 hover:bg-white/20 text-sky-100 transition flex items-center justify-center"
                  title="Definições"
                  aria-label="Definições"
                >
                  <Settings className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="min-w-[40px] min-h-[40px] px-3 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-200 transition flex items-center justify-center gap-1.5 text-xs font-semibold whitespace-nowrap"
                  title="Terminar Sessão"
                  aria-label="Terminar Sessão"
                >
                  <Power className="w-4 h-4" />
                  <span className="hidden sm:inline">Sair</span>
                </button>
              </div>
            </div>
          </header>

          {/* Main Content */}
          <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-5 pb-24 md:pb-12">
            <Suspense fallback={<ViewFallback />}>
              {currentView === 'admin' && userRole === 'admin' && (
                <AdminDashboardView
                  visits={visits}
                  dailyManagerComments={dailyManagerComments}
                  activeDateISO={activeDateISO}
                  sellerName={sellerName}
                  managerName={managerName}
                  onAddVisitComment={handleAddVisitComment}
                  onAddDailyComment={handleAddDailyComment}
                  onExportExcel={() => handleExportExcel(false, true)}
                  onExportPdf={(share) => handleExportPdf(share, true)}
                  onNavigate={(view) => navigateTo(view)}
                />
              )}

              {currentView === 'dashboard' && userRole === 'seller' && (
                <DashboardView
                  visits={visits}
                  activeDateISO={activeDateISO}
                  sellerName={sellerName}
                  googleEmail={googleAuth.email}
                  hasGoogleDriveToken={googleAuth.hasAccessToken}
                  onNavigate={(view) => navigateTo(view)}
                  onOpenVisit={handleOpenVisit}
                  onContinueReport={handleContinueReport}
                  onPrepareWhatsApp={handlePrepareWhatsApp}
                  onExportExcel={(share) => handleExportExcel(share, false)}
                  onExportPdf={(share) => handleExportPdf(share, false)}
                />
              )}

              {currentView === 'visit' && userRole === 'seller' && (
                <VisitFormView
                  visits={visits}
                  currentIndex={currentVisitIndex}
                  sellerName={sellerName}
                  onSelectVisit={handleOpenVisit}
                  onUpdateVisit={handleUpdateVisit}
                  onAddVisitComment={handleAddVisitComment}
                  onFlushSave={flushPendingSave}
                  onRequestUnlock={handleRequestUnlock}
                  onNavigate={(view) => navigateTo(view)}
                  onToast={showToast}
                />
              )}

              {currentView === 'analytics' && (
                <AnalyticsView
                  activeDateISO={activeDateISO}
                  currentVisits={visits}
                  sellerName={sellerName}
                  isAdminMode={userRole === 'admin'}
                  onNavigate={(view) => navigateTo(view)}
                  onOpenVisit={handleOpenVisit}
                  onToast={showToast}
                />
              )}

              {currentView === 'summary' && userRole === 'seller' && (
                <SummaryView
                  visits={visits}
                  dailyManagerComments={dailyManagerComments}
                  activeDateISO={activeDateISO}
                  sellerName={sellerName}
                  authSnapshot={googleAuth}
                  onAuthSnapshotChange={setGoogleAuth}
                  onRequestConfirmModal={setModal}
                  onReportsRestored={handleReportsRestored}
                  onAddDailyComment={handleAddDailyComment}
                  onToast={showToast}
                  onNavigate={(view) => navigateTo(view)}
                  onOpenVisit={handleOpenVisit}
                  onPrepareWhatsApp={handlePrepareWhatsApp}
                  onExportExcel={(share) => handleExportExcel(share, false)}
                  onExportPdf={(share) => handleExportPdf(share, false)}
                />
              )}

              {currentView === 'settings' && (
                <SettingsView
                  activeDateISO={activeDateISO}
                  currentDateISO={currentDateISO}
                  userRole={userRole}
                  sellerName={sellerName}
                  managerName={managerName}
                  visits={visits}
                  authSnapshot={googleAuth}
                  onAuthSnapshotChange={setGoogleAuth}
                  onRequestConfirmModal={setModal}
                  onReportsRestored={handleReportsRestored}
                  onSaveSellerName={handleSaveSellerName}
                  onSaveManagerName={handleSaveManagerName}
                  onSwitchDate={handleSwitchDate}
                  onConfirmReset={handleConfirmReset}
                  onNavigate={(view) => navigateTo(view)}
                  onToast={showToast}
                />
              )}
            </Suspense>
          </main>

          {/* Mobile Thumb-Friendly Bottom Navigation Bar */}
          {userRole === 'admin' ? (
            <nav
              aria-label="Navegação móvel do gestor"
              className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur-sm border-t border-slate-200 px-2 py-1.5 grid grid-cols-3 gap-1"
            >
              <button
                type="button"
                onClick={() => navigateTo('admin')}
                className={`min-h-[48px] rounded-xl flex flex-col items-center justify-center gap-0.5 text-[11px] font-bold transition ${
                  currentView === 'admin'
                    ? 'bg-sky-50 text-brand-900'
                    : 'text-slate-500 hover:text-brand-900'
                }`}
              >
                <ShieldCheck
                  className={`w-4 h-4 ${
                    currentView === 'admin' ? 'text-brand-cyan' : 'text-slate-400'
                  }`}
                />
                <span>Painel Gestor</span>
              </button>

              <button
                type="button"
                onClick={() => navigateTo('analytics')}
                className={`min-h-[48px] rounded-xl flex flex-col items-center justify-center gap-0.5 text-[11px] font-bold transition ${
                  currentView === 'analytics'
                    ? 'bg-sky-50 text-brand-900'
                    : 'text-slate-500 hover:text-brand-900'
                }`}
              >
                <BarChart3
                  className={`w-4 h-4 ${
                    currentView === 'analytics' ? 'text-brand-cyan' : 'text-slate-400'
                  }`}
                />
                <span>Gráficos</span>
              </button>

              <button
                type="button"
                onClick={() => navigateTo('settings')}
                className={`min-h-[48px] rounded-xl flex flex-col items-center justify-center gap-0.5 text-[11px] font-bold transition ${
                  currentView === 'settings'
                    ? 'bg-sky-50 text-brand-900'
                    : 'text-slate-500 hover:text-brand-900'
                }`}
              >
                <Settings
                  className={`w-4 h-4 ${
                    currentView === 'settings' ? 'text-brand-cyan' : 'text-slate-400'
                  }`}
                />
                <span>Definições</span>
              </button>
            </nav>
          ) : (
            <nav
              aria-label="Navegação móvel"
              className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur-sm border-t border-slate-200 px-2 py-1.5 grid grid-cols-4 gap-1"
            >
              <button
                type="button"
                onClick={() => navigateTo('dashboard')}
                className={`min-h-[48px] rounded-xl flex flex-col items-center justify-center gap-0.5 text-[11px] font-bold transition ${
                  currentView === 'dashboard'
                    ? 'bg-sky-50 text-brand-900'
                    : 'text-slate-500 hover:text-brand-900'
                }`}
              >
                <Home
                  className={`w-4 h-4 ${
                    currentView === 'dashboard' ? 'text-brand-cyan' : 'text-slate-400'
                  }`}
                />
                <span>Painel</span>
              </button>

              <button
                type="button"
                onClick={() => navigateTo('visit')}
                className={`min-h-[48px] rounded-xl flex flex-col items-center justify-center gap-0.5 text-[11px] font-bold transition ${
                  currentView === 'visit'
                    ? 'bg-sky-50 text-brand-900'
                    : 'text-slate-500 hover:text-brand-900'
                }`}
              >
                <FileText
                  className={`w-4 h-4 ${
                    currentView === 'visit' ? 'text-brand-cyan' : 'text-slate-400'
                  }`}
                />
                <span>Visita {String(currentVisitIndex + 1).padStart(2, '0')}</span>
              </button>

              <button
                type="button"
                onClick={() => navigateTo('summary')}
                className={`min-h-[48px] rounded-xl flex flex-col items-center justify-center gap-0.5 text-[11px] font-bold transition ${
                  currentView === 'summary'
                    ? 'bg-sky-50 text-brand-900'
                    : 'text-slate-500 hover:text-brand-900'
                }`}
              >
                <ClipboardList
                  className={`w-4 h-4 ${
                    currentView === 'summary' ? 'text-brand-cyan' : 'text-slate-400'
                  }`}
                />
                <span>Resumo</span>
              </button>

              <button
                type="button"
                onClick={() => navigateTo('analytics')}
                className={`min-h-[48px] rounded-xl flex flex-col items-center justify-center gap-0.5 text-[11px] font-bold transition ${
                  currentView === 'analytics'
                    ? 'bg-sky-50 text-brand-900'
                    : 'text-slate-500 hover:text-brand-900'
                }`}
              >
                <BarChart3
                  className={`w-4 h-4 ${
                    currentView === 'analytics' ? 'text-brand-cyan' : 'text-slate-400'
                  }`}
                />
                <span>Gráficos</span>
              </button>
            </nav>
          )}
        </div>
      )}
    </div>
  );
}
