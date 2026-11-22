import {
  BarChart3,
  Camera,
  ChevronRight,
  Circle,
  ClipboardList,
  Cloud,
  FileSpreadsheet,
  FileText,
  HeartHandshake,
  Lock,
  MapPin,
  MessageCircle,
  Pencil,
  Play,
  Search,
  Share2,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import type { ViewName, Visit } from '../types/report';
import {
  formatDatePT,
  getVisitCoordinates,
  getVisitStatus,
  VISITS_PER_DAY,
} from '../utils/storage';

interface DashboardViewProps {
  visits: Visit[];
  activeDateISO: string;
  sellerName: string;
  googleEmail: string | null;
  hasGoogleDriveToken: boolean;
  onNavigate: (view: ViewName) => void;
  onOpenVisit: (index: number) => void;
  onContinueReport: () => void;
  onPrepareWhatsApp: () => void;
  onExportExcel: (shareAfterExport: boolean) => void;
  onExportPdf: (shareAfterExport: boolean) => void;
}

type VisitFilterMode = 'all' | 'in_progress' | 'locked' | 'geo';

export function DashboardView({
  visits,
  activeDateISO,
  sellerName,
  googleEmail,
  hasGoogleDriveToken,
  onNavigate,
  onOpenVisit,
  onContinueReport,
  onPrepareWhatsApp,
  onExportExcel,
  onExportPdf,
}: DashboardViewProps) {
  const totalSlots = visits.length || VISITS_PER_DAY;
  const lockedCount = visits.filter((v) => v.isLocked).length;
  const inProgressCount = visits.filter(
    (v) => !v.isLocked && getVisitStatus(v).code === 'in_progress'
  ).length;
  const geoCount = visits.filter((v) => getVisitCoordinates(v) !== null).length;
  const percent = Math.round((lockedCount / totalSlots) * 100);
  const nextUnlockedIdx = visits.findIndex((v) => !v.isLocked);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<VisitFilterMode>('all');

  const filteredVisits = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return visits
      .map((visit, idx) => ({ visit, idx }))
      .filter(({ visit, idx }) => {
        if (filterMode === 'locked' && !visit.isLocked) return false;
        if (filterMode === 'in_progress' && getVisitStatus(visit).code !== 'in_progress') {
          return false;
        }
        if (filterMode === 'geo' && getVisitCoordinates(visit) === null) return false;

        if (!query) return true;
        const numStr = String(idx + 1).padStart(2, '0');
        return (
          visit.company.toLowerCase().includes(query) ||
          (visit.contactName ?? '').toLowerCase().includes(query) ||
          (visit.contactPhone ?? '').toLowerCase().includes(query) ||
          numStr.includes(query)
        );
      });
  }, [visits, searchQuery, filterMode]);

  const filterTabs: Array<{ id: VisitFilterMode; label: string; count: number }> = [
    { id: 'all', label: 'Todas', count: totalSlots },
    { id: 'in_progress', label: 'Em curso', count: inProgressCount },
    { id: 'locked', label: 'Concluídas', count: lockedCount },
    { id: 'geo', label: 'Com GPS', count: geoCount },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
      {/* Left Column on Desktop: Seller, Progress & Closing Actions */}
      <div className="lg:col-span-5 space-y-5">
        <section className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200">
          <div className="flex items-start justify-between gap-3 pb-4 border-b border-slate-100">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-brand-cyan">
                Vendedor Responsável · {formatDatePT(activeDateISO)}
              </p>
              <div className="flex items-center gap-2 mt-1">
                <h2 className="text-lg font-extrabold text-brand-900 truncate">
                  {sellerName || 'Não definido'}
                </h2>
                <button
                  type="button"
                  onClick={() => onNavigate('settings')}
                  className="text-xs font-bold text-brand-cyan hover:underline px-2 py-1 rounded-lg bg-sky-50 shrink-0"
                >
                  Editar
                </button>
              </div>
            </div>

            <div className="text-right shrink-0">
              <span className="block text-xs font-semibold text-slate-500">Progresso</span>
              <span className="text-xl font-extrabold text-brand-900 font-mono tabular-nums">
                {String(lockedCount).padStart(2, '0')}/{totalSlots}
              </span>
            </div>
          </div>

          <div className="mt-4">
            <div className="flex items-center justify-between text-xs font-semibold mb-2">
              <span className="text-slate-600">Visitas concluídas</span>
              <span className="font-mono tabular-nums text-brand-900 font-bold">{percent}%</span>
            </div>
            <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-brand-900 to-brand-cyan transition-all duration-300 rounded-full"
                style={{ width: `${percent}%` }}
              />
            </div>
            <div className="flex justify-between text-xs mt-2.5 font-semibold tabular-nums">
              <span className="text-emerald-700">
                {lockedCount} Concluída(s) e Bloqueada(s)
              </span>
              <span className="text-brand-cyan">{inProgressCount} Em curso</span>
            </div>
          </div>

          <div className="mt-5">
            <button
              type="button"
              onClick={onContinueReport}
              className="w-full min-h-[48px] py-3.5 px-5 rounded-xl bg-brand-gold hover:bg-brand-goldHover text-brand-950 font-extrabold text-sm sm:text-base shadow-sm active:scale-[0.99] transition flex items-center justify-center gap-2.5"
            >
              <Play className="w-4 h-4 fill-brand-900 text-brand-900 shrink-0" />
              <span className="truncate">
                {nextUnlockedIdx !== -1
                  ? `Continuar Relatório (Visita ${String(nextUnlockedIdx + 1).padStart(2, '0')})`
                  : `Todas as ${totalSlots} Visitas Concluídas (Rever)`}
              </span>
            </button>
          </div>
        </section>

        {/* Closing & Export Actions */}
        <section className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200 space-y-3">
          <h3 className="font-extrabold text-brand-900 text-base">Fecho e Envio do Relatório</h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => onNavigate('summary')}
              className="w-full min-h-[44px] py-3 px-3 rounded-xl bg-brand-surface hover:bg-sky-100/70 text-brand-900 border border-sky-200/80 font-bold text-xs sm:text-sm transition flex items-center justify-center gap-2"
            >
              <ClipboardList className="w-4 h-4 text-brand-cyan shrink-0" />
              <span>Resumo &amp; Mapa ({geoCount})</span>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('analytics')}
              className="w-full min-h-[44px] py-3 px-3 rounded-xl bg-brand-900 hover:bg-brand-800 text-white font-bold text-xs sm:text-sm transition flex items-center justify-center gap-2"
            >
              <BarChart3 className="w-4 h-4 text-brand-gold shrink-0" />
              <span>Estatísticas &amp; Gráficos</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => onNavigate('settings')}
            className="w-full min-h-[40px] px-3.5 py-2 rounded-xl bg-brand-surface hover:bg-sky-50 border border-slate-200 text-xs flex items-center justify-between gap-2 transition"
          >
            <span className="inline-flex items-center gap-2 text-brand-900 font-semibold truncate">
              <Cloud className="w-3.5 h-3.5 text-brand-cyan shrink-0" />
              <span className="truncate">
                {googleEmail && hasGoogleDriveToken
                  ? `Drive ligado: ${googleEmail}`
                  : googleEmail
                    ? `Conta: ${googleEmail} (renovar Drive)`
                    : 'Nuvem: Modo Local / Contingência'}
              </span>
            </span>
            <span className="text-brand-cyan font-bold shrink-0 inline-flex items-center gap-1">
              <MapPin className="w-3 h-3 hidden sm:inline" />
              <span>Gerir</span>
            </span>
          </button>

          <button
            type="button"
            onClick={onPrepareWhatsApp}
            className="w-full min-h-[48px] py-3.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-sm active:scale-[0.99] transition flex items-center justify-center gap-2.5"
          >
            <MessageCircle className="w-5 h-5 shrink-0" />
            <span>Enviar Relatório pelo WhatsApp</span>
          </button>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => onExportExcel(false)}
              className="w-full min-h-[44px] py-3 px-4 rounded-xl border border-slate-200 hover:border-brand-900/30 bg-white text-brand-900 font-bold text-sm transition flex items-center justify-center gap-2"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Descarregar Excel</span>
            </button>

            <button
              type="button"
              onClick={() => onExportExcel(true)}
              className="w-full min-h-[44px] py-3 px-4 rounded-xl border border-sky-200 hover:border-brand-cyan bg-sky-50/70 text-brand-900 font-bold text-sm transition flex items-center justify-center gap-2"
            >
              <Share2 className="w-4 h-4 text-brand-cyan shrink-0" />
              <span>Exportar e Partilhar</span>
            </button>
          </div>

          {/* PDF Export & Native Share */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => onExportPdf(false)}
              className="w-full min-h-[44px] py-3 px-4 rounded-xl border border-slate-200 hover:border-brand-900/30 bg-brand-surface text-brand-900 font-bold text-sm transition flex items-center justify-center gap-2"
            >
              <FileText className="w-4 h-4 text-brand-900 shrink-0" />
              <span>Descarregar Relatório PDF</span>
            </button>

            <button
              type="button"
              onClick={() => onExportPdf(true)}
              className="w-full min-h-[44px] py-3 px-4 rounded-xl border border-amber-200 hover:border-brand-gold bg-amber-50/70 text-brand-900 font-bold text-sm transition flex items-center justify-center gap-2"
            >
              <Share2 className="w-4 h-4 text-brand-goldHover shrink-0" />
              <span>Partilhar PDF</span>
            </button>
          </div>
        </section>
      </div>

      {/* Right Column on Desktop: 10 Independent Visit Cards with Instant Search & Filter */}
      <section className="lg:col-span-7 bg-white rounded-2xl p-5 sm:p-6 border border-slate-200 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-extrabold text-brand-900 text-base">
            Registos das {totalSlots} Visitas
          </h3>
          <span className="text-xs text-slate-500 font-medium">Toque para abrir</span>
        </div>

        <div className="space-y-2.5">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Pesquisar empresa, contacto ou nº da visita..."
              aria-label="Pesquisar visitas"
              className="w-full min-h-[42px] pl-10 pr-9 py-2 rounded-xl border border-slate-200 bg-brand-surface focus:bg-white focus:border-brand-cyan focus:outline-none text-sm transition"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Limpar pesquisa"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-lg text-slate-400 hover:text-brand-900"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
            {filterTabs.map((tab) => {
              const active = filterMode === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilterMode(tab.id)}
                  className={`min-h-[34px] px-3 py-1 rounded-xl border text-xs font-bold shrink-0 transition flex items-center gap-1.5 ${
                    active
                      ? 'bg-brand-900 text-white border-brand-900'
                      : 'bg-brand-surface text-slate-600 border-slate-200 hover:bg-sky-50'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`font-mono tabular-nums text-[11px] ${
                      active ? 'text-brand-gold' : 'text-slate-400'
                    }`}
                  >
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {filteredVisits.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-brand-surface p-6 text-center space-y-2">
            <p className="text-sm font-bold text-brand-900">Nenhuma visita encontrada</p>
            <p className="text-xs text-slate-500">
              Ajuste os filtros ou limpe o termo de pesquisa.
            </p>
            {(searchQuery || filterMode !== 'all') && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setFilterMode('all');
                }}
                className="min-h-[36px] px-3.5 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-bold text-brand-cyan hover:bg-sky-50 transition"
              >
                Mostrar todas as visitas
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {filteredVisits.map(({ visit, idx }) => {
              const status = getVisitStatus(visit);
              const numStr = String(idx + 1).padStart(2, '0');
              const companyDisplay = visit.company.trim()
                ? visit.company.trim()
                : 'Empresa não registada';
              const photosCount = visit.photos?.length ?? 0;
              const managerNotesCount =
                visit.managerComments?.filter((c) => c.authorRole === 'admin').length ?? 0;

              const cardClass = visit.isLocked
                ? 'bg-emerald-50/40 border-emerald-200 hover:bg-emerald-50'
                : status.code === 'in_progress'
                  ? 'bg-amber-50/40 border-amber-200 hover:bg-amber-50/70'
                  : 'bg-white border-slate-200 hover:bg-slate-50';

              const statusTextClass = visit.isLocked
                ? 'text-emerald-700'
                : status.code === 'in_progress'
                  ? 'text-amber-700'
                  : 'text-slate-500';

              return (
                <button
                  key={visit.id}
                  type="button"
                  onClick={() => onOpenVisit(idx)}
                  className={`w-full min-h-[68px] text-left p-4 rounded-xl border transition active:scale-[0.99] flex items-center justify-between gap-3 ${cardClass}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-xs mb-1">
                      <span className="font-extrabold text-brand-900 font-mono tabular-nums">
                        Visita {numStr}
                      </span>
                      <span aria-hidden="true" className="text-slate-300">
                        ·
                      </span>
                      <span
                        className={`font-semibold inline-flex items-center gap-1 ${statusTextClass}`}
                      >
                        {status.code === 'locked' && <Lock className="w-3 h-3" />}
                        {status.code === 'in_progress' && <Pencil className="w-3 h-3" />}
                        {status.code === 'empty' && <Circle className="w-3 h-3" />}
                        <span>{status.label}</span>
                      </span>
                    </div>
                    <p
                      className={`text-sm font-semibold truncate ${
                        visit.company.trim() ? 'text-slate-900' : 'text-slate-400 italic'
                      }`}
                    >
                      {companyDisplay}
                    </p>
                    {(visit.contactName?.trim() || photosCount > 0 || managerNotesCount > 0) && (
                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 mt-1">
                        {visit.contactName?.trim() && (
                          <span className="truncate max-w-[140px]">{visit.contactName.trim()}</span>
                        )}
                        {photosCount > 0 && (
                          <span className="inline-flex items-center gap-0.5 text-brand-cyan font-semibold">
                            <Camera className="w-3 h-3" />
                            <span>{photosCount}</span>
                          </span>
                        )}
                        {managerNotesCount > 0 && (
                          <span className="inline-flex items-center gap-0.5 text-brand-900 font-bold bg-sky-100 px-1.5 py-0.5 rounded">
                            <HeartHandshake className="w-3 h-3 text-brand-cyan" />
                            <span>Apoio</span>
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <ChevronRight className="w-4 h-4 text-brand-cyan shrink-0" />
                </button>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
