import {
  ArrowRight,
  Camera,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ClipboardCheck,
  Copy,
  Crosshair,
  ImagePlus,
  Loader2,
  Lock,
  LockOpen,
  MapPin,
  Mic,
  MicOff,
  Pencil,
  Phone,
  Save,
  Sparkles,
  SpellCheck,
  Trash2,
  User,
} from 'lucide-react';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import type {
  NextActionOption,
  ProbabilityLevel,
  ProofreadResult,
  SupportComment,
  ToastType,
  ViewName,
  Visit,
  VisitPhoto,
} from '../types/report';
import { analyzeClientVisit, proofreadVisitTexts } from '../utils/ai';
import {
  compressImageToVisitPhoto,
  isSafeImageDataUrl,
  MAX_PHOTOS_PER_VISIT,
} from '../utils/photo';
import {
  ACTION_OPTIONS,
  formatGoogleMapsPointUrl,
  getVisitCoordinates,
  parseCoordinatesFromLocation,
  PROBABILITY_OPTIONS,
  validateVisitRequiredFields,
  VISITS_PER_DAY,
} from '../utils/storage';
import { PhotoLightboxModal } from './PhotoLightboxModal';
import { ProofreadModal } from './ProofreadModal';
import { SupportFeedbackCard } from './SupportFeedbackCard';

interface VisitFormViewProps {
  visits: Visit[];
  currentIndex: number;
  sellerName: string;
  onSelectVisit: (index: number) => void;
  onUpdateVisit: (index: number, patch: Partial<Visit>) => void;
  onAddVisitComment: (index: number, comment: SupportComment) => void;
  onFlushSave: () => void;
  onRequestUnlock: (index: number) => void;
  onNavigate: (view: ViewName) => void;
  onToast: (message: string, type: ToastType) => void;
}

type TextFieldKey = 'description' | 'problem' | 'feedback';

interface BrowserSpeechRecognition {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((ev: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((ev: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

function getSpeechRecognitionCtor(): (new () => BrowserSpeechRecognition) | null {
  if (typeof window === 'undefined') return null;
  const win = window as unknown as {
    SpeechRecognition?: new () => BrowserSpeechRecognition;
    webkitSpeechRecognition?: new () => BrowserSpeechRecognition;
  };
  return win.SpeechRecognition ?? win.webkitSpeechRecognition ?? null;
}

export function VisitFormView({
  visits,
  currentIndex,
  sellerName,
  onSelectVisit,
  onUpdateVisit,
  onAddVisitComment,
  onFlushSave,
  onRequestUnlock,
  onNavigate,
  onToast,
}: VisitFormViewProps) {
  const [capturingGps, setCapturingGps] = useState(false);

  // Photo upload & lightbox state
  const [compressingPhotos, setCompressingPhotos] = useState(false);
  const [previewPhoto, setPreviewPhoto] = useState<{ photo: VisitPhoto; caption: string } | null>(
    null
  );
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);

  // Proofreader state (per-field or all fields)
  const [proofreadingField, setProofreadingField] = useState<TextFieldKey | 'all' | null>(null);
  const [proofreadOriginal, setProofreadOriginal] = useState<ProofreadResult>({
    description: '',
    problem: '',
    feedback: '',
  });
  const [proofreadCorrected, setProofreadCorrected] = useState<ProofreadResult | null>(null);
  const [proofreadError, setProofreadError] = useState('');

  // Client AI analysis state
  const [analyzingClient, setAnalyzingClient] = useState(false);
  const [analysisError, setAnalysisError] = useState('');
  const [aiExpanded, setAiExpanded] = useState(true);
  const [copiedAi, setCopiedAi] = useState(false);

  // Optional Voice Dictation (Web Speech API)
  const [listeningField, setListeningField] = useState<TextFieldKey | null>(null);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const speechSupported = Boolean(getSpeechRecognitionCtor());

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
      recognitionRef.current = null;
    };
  }, [currentIndex]);

  const visit = visits[currentIndex];
  const lastVisitIndex = visits.length - 1;
  const totalVisits = visits.length || VISITS_PER_DAY;
  const numStr = String(currentIndex + 1).padStart(2, '0');
  const nextNumStr = String(currentIndex + 2).padStart(2, '0');
  const isLocked = visit.isLocked;
  const savedCoords = getVisitCoordinates(visit);
  const effectiveMapUrl =
    visit.location.startsWith('http://') || visit.location.startsWith('https://')
      ? visit.location
      : savedCoords
        ? formatGoogleMapsPointUrl(savedCoords.lat, savedCoords.lng)
        : '';
  const hasValidMapUrl = Boolean(effectiveMapUrl);
  const visitPhotos = (visit.photos ?? []).filter((p) => isSafeImageDataUrl(p.dataUrl));

  const filledTextFieldsCount = [
    visit.description.trim(),
    visit.problem.trim(),
    visit.feedback.trim(),
  ].filter(Boolean).length;

  const handleFieldChange = (field: keyof Visit, value: string) => {
    if (isLocked) return;
    onUpdateVisit(currentIndex, { [field]: value });
  };

  const handleLocationChange = (value: string) => {
    if (isLocked) return;
    const parsed = parseCoordinatesFromLocation(value);
    onUpdateVisit(currentIndex, {
      location: value,
      latitude: parsed?.lat,
      longitude: parsed?.lng,
    });
  };

  const handleSelectProbability = (value: Exclude<ProbabilityLevel, ''>) => {
    if (isLocked) return;
    onUpdateVisit(currentIndex, { probability: value });
  };

  const handleSelectNextAction = (value: Exclude<NextActionOption, ''>) => {
    if (isLocked) return;
    onUpdateVisit(currentIndex, { nextAction: value });
  };

  const handlePhotoFilesSelected = async (e: ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    e.target.value = '';
    if (!fileList || fileList.length === 0 || isLocked) return;

    const remainingSlots = MAX_PHOTOS_PER_VISIT - visitPhotos.length;
    if (remainingSlots <= 0) {
      onToast(`Limite máximo de ${MAX_PHOTOS_PER_VISIT} fotografias por visita atingido.`, 'info');
      return;
    }

    const selectedFiles = Array.from(fileList).slice(0, remainingSlots);
    setCompressingPhotos(true);
    try {
      const compressed: VisitPhoto[] = [];
      for (const file of selectedFiles) {
        const photo = await compressImageToVisitPhoto(file);
        compressed.push(photo);
      }
      onUpdateVisit(currentIndex, {
        photos: [...visitPhotos, ...compressed],
      });
      onToast(
        compressed.length === 1
          ? 'Fotografia comprimida e anexada com sucesso!'
          : `${compressed.length} fotografias comprimidas e anexadas!`,
        'success'
      );
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Não foi possível processar a fotografia.';
      onToast(msg, 'error');
    } finally {
      setCompressingPhotos(false);
    }
  };

  const handleRemovePhoto = (photoId: string) => {
    if (isLocked) return;
    onUpdateVisit(currentIndex, {
      photos: visitPhotos.filter((p) => p.id !== photoId),
    });
    onToast('Fotografia removida.', 'info');
  };

  const handleToggleDictation = (field: TextFieldKey) => {
    if (isLocked) return;
    if (listeningField === field) {
      recognitionRef.current?.stop();
      setListeningField(null);
      return;
    }

    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      onToast('Ditado por voz não disponível neste navegador.', 'info');
      return;
    }

    recognitionRef.current?.stop();
    const recognition = new Ctor();
    recognition.lang = 'pt-PT';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript?.trim();
      if (transcript) {
        const currentVal = visit[field].trim();
        const combined = currentVal ? `${currentVal} ${transcript}` : transcript;
        onUpdateVisit(currentIndex, { [field]: combined });
        onToast('Texto ditado adicionado ao campo!', 'success');
      }
    };
    recognition.onerror = () => {
      setListeningField(null);
      onToast('Não foi possível captar áudio. Verifique a permissão do microfone.', 'error');
    };
    recognition.onend = () => {
      setListeningField(null);
    };

    recognitionRef.current = recognition;
    setListeningField(field);
    try {
      recognition.start();
    } catch {
      setListeningField(null);
    }
  };

  const handleCaptureGps = () => {
    if (isLocked) return;
    if (!navigator.geolocation) {
      onToast('O seu dispositivo não suporta geolocalização GPS.', 'error');
      return;
    }

    setCapturingGps(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const latNum = Number(position.coords.latitude.toFixed(6));
        const lngNum = Number(position.coords.longitude.toFixed(6));
        const mapsUrl = formatGoogleMapsPointUrl(latNum, lngNum);
        onUpdateVisit(currentIndex, {
          location: mapsUrl,
          latitude: latNum,
          longitude: lngNum,
        });
        setCapturingGps(false);
        onToast(
          `Localização GPS registada (${latNum.toFixed(5)}, ${lngNum.toFixed(5)})!`,
          'success'
        );
      },
      (error) => {
        setCapturingGps(false);
        const msg =
          error.code === error.PERMISSION_DENIED
            ? 'Permissão de localização negada. Active o GPS no telemóvel.'
            : 'Não foi possível obter a localização.';
        onToast(msg, 'error');
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  };

  const handleProofread = async (target: TextFieldKey | 'all') => {
    if (isLocked || proofreadingField) return;

    const originalSnapshot: ProofreadResult = {
      description: target === 'all' || target === 'description' ? visit.description : '',
      problem: target === 'all' || target === 'problem' ? visit.problem : '',
      feedback: target === 'all' || target === 'feedback' ? visit.feedback : '',
    };

    if (
      !originalSnapshot.description.trim() &&
      !originalSnapshot.problem.trim() &&
      !originalSnapshot.feedback.trim()
    ) {
      onToast('Preencha o campo de texto antes de solicitar a correcção.', 'error');
      return;
    }

    setProofreadingField(target);
    setProofreadError('');
    try {
      const corrected = await proofreadVisitTexts(originalSnapshot);
      setProofreadOriginal(originalSnapshot);
      setProofreadCorrected(corrected);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Sem ligação à Internet. O registo local continua seguro.';
      setProofreadError(msg);
      onToast(msg, 'error');
    } finally {
      setProofreadingField(null);
    }
  };

  const handleApplyProofread = () => {
    if (!proofreadCorrected || isLocked) return;
    const patch: Partial<Visit> = {};
    if (proofreadOriginal.description.trim()) {
      patch.description = proofreadCorrected.description;
    }
    if (proofreadOriginal.problem.trim()) {
      patch.problem = proofreadCorrected.problem;
    }
    if (proofreadOriginal.feedback.trim()) {
      patch.feedback = proofreadCorrected.feedback;
    }
    onUpdateVisit(currentIndex, patch);
    setProofreadCorrected(null);
    onToast('Correcção (PT-PT pré-1990) aplicada e guardada!', 'success');
  };

  const handleAnalyzeClient = async () => {
    if (isLocked || analyzingClient) return;
    if (!visit.company.trim() && !visit.description.trim() && !visit.problem.trim()) {
      onToast(
        'Preencha pelo menos a Empresa, Descrição ou Problema antes de analisar o cliente.',
        'error'
      );
      return;
    }

    setAnalyzingClient(true);
    setAnalysisError('');
    setAiExpanded(true);

    try {
      const analysis = await analyzeClientVisit({
        company: visit.company,
        description: visit.description,
        problem: visit.problem,
        feedback: visit.feedback,
        probability: visit.probability,
        nextAction: visit.nextAction,
        otherAction: visit.otherAction,
      });
      onUpdateVisit(currentIndex, { aiAnalysis: analysis });
      onToast('Análise comercial gerada e guardada nesta visita!', 'success');
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Sem ligação à Internet. O registo local continua seguro.';
      setAnalysisError(msg);
      onToast(msg, 'error');
    } finally {
      setAnalyzingClient(false);
    }
  };

  const handleCopyAiAnalysis = async () => {
    if (!visit.aiAnalysis) return;
    const formatted = [
      `ANÁLISE COMERCIAL BI · ${visit.company.trim() || `Visita ${numStr}`}`,
      '',
      `1. Diagnóstico Rápido: ${visit.aiAnalysis.diagnosticoRapido}`,
      '',
      `2. Proposta de Valor BI: ${visit.aiAnalysis.propostaValorBi}`,
      '',
      `3. Argumento para Objecções: ${visit.aiAnalysis.argumentoObjeccoes}`,
      '',
      `4. Próximo Passo Recomendado: ${visit.aiAnalysis.proximoPassoRecomendado}`,
    ].join('\n');

    try {
      await navigator.clipboard.writeText(formatted);
      setCopiedAi(true);
      onToast('Sugestões comerciais copiadas!', 'success');
      setTimeout(() => setCopiedAi(false), 2000);
    } catch {
      onToast('Não foi possível copiar automaticamente.', 'error');
    }
  };

  const handleLockOnly = () => {
    const err = validateVisitRequiredFields(visit);
    if (err) {
      onToast(err, 'error');
      return;
    }
    onUpdateVisit(currentIndex, { isLocked: true });
    onToast(`Visita ${numStr} trancada e protegida!`, 'success');
  };

  const handleLockAndAdvance = () => {
    const err = validateVisitRequiredFields(visit);
    if (err) {
      onToast(err, 'error');
      return;
    }
    onUpdateVisit(currentIndex, { isLocked: true });
    onToast(`Visita ${numStr} concluída e protegida!`, 'success');
    if (currentIndex < lastVisitIndex) {
      onSelectVisit(currentIndex + 1);
    } else {
      onNavigate('summary');
    }
  };

  const handleSaveDraft = () => {
    if (isLocked) return;
    onFlushSave();
    onToast('Rascunho guardado com segurança.', 'info');
  };

  const handlePrev = () => {
    if (currentIndex > 0) onSelectVisit(currentIndex - 1);
  };

  const handleNext = () => {
    if (currentIndex < lastVisitIndex) {
      onSelectVisit(currentIndex + 1);
    } else {
      onNavigate('summary');
    }
  };

  const renderFieldActionButtons = (field: TextFieldKey) => {
    const hasValue = Boolean(visit[field].trim());
    const isBusy = proofreadingField === field || proofreadingField === 'all';
    const isListening = listeningField === field;

    return (
      <div className="flex items-center gap-1.5">
        {speechSupported && (
          <button
            type="button"
            onClick={() => handleToggleDictation(field)}
            title={isListening ? 'Parar ditado' : 'Ditar por voz (PT)'}
            aria-label={isListening ? 'Parar ditado' : 'Ditar por voz'}
            className={`px-2 py-1 rounded-lg border text-xs font-bold transition inline-flex items-center gap-1 ${
              isListening
                ? 'bg-red-50 border-red-300 text-red-700 animate-pulse'
                : 'bg-brand-surface hover:bg-sky-50 text-slate-600 border-slate-200'
            }`}
          >
            {isListening ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{isListening ? 'Ouvindo...' : 'Ditar'}</span>
          </button>
        )}

        <button
          type="button"
          disabled={Boolean(proofreadingField) || !hasValue}
          onClick={() => handleProofread(field)}
          className="px-2.5 py-1 rounded-lg bg-sky-50 hover:bg-sky-100 text-brand-cyan border border-sky-200 text-xs font-bold transition inline-flex items-center gap-1.5 disabled:opacity-50"
          title="Corrigir apenas este campo em Português pré-1990"
        >
          {isBusy ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <SpellCheck className="w-3.5 h-3.5" />
          )}
          <span>Corrigir Texto (PT-PT pré-1990)</span>
        </button>
      </div>
    );
  };

  return (
    <>
      <PhotoLightboxModal
        photo={previewPhoto?.photo ?? null}
        caption={previewPhoto?.caption}
        onClose={() => setPreviewPhoto(null)}
      />

      <ProofreadModal
        isOpen={Boolean(proofreadCorrected)}
        original={proofreadOriginal}
        corrected={proofreadCorrected}
        onApply={handleApplyProofread}
        onCancel={() => setProofreadCorrected(null)}
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Desktop Sidebar / Mobile Horizontal Step Bar */}
        <aside className="lg:col-span-4 space-y-4 lg:sticky lg:top-20">
          {/* Step Selector */}
          <div className="bg-white rounded-2xl p-4 border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-brand-900">Navegação das Visitas</span>
              <span className="text-xs font-mono tabular-nums text-brand-cyan font-semibold">
                {numStr}/{totalVisits}
              </span>
            </div>

            <div className="flex lg:grid lg:grid-cols-5 items-center gap-2 overflow-x-auto no-scrollbar pb-1 lg:pb-0">
              {visits.map((v, i) => {
                const isActive = i === currentIndex;
                const pillClass = isActive
                  ? 'bg-brand-900 text-white border-brand-900 shadow-sm'
                  : v.isLocked
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100/70'
                    : 'bg-brand-surface text-slate-700 border-slate-200 hover:bg-sky-50';

                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => onSelectVisit(i)}
                    className={`min-h-[44px] min-w-[48px] lg:min-w-0 px-2.5 py-2 rounded-xl text-xs font-bold font-mono tabular-nums shrink-0 transition flex items-center justify-center gap-1 border ${pillClass}`}
                  >
                    {v.isLocked && <Lock className="w-3 h-3 shrink-0" />}
                    <span>{String(i + 1).padStart(2, '0')}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Visit Status Header Card */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <p className="text-xs font-semibold text-brand-cyan">Relatório Comercial · BI</p>
                <h2 className="text-xl font-extrabold text-brand-900 font-mono tabular-nums mt-0.5">
                  Visita {numStr} de {totalVisits}
                </h2>
              </div>

              <span
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 shrink-0 ${
                  isLocked ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                }`}
              >
                {isLocked ? <Lock className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
                <span>{isLocked ? 'Concluída' : 'Em preenchimento'}</span>
              </span>
            </div>

            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-brand-900 to-brand-cyan transition-all duration-300"
                style={{ width: `${((currentIndex + 1) / totalVisits) * 100}%` }}
              />
            </div>

            {isLocked && (
              <div className="mt-4 p-4 rounded-xl bg-emerald-50 border border-emerald-200 space-y-3">
                <div className="flex items-start gap-2.5">
                  <Lock className="w-4 h-4 text-emerald-700 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-bold text-emerald-950">
                      Visita concluída e protegida
                    </p>
                    <p className="text-xs text-emerald-800 mt-0.5">
                      Os campos e fotografias estão bloqueados contra alterações acidentais.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onRequestUnlock(currentIndex)}
                  className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-white border border-emerald-300 hover:bg-emerald-100 text-emerald-900 font-bold text-xs transition flex items-center justify-center gap-2"
                >
                  <LockOpen className="w-4 h-4" />
                  <span>Destrancar para editar</span>
                </button>
              </div>
            )}
          </div>
        </aside>

        {/* Main Visit Form & Action Controls */}
        <div className="lg:col-span-8 space-y-4">
          {/* Manager Support Recommendations Card (visible when manager left notes) */}
          <SupportFeedbackCard
            comments={visit.managerComments ?? []}
            currentRole="seller"
            authorName={sellerName || 'Vendedor'}
            onAddComment={(cmt) => onAddVisitComment(currentIndex, cmt)}
          />

          <form
            className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200 space-y-5"
            onSubmit={(e) => e.preventDefault()}
          >
            {/* 01. Empresa */}
            <div>
              <label
                htmlFor="field-company"
                className="block text-sm font-bold text-brand-900 mb-1.5"
              >
                01. Empresa <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="field-company"
                disabled={isLocked}
                value={visit.company}
                onChange={(e) => handleFieldChange('company', e.target.value)}
                placeholder="Nome da empresa ou cliente visitado"
                className="w-full min-h-[44px] px-4 py-3 rounded-xl border border-slate-300 focus:border-brand-cyan focus:ring-2 focus:ring-sky-500/20 focus:outline-none text-base transition"
              />
            </div>

            {/* Contacto do Cliente (Opcional) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="field-contact-name"
                  className="block text-xs font-bold text-brand-900 mb-1.5"
                >
                  Pessoa de Contacto (opcional)
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    id="field-contact-name"
                    disabled={isLocked}
                    value={visit.contactName ?? ''}
                    onChange={(e) => handleFieldChange('contactName', e.target.value)}
                    placeholder="Ex: Director / Gerente"
                    className="w-full min-h-[42px] pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-300 focus:border-brand-cyan focus:ring-2 focus:ring-sky-500/20 focus:outline-none text-sm transition"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="field-contact-phone"
                  className="block text-xs font-bold text-brand-900 mb-1.5"
                >
                  Telefone / WhatsApp (opcional)
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="tel"
                    id="field-contact-phone"
                    disabled={isLocked}
                    value={visit.contactPhone ?? ''}
                    onChange={(e) => handleFieldChange('contactPhone', e.target.value)}
                    placeholder="Ex: 84 123 4567"
                    className="w-full min-h-[42px] pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-300 focus:border-brand-cyan focus:ring-2 focus:ring-sky-500/20 focus:outline-none text-sm font-mono tabular-nums transition"
                  />
                </div>
              </div>
            </div>

            {/* 02. Descrição */}
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                <label htmlFor="field-description" className="block text-sm font-bold text-brand-900">
                  02. Descrição <span className="text-red-500">*</span>
                </label>
                {!isLocked && renderFieldActionButtons('description')}
              </div>
              <textarea
                id="field-description"
                rows={3}
                disabled={isLocked}
                value={visit.description}
                onChange={(e) => handleFieldChange('description', e.target.value)}
                placeholder="Descreva brevemente a actividade da empresa, contexto da visita ou o que foi observado..."
                className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-brand-cyan focus:ring-2 focus:ring-sky-500/20 focus:outline-none text-base transition"
              />
            </div>

            {/* 03. Location */}
            <div>
              <label
                htmlFor="field-location"
                className="block text-sm font-bold text-brand-900 mb-1.5"
              >
                03. Location (Localização)
              </label>
              <div className="space-y-2.5">
                <input
                  type="text"
                  id="field-location"
                  disabled={isLocked}
                  value={visit.location}
                  onChange={(e) => handleLocationChange(e.target.value)}
                  placeholder="Cole link do Google Maps, coordenadas (-25.9692, 32.5732) ou use GPS"
                  className="w-full min-h-[44px] px-4 py-3 rounded-xl border border-slate-300 focus:border-brand-cyan focus:ring-2 focus:ring-sky-500/20 focus:outline-none text-sm font-mono transition"
                />

                {savedCoords && (
                  <p className="text-xs font-mono tabular-nums text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-1.5">
                    Coordenadas registadas: {savedCoords.lat.toFixed(6)}, {savedCoords.lng.toFixed(6)} ·
                    Ordem na rota #{numStr}
                  </p>
                )}

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={isLocked || capturingGps}
                    onClick={handleCaptureGps}
                    className="flex-1 min-h-[44px] py-2.5 px-4 rounded-xl bg-brand-surface hover:bg-sky-100/70 text-brand-900 font-bold text-xs sm:text-sm transition flex items-center justify-center gap-2 border border-sky-200 disabled:opacity-50"
                  >
                    {capturingGps ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-brand-cyan" />
                        <span>A obter coordenadas GPS...</span>
                      </>
                    ) : (
                      <>
                        <Crosshair className="w-4 h-4 text-brand-cyan" />
                        <span>Obter localização actual</span>
                      </>
                    )}
                  </button>

                  {hasValidMapUrl && (
                    <a
                      href={effectiveMapUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-h-[44px] py-2.5 px-4 rounded-xl bg-sky-50 hover:bg-sky-100 text-brand-cyan font-bold text-xs sm:text-sm transition inline-flex items-center justify-center gap-1.5 border border-sky-200 whitespace-nowrap"
                    >
                      <MapPin className="w-4 h-4" />
                      <span>Abrir Mapa</span>
                    </a>
                  )}
                </div>
              </div>
            </div>

            {/* Fotografias do Local de Vendas (Evidência e Reconhecimento) */}
            <div className="rounded-2xl border border-slate-200 bg-brand-surface p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <span className="block text-sm font-bold text-brand-900">
                    Fotografias do Local (Evidência e Reconhecimento)
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Até {MAX_PHOTOS_PER_VISIT} fotos (comprimidas automaticamente até 1024px para
                    modo offline rápido)
                  </span>
                </div>
                <span className="px-2 py-0.5 rounded-lg bg-white border border-slate-200 text-xs font-mono font-bold tabular-nums text-brand-900 shrink-0">
                  {visitPhotos.length}/{MAX_PHOTOS_PER_VISIT}
                </span>
              </div>

              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handlePhotoFilesSelected}
              />
              <input
                ref={galleryInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handlePhotoFilesSelected}
              />

              {!isLocked && visitPhotos.length < MAX_PHOTOS_PER_VISIT && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={compressingPhotos}
                    onClick={() => cameraInputRef.current?.click()}
                    className="min-h-[44px] py-2.5 px-3.5 rounded-xl bg-white hover:bg-sky-50 text-brand-900 border border-sky-200 font-bold text-xs sm:text-sm transition flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {compressingPhotos ? (
                      <Loader2 className="w-4 h-4 animate-spin text-brand-cyan" />
                    ) : (
                      <Camera className="w-4 h-4 text-brand-cyan" />
                    )}
                    <span>Tirar Foto (Câmara)</span>
                  </button>

                  <button
                    type="button"
                    disabled={compressingPhotos}
                    onClick={() => galleryInputRef.current?.click()}
                    className="min-h-[44px] py-2.5 px-3.5 rounded-xl bg-white hover:bg-sky-50 text-brand-900 border border-slate-200 font-bold text-xs sm:text-sm transition flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <ImagePlus className="w-4 h-4 text-brand-cyan" />
                    <span>Carregar da Galeria</span>
                  </button>
                </div>
              )}

              {visitPhotos.length > 0 && (
                <div className="grid grid-cols-3 gap-2.5">
                  {visitPhotos.map((photo, pIdx) => (
                    <div
                      key={photo.id}
                      className="relative group aspect-square rounded-xl overflow-hidden border border-slate-200 bg-white"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setPreviewPhoto({
                            photo,
                            caption: `Visita ${numStr} · ${
                              visit.company.trim() || 'Local'
                            } (Foto ${pIdx + 1})`,
                          })
                        }
                        className="w-full h-full block focus:outline-none"
                        aria-label={`Ampliar fotografia ${pIdx + 1}`}
                      >
                        <img
                          src={photo.dataUrl}
                          alt={`Fotografia do local ${pIdx + 1}`}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        />
                      </button>

                      {!isLocked && (
                        <button
                          type="button"
                          onClick={() => handleRemovePhoto(photo.id)}
                          aria-label={`Remover fotografia ${pIdx + 1}`}
                          className="absolute top-1.5 right-1.5 w-7 h-7 rounded-lg bg-red-600/90 hover:bg-red-700 text-white flex items-center justify-center shadow-sm transition"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {isLocked && visitPhotos.length === 0 && (
                <p className="text-xs text-slate-500 italic">
                  Nenhuma fotografia anexada antes do fecho desta visita.
                </p>
              )}
            </div>

            {/* 04. Problema */}
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                <label htmlFor="field-problem" className="block text-sm font-bold text-brand-900">
                  04. Problema <span className="text-red-500">*</span>
                </label>
                {!isLocked && renderFieldActionButtons('problem')}
              </div>
              <textarea
                id="field-problem"
                rows={3}
                disabled={isLocked}
                value={visit.problem}
                onChange={(e) => handleFieldChange('problem', e.target.value)}
                placeholder="Descreva o problema, necessidade ou oportunidade identificada na empresa..."
                className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-brand-cyan focus:ring-2 focus:ring-sky-500/20 focus:outline-none text-base transition"
              />
            </div>

            {/* 05. Feedback do cliente */}
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                <label htmlFor="field-feedback" className="block text-sm font-bold text-brand-900">
                  05. Feedback do cliente
                </label>
                {!isLocked && renderFieldActionButtons('feedback')}
              </div>
              <textarea
                id="field-feedback"
                rows={3}
                disabled={isLocked}
                value={visit.feedback}
                onChange={(e) => handleFieldChange('feedback', e.target.value)}
                placeholder="Reacção, opinião, interesse, dúvidas ou objecções do cliente..."
                className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-brand-cyan focus:ring-2 focus:ring-sky-500/20 focus:outline-none text-base transition"
              />

              {!isLocked && filledTextFieldsCount >= 2 && (
                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    disabled={Boolean(proofreadingField)}
                    onClick={() => handleProofread('all')}
                    className="px-3 py-1.5 rounded-xl bg-brand-surface hover:bg-sky-100 text-brand-900 border border-slate-200 text-xs font-bold inline-flex items-center gap-1.5 transition disabled:opacity-50"
                  >
                    {proofreadingField === 'all' ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-cyan" />
                    ) : (
                      <SpellCheck className="w-3.5 h-3.5 text-brand-cyan" />
                    )}
                    <span>Rever os {filledTextFieldsCount} campos de texto juntos</span>
                  </button>
                </div>
              )}

              {proofreadError && (
                <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mt-2">
                  {proofreadError}
                </p>
              )}
            </div>

            {/* Consultor Comercial BI (IA) */}
            <div className="rounded-2xl border border-sky-200 bg-brand-surface p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-brand-cyan shrink-0" />
                  <span className="text-sm font-extrabold text-brand-900">
                    Consultor Comercial BI (IA)
                  </span>
                </div>

                {visit.aiAnalysis && (
                  <button
                    type="button"
                    onClick={() => setAiExpanded((prev) => !prev)}
                    className="text-xs font-bold text-brand-cyan hover:underline inline-flex items-center gap-1 min-h-[32px] px-2"
                  >
                    <span>{aiExpanded ? 'Recolher' : 'Consultar análise'}</span>
                    {aiExpanded ? (
                      <ChevronUp className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5" />
                    )}
                  </button>
                )}
              </div>

              {!isLocked && (
                <button
                  type="button"
                  disabled={analyzingClient}
                  onClick={handleAnalyzeClient}
                  className="w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-brand-900 hover:bg-brand-800 text-white font-bold text-xs sm:text-sm transition flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {analyzingClient ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-brand-gold" />
                      <span>A analisar cliente com IA...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 text-brand-gold" />
                      <span>
                        {visit.aiAnalysis
                          ? 'Actualizar Análise & Sugestões (IA)'
                          : 'Analisar Cliente & Gerar Sugestões (IA)'}
                      </span>
                    </>
                  )}
                </button>
              )}

              {analysisError && (
                <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                  {analysisError}
                </p>
              )}

              {visit.aiAnalysis && aiExpanded && (
                <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
                  <div className="space-y-2.5 text-xs sm:text-sm text-slate-700 leading-relaxed">
                    <div>
                      <p className="font-extrabold text-brand-900">1. Diagnóstico Rápido</p>
                      <p>{visit.aiAnalysis.diagnosticoRapido}</p>
                    </div>
                    <div className="pt-2 border-t border-slate-100">
                      <p className="font-extrabold text-brand-900">2. Proposta de Valor BI</p>
                      <p>{visit.aiAnalysis.propostaValorBi}</p>
                    </div>
                    <div className="pt-2 border-t border-slate-100">
                      <p className="font-extrabold text-brand-900">3. Argumento para Objecções</p>
                      <p>{visit.aiAnalysis.argumentoObjeccoes}</p>
                    </div>
                    <div className="pt-2 border-t border-slate-100">
                      <p className="font-extrabold text-brand-900">4. Próximo Passo Recomendado</p>
                      <p>{visit.aiAnalysis.proximoPassoRecomendado}</p>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                    <span className="text-[11px] text-slate-400">
                      Guardado nesta visita (disponível mesmo trancada)
                    </span>
                    <button
                      type="button"
                      onClick={handleCopyAiAnalysis}
                      className="min-h-[36px] px-3 py-1.5 rounded-lg bg-brand-surface hover:bg-sky-100 text-brand-900 border border-slate-200 text-xs font-bold inline-flex items-center gap-1.5 transition"
                    >
                      {copiedAi ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="w-3.5 h-3.5 text-brand-cyan" />
                      )}
                      <span>{copiedAi ? 'Copiado' : 'Copiar Sugestão'}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* 06. Possibilidade de fechar a venda */}
            <div>
              <span className="block text-sm font-bold text-brand-900 mb-2">
                06. Possibilidade de fechar a venda
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {PROBABILITY_OPTIONS.map((opt) => {
                  const isSelected = visit.probability === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      disabled={isLocked}
                      onClick={() => handleSelectProbability(opt.id)}
                      className={`min-h-[44px] py-2.5 px-2 rounded-xl border text-xs font-bold transition text-center ${
                        isSelected
                          ? opt.activeClass
                          : `${opt.idleClass} ${isLocked ? 'opacity-60' : ''}`
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 07. Acção a seguir */}
            <div>
              <span className="block text-sm font-bold text-brand-900 mb-2">
                07. Acção a seguir <span className="text-red-500">*</span>
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {ACTION_OPTIONS.map((act) => {
                  const isSelected = visit.nextAction === act;
                  return (
                    <button
                      key={act}
                      type="button"
                      disabled={isLocked}
                      onClick={() => handleSelectNextAction(act)}
                      className={`min-h-[44px] py-2.5 px-3 rounded-xl border text-xs font-bold transition text-center ${
                        isSelected
                          ? 'border-brand-900 bg-brand-900 text-white shadow-sm'
                          : `border-sky-200/80 bg-brand-surface text-brand-900 ${
                              isLocked ? 'opacity-60' : 'hover:bg-sky-100/70'
                            }`
                      }`}
                    >
                      {act}
                    </button>
                  );
                })}
              </div>

              {visit.nextAction === 'Outro' && (
                <div className="mt-3">
                  <label
                    htmlFor="field-other-action"
                    className="block text-xs font-bold text-brand-900 mb-1"
                  >
                    Especifique a acção a seguir:
                  </label>
                  <input
                    type="text"
                    id="field-other-action"
                    disabled={isLocked}
                    value={visit.otherAction}
                    onChange={(e) => handleFieldChange('otherAction', e.target.value)}
                    placeholder="Descreva qual será o próximo passo..."
                    className="w-full min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-300 focus:border-brand-cyan focus:outline-none text-sm"
                  />
                </div>
              )}
            </div>
          </form>

          {/* Actions & Navigation */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 space-y-3">
            {!isLocked ? (
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={handleLockAndAdvance}
                  className="w-full min-h-[48px] py-3.5 px-5 rounded-xl bg-brand-gold hover:bg-brand-goldHover text-brand-950 font-extrabold text-sm sm:text-base shadow-sm active:scale-[0.99] transition flex items-center justify-center gap-2.5"
                >
                  <Lock className="w-4 h-4 text-brand-900 shrink-0" />
                  <span>
                    {currentIndex < lastVisitIndex
                      ? `Trancar visita e avançar (${nextNumStr})`
                      : 'Trancar visita e ver resumo'}
                  </span>
                </button>

                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={handleLockOnly}
                    className="w-full min-h-[44px] py-3 px-3 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200 font-bold text-xs sm:text-sm transition flex items-center justify-center gap-2"
                  >
                    <Lock className="w-4 h-4 shrink-0" />
                    <span>Trancar visita</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveDraft}
                    className="w-full min-h-[44px] py-3 px-3 rounded-xl bg-brand-surface hover:bg-sky-100/70 text-brand-900 border border-sky-200/80 font-bold text-xs sm:text-sm transition flex items-center justify-center gap-2"
                  >
                    <Save className="w-4 h-4 text-brand-cyan shrink-0" />
                    <span>Guardar rascunho</span>
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleNext}
                className="w-full min-h-[48px] py-3.5 px-5 rounded-xl bg-brand-900 hover:bg-brand-800 text-white font-bold text-sm sm:text-base shadow-sm active:scale-[0.99] transition flex items-center justify-center gap-2"
              >
                <span>
                  {currentIndex < lastVisitIndex
                    ? `Próxima empresa (Visita ${nextNumStr})`
                    : 'Concluir e ver resumo diário'}
                </span>
                <ArrowRight className="w-4 h-4 text-brand-gold" />
              </button>
            )}

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
              <button
                type="button"
                disabled={currentIndex === 0}
                onClick={handlePrev}
                className="min-h-[44px] px-3.5 py-2.5 rounded-xl bg-brand-surface hover:bg-sky-100/70 text-brand-900 font-semibold text-xs sm:text-sm transition flex items-center gap-1.5 disabled:opacity-40 whitespace-nowrap"
              >
                <ChevronLeft className="w-4 h-4 text-brand-cyan" />
                <span>Anterior</span>
              </button>

              <button
                type="button"
                onClick={() => onNavigate('dashboard')}
                className="min-h-[44px] px-4 py-2.5 rounded-xl text-brand-900 hover:bg-brand-surface font-bold text-xs sm:text-sm transition whitespace-nowrap"
              >
                Painel
              </button>

              <button
                type="button"
                onClick={handleNext}
                className="min-h-[44px] px-3.5 py-2.5 rounded-xl bg-brand-surface hover:bg-sky-100/70 text-brand-900 font-semibold text-xs sm:text-sm transition flex items-center gap-1.5 whitespace-nowrap"
              >
                {currentIndex === lastVisitIndex ? (
                  <>
                    <span>Ver Resumo</span>
                    <ClipboardCheck className="w-4 h-4 text-brand-cyan" />
                  </>
                ) : (
                  <>
                    <span>Próxima</span>
                    <ChevronRight className="w-4 h-4 text-brand-cyan" />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
