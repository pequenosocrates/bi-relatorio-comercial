import {
  AlertTriangle,
  Camera,
  Eye,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  HeartHandshake,
  Lock,
  MessageCircle,
  Pencil,
  Phone,
  Share2,
  User,
} from 'lucide-react';
import { useState } from 'react';
import type {
  ModalConfig,
  SupportComment,
  ToastType,
  ViewName,
  Visit,
  VisitPhoto,
} from '../types/report';
import type { GoogleAuthSnapshot } from '../utils/driveSync';
import { isSafeImageDataUrl } from '../utils/photo';
import { formatDatePT, getRecordedVisits } from '../utils/storage';
import { CloudSyncCard } from './CloudSyncCard';
import { PhotoLightboxModal } from './PhotoLightboxModal';
import { SupportFeedbackCard } from './SupportFeedbackCard';
import { VisitRouteMap } from './VisitRouteMap';

interface SummaryViewProps {
  visits: Visit[];
  dailyManagerComments: SupportComment[];
  activeDateISO: string;
  sellerName: string;
  authSnapshot: GoogleAuthSnapshot;
  onAuthSnapshotChange: (snapshot: GoogleAuthSnapshot) => void;
  onRequestConfirmModal: (config: ModalConfig) => void;
  onReportsRestored: (dates: string[]) => void;
  onAddDailyComment: (comment: SupportComment) => void;
  onToast: (message: string, type: ToastType) => void;
  onNavigate: (view: ViewName) => void;
  onOpenVisit: (index: number) => void;
  onPrepareWhatsApp: () => void;
  onExportExcel: (shareAfterExport: boolean) => void;
  onExportPdf: (shareAfterExport: boolean) => void;
}

export function SummaryView({
  visits,
  dailyManagerComments,
  activeDateISO,
  sellerName,
  authSnapshot,
  onAuthSnapshotChange,
  onRequestConfirmModal,
  onReportsRestored,
  onAddDailyComment,
  onToast,
  onNavigate,
  onOpenVisit,
  onPrepareWhatsApp,
  onExportExcel,
  onExportPdf,
}: SummaryViewProps) {
  const [previewPhoto, setPreviewPhoto] = useState<{ photo: VisitPhoto; caption: string } | null>(
    null
  );

  const recorded = getRecordedVisits(visits);
  const lockedCount = visits.filter((v) => v.isLocked).length;
  const incompleteCount = recorded.filter((v) => !v.isLocked).length;

  return (
    <>
      <PhotoLightboxModal
        photo={previewPhoto?.photo ?? null}
        caption={previewPhoto?.caption}
        onClose={() => setPreviewPhoto(null)}
      />

      <div className="space-y-5">
        {/* Header & KPI Overview */}
        <section className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200">
          <div className="flex items-start justify-between gap-3 mb-5">
            <div>
              <p className="text-xs font-semibold text-brand-cyan">Revisão Final · BI</p>
              <h2 className="text-xl font-extrabold text-brand-900 mt-0.5">
                Resumo do Relatório Comercial Diário
              </h2>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('dashboard')}
              className="min-h-[40px] px-4 py-2 rounded-xl bg-brand-surface hover:bg-sky-100 text-brand-900 font-bold text-xs transition shrink-0"
            >
              Voltar
            </button>
          </div>

          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-brand-surface p-3.5 rounded-xl border border-slate-200 text-center">
              <span className="block text-2xl font-extrabold text-brand-900 font-mono tabular-nums">
                {recorded.length}
              </span>
              <span className="text-xs font-semibold text-slate-600">Registadas</span>
            </div>
            <div className="bg-emerald-50 p-3.5 rounded-xl border border-emerald-200 text-center">
              <span className="block text-2xl font-extrabold text-emerald-700 font-mono tabular-nums">
                {lockedCount}
              </span>
              <span className="text-xs font-semibold text-emerald-700">Concluídas</span>
            </div>
            <div className="bg-amber-50 p-3.5 rounded-xl border border-amber-200 text-center">
              <span className="block text-2xl font-extrabold text-amber-700 font-mono tabular-nums">
                {incompleteCount}
              </span>
              <span className="text-xs font-semibold text-amber-700">Incompletas</span>
            </div>
          </div>

          <div className="text-xs text-slate-600 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
            <span>
              Relatório elaborado por:{' '}
              <strong className="text-brand-900">{sellerName || 'Não definido'}</strong>
            </span>
            <span className="font-mono tabular-nums font-bold text-brand-cyan">
              {formatDatePT(activeDateISO)}
            </span>
          </div>
        </section>

        {/* Daily Manager Recommendations (visible when manager commented) */}
        {dailyManagerComments.length > 0 && (
          <section className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200">
            <SupportFeedbackCard
              title="Recomendações & Apoio da Gestão (Resumo do Dia)"
              comments={dailyManagerComments}
              currentRole="seller"
              authorName={sellerName || 'Vendedor'}
              onAddComment={onAddDailyComment}
            />
          </section>
        )}

        {/* Interactive Map & Sequential Route Trajectory */}
        <VisitRouteMap
          visits={visits}
          activeDateISO={activeDateISO}
          onOpenVisit={onOpenVisit}
        />

        {/* Recorded Visits List */}
        {recorded.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center border border-slate-200 space-y-3">
            <FolderOpen className="w-10 h-10 text-slate-300 mx-auto" />
            <p className="text-slate-600 font-semibold text-sm">
              Ainda não existem visitas registadas neste dia.
            </p>
            <button
              type="button"
              onClick={() => onOpenVisit(0)}
              className="min-h-[44px] px-5 py-2.5 rounded-xl bg-brand-gold hover:bg-brand-goldHover text-brand-950 font-bold text-sm transition inline-flex items-center gap-2"
            >
              <span>Iniciar Visita 01</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {recorded.map((visit) => {
              const numStr = String(visit.id).padStart(2, '0');
              const actionText =
                visit.nextAction === 'Outro'
                  ? `Outro (${visit.otherAction.trim() || 'Não especificado'})`
                  : visit.nextAction || 'Não definida';
              const validPhotos = (visit.photos ?? []).filter((p) =>
                isSafeImageDataUrl(p.dataUrl)
              );
              const managerNotesCount =
                visit.managerComments?.filter((c) => c.authorRole === 'admin').length ?? 0;

              return (
                <article
                  key={visit.id}
                  className="bg-white rounded-2xl p-5 border border-slate-200 flex flex-col justify-between gap-3"
                >
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="px-2 py-1 rounded-md bg-brand-900 text-white text-xs font-extrabold font-mono tabular-nums shrink-0">
                          {numStr}
                        </span>
                        <h4 className="font-bold text-slate-900 text-base truncate">
                          {visit.company.trim() || 'Sem nome'}
                        </h4>
                      </div>

                      <button
                        type="button"
                        onClick={() => onOpenVisit(visit.id - 1)}
                        className="text-xs font-bold text-brand-cyan hover:underline flex items-center gap-1 shrink-0 min-h-[36px] px-2"
                      >
                        {visit.isLocked ? (
                          <Eye className="w-3.5 h-3.5" />
                        ) : (
                          <Pencil className="w-3.5 h-3.5" />
                        )}
                        <span>{visit.isLocked ? 'Consultar' : 'Completar'}</span>
                      </button>
                    </div>

                    {(visit.contactName?.trim() || visit.contactPhone?.trim()) && (
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600 bg-brand-surface rounded-lg px-2.5 py-1.5">
                        {visit.contactName?.trim() && (
                          <span className="inline-flex items-center gap-1 font-semibold text-brand-900">
                            <User className="w-3 h-3 text-brand-cyan" />
                            <span>{visit.contactName.trim()}</span>
                          </span>
                        )}
                        {visit.contactPhone?.trim() && (
                          <span className="inline-flex items-center gap-1 font-mono tabular-nums">
                            <Phone className="w-3 h-3 text-brand-cyan" />
                            <span>{visit.contactPhone.trim()}</span>
                          </span>
                        )}
                      </div>
                    )}

                    <p className="text-xs text-slate-600 leading-relaxed">
                      <strong className="text-slate-800">Descrição:</strong>{' '}
                      {visit.description.trim() || '---'}
                    </p>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      <strong className="text-slate-800">Problema:</strong>{' '}
                      {visit.problem.trim() || '---'}
                    </p>

                    {validPhotos.length > 0 && (
                      <div className="pt-1 space-y-1.5">
                        <p className="text-[11px] font-bold text-brand-900 inline-flex items-center gap-1">
                          <Camera className="w-3 h-3 text-brand-cyan" />
                          <span>Evidência Fotográfica ({validPhotos.length})</span>
                        </p>
                        <div className="grid grid-cols-3 gap-2">
                          {validPhotos.map((photo, pIdx) => (
                            <button
                              key={photo.id}
                              type="button"
                              onClick={() =>
                                setPreviewPhoto({
                                  photo,
                                  caption: `Visita ${numStr} · ${
                                    visit.company.trim() || 'Local'
                                  } (Foto ${pIdx + 1})`,
                                })
                              }
                              className="aspect-square rounded-lg overflow-hidden border border-slate-200 bg-slate-100 hover:border-brand-cyan transition"
                            >
                              <img
                                src={photo.dataUrl}
                                alt={`Evidência ${pIdx + 1}`}
                                className="w-full h-full object-cover"
                              />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {managerNotesCount > 0 && (
                      <div className="rounded-xl bg-sky-50 border border-sky-200 px-3 py-2 text-xs text-brand-900 flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 font-bold">
                          <HeartHandshake className="w-3.5 h-3.5 text-brand-cyan" />
                          <span>{managerNotesCount} recomendação(ões) da gestão</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => onOpenVisit(visit.id - 1)}
                          className="text-brand-cyan font-bold hover:underline shrink-0"
                        >
                          Ver / Responder
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    <span className="text-slate-600">
                      Probabilidade:{' '}
                      <strong className="text-slate-900">
                        {visit.probability || 'Não definida'}
                      </strong>
                    </span>
                    <span aria-hidden="true" className="text-slate-300">
                      ·
                    </span>
                    <span className="text-slate-600">
                      Acção: <strong className="text-brand-cyan">{actionText}</strong>
                    </span>
                    <span aria-hidden="true" className="text-slate-300">
                      ·
                    </span>
                    <span
                      className={`font-bold inline-flex items-center gap-1 ${
                        visit.isLocked ? 'text-emerald-700' : 'text-amber-700'
                      }`}
                    >
                      {visit.isLocked ? (
                        <>
                          <Lock className="w-3 h-3" />
                          <span>Bloqueada</span>
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="w-3 h-3" />
                          <span>Em curso</span>
                        </>
                      )}
                    </span>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {/* Cloud / Google Drive Sync */}
        <CloudSyncCard
          activeDateISO={activeDateISO}
          visits={visits}
          sellerName={sellerName}
          authSnapshot={authSnapshot}
          onAuthSnapshotChange={onAuthSnapshotChange}
          onRequestConfirmModal={onRequestConfirmModal}
          onReportsRestored={onReportsRestored}
          onToast={onToast}
        />

        {/* Export & WhatsApp Actions */}
        <section className="bg-white rounded-2xl p-5 border border-slate-200 space-y-3">
          <button
            type="button"
            onClick={onPrepareWhatsApp}
            className="w-full min-h-[48px] py-3.5 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm sm:text-base shadow-sm active:scale-[0.99] transition flex items-center justify-center gap-2.5"
          >
            <MessageCircle className="w-5 h-5 shrink-0" />
            <span>Enviar relatório completo pelo WhatsApp</span>
          </button>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => onExportExcel(false)}
              className="w-full min-h-[44px] py-3 px-4 rounded-xl border border-slate-200 hover:border-brand-900/30 bg-white text-brand-900 font-bold text-sm transition flex items-center justify-center gap-2"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Descarregar relatório Excel</span>
            </button>

            <button
              type="button"
              onClick={() => onExportExcel(true)}
              className="w-full min-h-[44px] py-3 px-4 rounded-xl border border-sky-200 hover:border-brand-cyan bg-sky-50/70 text-brand-900 font-bold text-sm transition flex items-center justify-center gap-2"
            >
              <Share2 className="w-4 h-4 text-brand-cyan shrink-0" />
              <span>Exportar Excel e partilhar</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => onExportPdf(false)}
              className="w-full min-h-[44px] py-3 px-4 rounded-xl bg-brand-gold hover:bg-brand-goldHover text-brand-950 font-extrabold text-sm transition flex items-center justify-center gap-2 shadow-xs"
            >
              <FileText className="w-4 h-4 shrink-0" />
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
    </>
  );
}
