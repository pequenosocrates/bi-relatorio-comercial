import {
  BarChart3,
  Camera,
  CheckCircle2,
  FileSpreadsheet,
  FileText,
  Flame,
  Lock,
  MapPin,
  Phone,
  Share2,
  ShieldCheck,
  User,
} from 'lucide-react';
import { useState } from 'react';
import type { SupportComment, ViewName, Visit, VisitPhoto } from '../types/report';
import { isSafeImageDataUrl } from '../utils/photo';
import { formatDatePT, getVisitCoordinates } from '../utils/storage';
import { PhotoLightboxModal } from './PhotoLightboxModal';
import { SupportFeedbackCard } from './SupportFeedbackCard';
import { VisitRouteMap } from './VisitRouteMap';

interface AdminDashboardViewProps {
  visits: Visit[];
  dailyManagerComments: SupportComment[];
  activeDateISO: string;
  sellerName: string;
  managerName: string;
  onAddVisitComment: (visitIndex: number, comment: SupportComment) => void;
  onAddDailyComment: (comment: SupportComment) => void;
  onExportExcel: () => void;
  onExportPdf: (shareAfterExport: boolean) => void;
  onNavigate: (view: ViewName) => void;
}

export function AdminDashboardView({
  visits,
  dailyManagerComments,
  activeDateISO,
  sellerName,
  managerName,
  onAddVisitComment,
  onAddDailyComment,
  onExportExcel,
  onExportPdf,
  onNavigate,
}: AdminDashboardViewProps) {
  const [previewPhoto, setPreviewPhoto] = useState<{ photo: VisitPhoto; caption: string } | null>(
    null
  );

  // Humanized governance: Admin strictly views ONLY concluded & locked visits (never open drafts)
  const lockedEntries = visits
    .map((visit, idx) => ({ visit, idx }))
    .filter(({ visit }) => visit.isLocked);
  const lockedVisits = lockedEntries.map((e) => e.visit);

  const hotOpportunities = lockedVisits.filter(
    (v) => v.probability === 'Maior' || v.probability === 'Muito maior'
  ).length;
  const totalPhotos = lockedVisits.reduce((sum, v) => sum + (v.photos?.length ?? 0), 0);
  const geoLockedCount = lockedVisits.filter((v) => getVisitCoordinates(v) !== null).length;

  return (
    <>
      <PhotoLightboxModal
        photo={previewPhoto?.photo ?? null}
        caption={previewPhoto?.caption}
        onClose={() => setPreviewPhoto(null)}
      />

      <div className="space-y-5">
        {/* Humanized Governance Header */}
        <section className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-brand-900 text-white text-[11px] font-bold mb-2">
                <ShieldCheck className="w-3.5 h-3.5 text-brand-gold" />
                <span>Modo Administrador / Gestor · Apoio Comercial</span>
              </div>
              <h2 className="text-xl font-extrabold text-brand-900">
                Revisão de Relatórios Concluídos · {formatDatePT(activeDateISO)}
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Vendedor:{' '}
                <strong className="text-brand-900">{sellerName || 'Não definido'}</strong> ·
                Gestor:{' '}
                <strong className="text-brand-cyan">{managerName || 'Gestão Comercial'}</strong>
              </p>
            </div>

            <button
              type="button"
              onClick={() => onNavigate('analytics')}
              className="min-h-[42px] px-4 py-2 rounded-xl bg-brand-900 hover:bg-brand-800 text-white font-bold text-xs sm:text-sm transition inline-flex items-center justify-center gap-2 shrink-0"
            >
              <BarChart3 className="w-4 h-4 text-brand-gold" />
              <span>Estatísticas &amp; Dashboards</span>
            </button>
          </div>

          {/* Privacy / Non-surveillance notice */}
          <div className="rounded-xl bg-brand-surface border border-sky-200/80 px-3.5 py-2.5 text-xs text-slate-600 flex items-start gap-2.5">
            <Lock className="w-4 h-4 text-brand-cyan shrink-0 mt-0.5" />
            <span>
              <strong>Governação Humanizada:</strong> Apenas as visitas já{' '}
              <strong>concluídas e trancadas</strong> são apresentadas neste painel. Rascunhos em
              aberto permanecem privados do vendedor e os registos originais não podem ser
              alterados nem apagados.
            </span>
          </div>

          {/* Business KPI Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl bg-emerald-50/70 border border-emerald-200 p-3.5">
              <div className="flex items-center justify-between text-xs font-semibold text-emerald-800">
                <span>Visitas Concluídas</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              </div>
              <p className="text-2xl font-extrabold text-emerald-900 font-mono tabular-nums mt-1">
                {lockedVisits.length}
              </p>
            </div>

            <div className="rounded-xl bg-amber-50/70 border border-amber-200 p-3.5">
              <div className="flex items-center justify-between text-xs font-semibold text-amber-800">
                <span>Oportunidades Quentes</span>
                <Flame className="w-4 h-4 text-brand-gold" />
              </div>
              <p className="text-2xl font-extrabold text-brand-900 font-mono tabular-nums mt-1">
                {hotOpportunities}
              </p>
            </div>

            <div className="rounded-xl bg-brand-surface border border-slate-200 p-3.5">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
                <span>Fotos de Evidência</span>
                <Camera className="w-4 h-4 text-brand-cyan" />
              </div>
              <p className="text-2xl font-extrabold text-brand-900 font-mono tabular-nums mt-1">
                {totalPhotos}
              </p>
            </div>

            <div className="rounded-xl bg-brand-surface border border-slate-200 p-3.5">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
                <span>Pontos GPS</span>
                <MapPin className="w-4 h-4 text-brand-cyan" />
              </div>
              <p className="text-2xl font-extrabold text-brand-900 font-mono tabular-nums mt-1">
                {geoLockedCount}
              </p>
            </div>
          </div>

          {/* Admin Export Actions (PDF, Share PDF, Excel, Dashboards) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => onExportPdf(false)}
              className="min-h-[44px] py-2.5 px-4 rounded-xl bg-brand-gold hover:bg-brand-goldHover text-brand-950 font-extrabold text-xs sm:text-sm transition flex items-center justify-center gap-2 shadow-xs"
            >
              <FileText className="w-4 h-4 shrink-0" />
              <span>Descarregar Relatório PDF</span>
            </button>

            <button
              type="button"
              onClick={() => onExportPdf(true)}
              className="min-h-[44px] py-2.5 px-4 rounded-xl bg-sky-50 hover:bg-sky-100 text-brand-900 border border-sky-200 font-bold text-xs sm:text-sm transition flex items-center justify-center gap-2"
            >
              <Share2 className="w-4 h-4 text-brand-cyan shrink-0" />
              <span>Partilhar PDF</span>
            </button>

            <button
              type="button"
              onClick={onExportExcel}
              className="min-h-[44px] py-2.5 px-4 rounded-xl bg-white hover:bg-slate-50 text-brand-900 border border-slate-200 font-bold text-xs sm:text-sm transition flex items-center justify-center gap-2"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Descarregar Excel (.xlsx)</span>
            </button>
          </div>
        </section>

        {/* Daily Summary Support & Recommendations */}
        <section className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200">
          <SupportFeedbackCard
            title="Recomendações & Apoio da Gestão (Resumo do Dia)"
            subtitle="Orientações gerais de acompanhamento comercial para todo o dia de visitas."
            comments={dailyManagerComments}
            currentRole="admin"
            authorName={managerName || 'Gestor Comercial'}
            onAddComment={onAddDailyComment}
          />
        </section>

        {/* Trajectory Map strictly for concluded & locked visits */}
        <VisitRouteMap visits={lockedVisits} activeDateISO={activeDateISO} />

        {/* Concluded Visits List */}
        {lockedEntries.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center border border-slate-200 space-y-2">
            <Lock className="w-9 h-9 text-slate-300 mx-auto" />
            <p className="text-sm font-bold text-brand-900">
              Nenhuma visita concluída e trancada neste dia.
            </p>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Assim que o vendedor concluir e trancar uma visita, os detalhes comerciais, fotos de
              evidência e trajectória aparecerão aqui para apoio da gestão.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {lockedEntries.map(({ visit, idx }) => {
              const numStr = String(visit.id).padStart(2, '0');
              const actionText =
                visit.nextAction === 'Outro'
                  ? `Outro (${visit.otherAction.trim() || 'Não especificado'})`
                  : visit.nextAction || 'Não definida';
              const validPhotos = (visit.photos ?? []).filter((p) => isSafeImageDataUrl(p.dataUrl));

              return (
                <article
                  key={visit.id}
                  className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200 space-y-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="px-2.5 py-1 rounded-lg bg-brand-900 text-white text-xs font-extrabold font-mono tabular-nums shrink-0">
                        Visita {numStr}
                      </span>
                      <h3 className="text-base sm:text-lg font-extrabold text-brand-900 truncate">
                        {visit.company.trim() || 'Sem nome'}
                      </h3>
                    </div>

                    <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold inline-flex items-center gap-1">
                      <Lock className="w-3 h-3" />
                      <span>Concluída</span>
                    </span>
                  </div>

                  {(visit.contactName?.trim() || visit.contactPhone?.trim()) && (
                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 bg-brand-surface rounded-xl px-3 py-2">
                      {visit.contactName?.trim() && (
                        <span className="inline-flex items-center gap-1 font-bold text-brand-900">
                          <User className="w-3.5 h-3.5 text-brand-cyan" />
                          <span>{visit.contactName.trim()}</span>
                        </span>
                      )}
                      {visit.contactPhone?.trim() && (
                        <span className="inline-flex items-center gap-1 font-mono tabular-nums">
                          <Phone className="w-3.5 h-3.5 text-brand-cyan" />
                          <span>{visit.contactPhone.trim()}</span>
                        </span>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs sm:text-sm text-slate-700">
                    <div className="rounded-xl bg-brand-surface p-3.5 border border-slate-100">
                      <p className="text-xs font-extrabold text-brand-900 mb-1">Descrição</p>
                      <p className="leading-relaxed whitespace-pre-wrap">
                        {visit.description.trim() || '---'}
                      </p>
                    </div>
                    <div className="rounded-xl bg-brand-surface p-3.5 border border-slate-100">
                      <p className="text-xs font-extrabold text-brand-900 mb-1">
                        Problema Identificado
                      </p>
                      <p className="leading-relaxed whitespace-pre-wrap">
                        {visit.problem.trim() || '---'}
                      </p>
                    </div>
                    <div className="rounded-xl bg-brand-surface p-3.5 border border-slate-100">
                      <p className="text-xs font-extrabold text-brand-900 mb-1">
                        Feedback do Cliente
                      </p>
                      <p className="leading-relaxed whitespace-pre-wrap">
                        {visit.feedback.trim() || 'Sem observações'}
                      </p>
                    </div>
                    <div className="rounded-xl bg-brand-surface p-3.5 border border-slate-100 space-y-1.5">
                      <p className="text-xs font-extrabold text-brand-900">
                        Classificação &amp; Próximo Passo
                      </p>
                      <p className="text-xs">
                        Possibilidade de fecho:{' '}
                        <strong className="text-brand-900">
                          {visit.probability || 'Não definida'}
                        </strong>
                      </p>
                      <p className="text-xs">
                        Acção a seguir: <strong className="text-brand-cyan">{actionText}</strong>
                      </p>
                    </div>
                  </div>

                  {/* Site Recognition Photos (read-only zoomable thumbnails) */}
                  {validPhotos.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-extrabold text-brand-900 flex items-center gap-1.5">
                        <Camera className="w-3.5 h-3.5 text-brand-cyan" />
                        <span>Fotografias de Reconhecimento ({validPhotos.length})</span>
                      </p>
                      <div className="grid grid-cols-3 gap-2.5 max-w-md">
                        {validPhotos.map((photo, pIdx) => (
                          <button
                            key={photo.id}
                            type="button"
                            onClick={() =>
                              setPreviewPhoto({
                                photo,
                                caption: `Visita ${numStr} · ${visit.company.trim() || 'Local'} (Foto ${pIdx + 1})`,
                              })
                            }
                            className="group relative aspect-square rounded-xl overflow-hidden border border-slate-200 bg-slate-100 hover:border-brand-cyan transition"
                          >
                            <img
                              src={photo.dataUrl}
                              alt={`Evidência ${pIdx + 1} da visita ${numStr}`}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                            />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Constructive Manager Feedback */}
                  <SupportFeedbackCard
                    compact
                    comments={visit.managerComments ?? []}
                    currentRole="admin"
                    authorName={managerName || 'Gestor Comercial'}
                    onAddComment={(cmt) => onAddVisitComment(idx, cmt)}
                  />
                </article>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
