import { HeartHandshake, MessageSquarePlus, Send } from 'lucide-react';
import { useState } from 'react';
import type { SupportComment, UserRole } from '../types/report';

interface SupportFeedbackCardProps {
  title?: string;
  subtitle?: string;
  comments: SupportComment[];
  currentRole: UserRole;
  authorName: string;
  onAddComment: (comment: SupportComment) => void;
  allowSellerReply?: boolean;
  compact?: boolean;
}

const ADMIN_CONSTRUCTIVE_PROMPTS = [
  'Excelente levantamento das necessidades do cliente.',
  'Sugiro apresentar caso prático de controlo de stock na próxima etapa.',
  'Boa oportunidade para avançar com proposta comercial objectiva.',
  'Validar decisor financeiro antes do fecho da proposta.',
];

export function SupportFeedbackCard({
  title = 'Recomendações & Apoio da Gestão',
  subtitle,
  comments,
  currentRole,
  authorName,
  onAddComment,
  allowSellerReply = true,
  compact = false,
}: SupportFeedbackCardProps) {
  const [draft, setDraft] = useState('');

  const canCompose = currentRole === 'admin' || (allowSellerReply && comments.length > 0);
  if (currentRole === 'seller' && comments.length === 0) {
    return null;
  }

  const handleSubmit = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;

    const fallbackName =
      currentRole === 'admin' ? 'Gestor Comercial BI' : 'Vendedor';

    onAddComment({
      id: `cmt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      authorName: authorName.trim() || fallbackName,
      authorRole: currentRole,
      message: trimmed,
      createdAt: new Date().toISOString(),
    });
    setDraft('');
  };

  return (
    <div
      className={`rounded-2xl border border-sky-200 bg-sky-50/55 ${
        compact ? 'p-4' : 'p-5'
      } space-y-3`}
    >
      <div className="flex items-start gap-2.5">
        <div className="w-8 h-8 rounded-xl bg-brand-900 text-brand-gold flex items-center justify-center shrink-0">
          <HeartHandshake className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <h4 className="text-sm font-extrabold text-brand-900">{title}</h4>
          <p className="text-xs text-slate-600">
            {subtitle ||
              (currentRole === 'admin'
                ? 'Partilhe orientações construtivas e apoio estratégico para esta visita concluída.'
                : 'Feedback e recomendações de apoio deixadas pela gestão para potenciar o fecho.')}
          </p>
        </div>
      </div>

      {comments.length > 0 && (
        <div className="space-y-2">
          {comments.map((c) => {
            const isManager = c.authorRole === 'admin';
            const dateStr = (() => {
              try {
                return new Date(c.createdAt).toLocaleString('pt-PT', {
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
                key={c.id}
                className={`rounded-xl p-3 border text-xs sm:text-sm ${
                  isManager
                    ? 'bg-white border-sky-200'
                    : 'bg-emerald-50/70 border-emerald-200 ml-3 sm:ml-6'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${
                        isManager
                          ? 'bg-brand-900 text-white'
                          : 'bg-emerald-700 text-white'
                      }`}
                    >
                      {isManager ? 'Gestão' : 'Vendedor'}
                    </span>
                    <span className="font-bold text-brand-900 text-xs">{c.authorName}</span>
                  </div>
                  {dateStr && (
                    <span className="text-[11px] font-mono tabular-nums text-slate-400">
                      {dateStr}
                    </span>
                  )}
                </div>
                <p className="text-slate-700 leading-relaxed whitespace-pre-wrap">{c.message}</p>
              </div>
            );
          })}
        </div>
      )}

      {canCompose && (
        <div className="space-y-2 pt-1">
          {currentRole === 'admin' && (
            <div className="flex flex-wrap gap-1.5">
              {ADMIN_CONSTRUCTIVE_PROMPTS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() =>
                    setDraft((prev) => (prev.trim() ? `${prev.trim()} ${suggestion}` : suggestion))
                  }
                  className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-white hover:bg-sky-100 text-brand-900 border border-sky-200 transition text-left"
                >
                  + {suggestion}
                </button>
              ))}
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              placeholder={
                currentRole === 'admin'
                  ? 'Escreva uma recomendação construtiva ou sugestão de abordagem...'
                  : 'Responder com uma nota de retorno para a gestão...'
              }
              className="flex-1 min-h-[42px] px-3.5 py-2 rounded-xl border border-sky-200 bg-white focus:border-brand-cyan focus:outline-none text-xs sm:text-sm"
            />
            <button
              type="button"
              disabled={!draft.trim()}
              onClick={handleSubmit}
              className="min-h-[42px] px-4 py-2 rounded-xl bg-brand-900 hover:bg-brand-800 text-white font-bold text-xs inline-flex items-center justify-center gap-1.5 transition disabled:opacity-50 shrink-0"
            >
              {currentRole === 'admin' ? (
                <MessageSquarePlus className="w-3.5 h-3.5 text-brand-gold" />
              ) : (
                <Send className="w-3.5 h-3.5 text-brand-gold" />
              )}
              <span>
                {currentRole === 'admin' ? 'Enviar Apoio' : 'Enviar Nota'}
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
