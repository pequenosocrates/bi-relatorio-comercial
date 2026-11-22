import {
  AlertCircle,
  Briefcase,
  Eye,
  EyeOff,
  KeyRound,
  LogIn,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import type { UserRole } from '../types/report';
import {
  CODE_REGEX,
  saveHashedAccessCode,
  STORAGE_KEYS,
  verifyAccessCode,
} from '../utils/storage';
import { BiLogo } from './BiLogo';

interface AuthScreenProps {
  hasConfiguredSellerCode: boolean;
  hasConfiguredAdminCode: boolean;
  onAuthenticated: (role: UserRole) => void;
  onToast: (message: string, type: 'success' | 'info' | 'error') => void;
}

const MAX_ATTEMPTS = 5;
const LOCKOUT_SECONDS = 30;

export function AuthScreen({
  hasConfiguredSellerCode,
  hasConfiguredAdminCode,
  onAuthenticated,
  onToast,
}: AuthScreenProps) {
  const [selectedRole, setSelectedRole] = useState<UserRole>('seller');
  const [accessCode, setAccessCode] = useState('');
  const [showCode, setShowCode] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const [newCode, setNewCode] = useState('');
  const [confirmCode, setConfirmCode] = useState('');
  const [managerNameInput, setManagerNameInput] = useState(
    () => localStorage.getItem(STORAGE_KEYS.MANAGER_NAME) || ''
  );
  const [setupError, setSetupError] = useState('');

  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const timer = window.setTimeout(() => {
      setCooldownSeconds((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [cooldownSeconds]);

  const sanitizeCode = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, '');

  const isRoleConfigured =
    selectedRole === 'admin' ? hasConfiguredAdminCode : hasConfiguredSellerCode;

  const handleRoleSwitch = (role: UserRole) => {
    setSelectedRole(role);
    setAccessCode('');
    setNewCode('');
    setConfirmCode('');
    setLoginError('');
    setSetupError('');
    setShowCode(false);
  };

  const handleLoginSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting || cooldownSeconds > 0) return;

    const code = accessCode.trim().toUpperCase();
    if (!CODE_REGEX.test(code)) {
      setLoginError(
        `Formato inválido. Utilize 2 letras maiúsculas e 3 números (ex: ${
          selectedRole === 'admin' ? 'AD999' : 'AB123'
        }).`
      );
      return;
    }

    setSubmitting(true);
    try {
      const ok = await verifyAccessCode(code, selectedRole);
      if (!ok) {
        const nextAttempts = failedAttempts + 1;
        setFailedAttempts(nextAttempts);
        if (nextAttempts >= MAX_ATTEMPTS) {
          setCooldownSeconds(LOCKOUT_SECONDS);
          setFailedAttempts(0);
          setLoginError(
            `Demasiadas tentativas incorrectas. Aguarde ${LOCKOUT_SECONDS} segundos para tentar novamente.`
          );
        } else {
          setLoginError(
            `Palavra-passe incorrecta (${MAX_ATTEMPTS - nextAttempts} tentativa(s) restante(s)).`
          );
        }
        return;
      }

      setFailedAttempts(0);
      setAccessCode('');
      setShowCode(false);
      setLoginError('');
      sessionStorage.setItem(STORAGE_KEYS.AUTH_SESSION, 'true');
      sessionStorage.setItem(STORAGE_KEYS.AUTH_ROLE, selectedRole);
      onAuthenticated(selectedRole);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSetupSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    const first = newCode.trim().toUpperCase();
    const second = confirmCode.trim().toUpperCase();

    if (!CODE_REGEX.test(first)) {
      setSetupError(
        `Formato inválido. Utilize exactamente 2 letras maiúsculas e 3 números (ex: ${
          selectedRole === 'admin' ? 'AD999' : 'AB123'
        }).`
      );
      return;
    }

    if (first !== second) {
      setSetupError('As palavras-passe introduzidas não coincidem.');
      return;
    }

    setSubmitting(true);
    try {
      if (selectedRole === 'admin' && managerNameInput.trim()) {
        localStorage.setItem(STORAGE_KEYS.MANAGER_NAME, managerNameInput.trim());
      }
      await saveHashedAccessCode(first, selectedRole);
      setNewCode('');
      setConfirmCode('');
      setSetupError('');
      sessionStorage.setItem(STORAGE_KEYS.AUTH_SESSION, 'true');
      sessionStorage.setItem(STORAGE_KEYS.AUTH_ROLE, selectedRole);
      onToast(
        selectedRole === 'admin'
          ? 'Código de Administrador configurado com sucesso!'
          : 'Palavra-passe criada e guardada com sucesso!',
        'success'
      );
      onAuthenticated(selectedRole);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center items-center p-5 bg-gradient-to-br from-brand-950 via-brand-900 to-brand-800">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-white/20 p-7 sm:p-9">
        <div className="flex items-center gap-3.5 mb-5">
          <div className="w-16 h-14 rounded-2xl bg-brand-surface border border-sky-200/80 flex items-center justify-center shrink-0 px-2">
            <BiLogo />
          </div>
          <div>
            <p className="text-xs font-semibold text-brand-cyan">Business Intelligence · Grupo CTS</p>
            <h1 className="text-xl font-extrabold text-brand-900 tracking-tight leading-tight">
              Relatório Comercial Diário
            </h1>
          </div>
        </div>

        {/* Access Mode Switcher: Vendedor vs Administrador / Gestor */}
        <div
          role="tablist"
          aria-label="Modo de acesso"
          className="grid grid-cols-2 gap-1.5 p-1 rounded-2xl bg-brand-surface border border-slate-200 mb-5"
        >
          <button
            type="button"
            role="tab"
            aria-selected={selectedRole === 'seller'}
            onClick={() => handleRoleSwitch('seller')}
            className={`min-h-[42px] px-3 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 ${
              selectedRole === 'seller'
                ? 'bg-brand-900 text-white shadow-xs'
                : 'text-slate-600 hover:text-brand-900'
            }`}
          >
            <UserCheck className="w-3.5 h-3.5" />
            <span>Acesso Vendedor</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={selectedRole === 'admin'}
            onClick={() => handleRoleSwitch('admin')}
            className={`min-h-[42px] px-3 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 ${
              selectedRole === 'admin'
                ? 'bg-brand-900 text-white shadow-xs'
                : 'text-slate-600 hover:text-brand-900'
            }`}
          >
            <Briefcase className="w-3.5 h-3.5" />
            <span>Administrador / Gestor</span>
          </button>
        </div>

        <p className="text-slate-500 text-sm mb-5 leading-relaxed">
          {selectedRole === 'admin'
            ? isRoleConfigured
              ? 'Acesso humanizado de gestão: consulte visitas concluídas, indicadores e envie recomendações de apoio.'
              : 'Configure o código pessoal de Administrador / Gestor para apoiar a equipa nos relatórios concluídos.'
            : isRoleConfigured
              ? 'Plataforma móvel de registo comercial no terreno. Introduza a sua palavra-passe de acesso.'
              : 'Configure a sua palavra-passe pessoal para proteger os seus relatórios comerciais.'}
        </p>

        {isRoleConfigured ? (
          <form onSubmit={handleLoginSubmit} className="space-y-5" noValidate>
            <div>
              <label
                htmlFor="access-code-input"
                className="block text-xs font-bold text-brand-900 mb-2"
              >
                {selectedRole === 'admin'
                  ? 'Código de Administrador (5 caracteres)'
                  : 'Código de Acesso do Vendedor (5 caracteres)'}
              </label>
              <div className="relative">
                <input
                  type={showCode ? 'text' : 'password'}
                  id="access-code-input"
                  maxLength={5}
                  disabled={cooldownSeconds > 0}
                  autoComplete="off"
                  placeholder="Ex: •••••"
                  value={accessCode}
                  onChange={(e) => {
                    setAccessCode(sanitizeCode(e.target.value));
                    setLoginError('');
                  }}
                  className="w-full text-center font-mono tracking-[0.4em] text-2xl font-bold uppercase px-4 py-4 rounded-2xl border-2 border-slate-200 focus:border-brand-cyan focus:outline-none transition bg-brand-surface focus:bg-white text-brand-900 disabled:opacity-60"
                />
                <button
                  type="button"
                  onClick={() => setShowCode((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-brand-900 min-w-[44px] min-h-[44px] flex items-center justify-center"
                  aria-label={showCode ? 'Ocultar código' : 'Mostrar código'}
                >
                  {showCode ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              {loginError && (
                <p className="text-red-600 text-xs font-medium mt-2 flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{loginError}</span>
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={submitting || cooldownSeconds > 0}
              className="w-full min-h-[48px] py-3.5 px-6 rounded-xl bg-brand-gold hover:bg-brand-goldHover text-brand-950 font-extrabold text-base shadow-md active:scale-[0.99] transition flex items-center justify-center gap-2 disabled:opacity-60"
            >
              <LogIn className="w-5 h-5" />
              <span>
                {cooldownSeconds > 0
                  ? `Aguarde ${cooldownSeconds}s...`
                  : selectedRole === 'admin'
                    ? 'Aceder como Gestor'
                    : 'Aceder à Plataforma'}
              </span>
            </button>
          </form>
        ) : (
          <form onSubmit={handleSetupSubmit} className="space-y-4" noValidate>
            <div className="p-3.5 rounded-2xl bg-sky-50 border border-sky-200 text-xs text-brand-900 leading-relaxed">
              <strong>Primeiro acesso ({selectedRole === 'admin' ? 'Gestor' : 'Vendedor'}):</strong>{' '}
              Crie um código pessoal com exactamente{' '}
              <strong>2 letras maiúsculas e 3 números</strong> (ex:{' '}
              <code className="font-mono font-bold text-brand-cyan">
                {selectedRole === 'admin' ? 'AD999' : 'AB123'}
              </code>
              ).
            </div>

            {selectedRole === 'admin' && (
              <div>
                <label
                  htmlFor="manager-name-setup"
                  className="block text-xs font-bold text-brand-900 mb-1.5"
                >
                  Nome do Gestor / Administrador
                </label>
                <input
                  type="text"
                  id="manager-name-setup"
                  value={managerNameInput}
                  onChange={(e) => setManagerNameInput(e.target.value)}
                  placeholder="Ex: Director Comercial"
                  className="w-full min-h-[44px] px-4 py-3 rounded-2xl border-2 border-slate-200 focus:border-brand-cyan focus:outline-none transition bg-brand-surface focus:bg-white text-sm font-semibold text-brand-900"
                />
              </div>
            )}

            <div>
              <label
                htmlFor="new-code-input"
                className="block text-xs font-bold text-brand-900 mb-1.5"
              >
                {selectedRole === 'admin'
                  ? 'Criar Código de Administrador (5 caracteres)'
                  : 'Criar Palavra-Passe (5 caracteres)'}
              </label>
              <input
                type="password"
                id="new-code-input"
                maxLength={5}
                autoComplete="off"
                placeholder={selectedRole === 'admin' ? 'Ex: AD999' : 'Ex: AB123'}
                value={newCode}
                onChange={(e) => {
                  setNewCode(sanitizeCode(e.target.value));
                  setSetupError('');
                }}
                className="w-full text-center font-mono tracking-[0.4em] text-xl font-bold uppercase px-4 py-3.5 rounded-2xl border-2 border-slate-200 focus:border-brand-cyan focus:outline-none transition bg-brand-surface focus:bg-white text-brand-900"
              />
            </div>

            <div>
              <label
                htmlFor="confirm-code-input"
                className="block text-xs font-bold text-brand-900 mb-1.5"
              >
                Confirmar Código
              </label>
              <input
                type="password"
                id="confirm-code-input"
                maxLength={5}
                autoComplete="off"
                placeholder="Repita o código"
                value={confirmCode}
                onChange={(e) => {
                  setConfirmCode(sanitizeCode(e.target.value));
                  setSetupError('');
                }}
                className="w-full text-center font-mono tracking-[0.4em] text-xl font-bold uppercase px-4 py-3.5 rounded-2xl border-2 border-slate-200 focus:border-brand-cyan focus:outline-none transition bg-brand-surface focus:bg-white text-brand-900"
              />
            </div>

            {setupError && (
              <p className="text-red-600 text-xs font-medium flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{setupError}</span>
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full min-h-[48px] py-3.5 px-6 rounded-xl bg-brand-gold hover:bg-brand-goldHover text-brand-950 font-extrabold text-base shadow-md active:scale-[0.99] transition flex items-center justify-center gap-2 disabled:opacity-60"
            >
              <KeyRound className="w-5 h-5" />
              <span>Guardar e Entrar</span>
            </button>
          </form>
        )}

        <div className="mt-7 pt-5 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <span className="flex items-center gap-1.5 font-medium text-brand-900/80">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            Grupo CTS · Maputo
          </span>
          <span className="text-brand-cyan font-semibold">Armazenamento Local</span>
        </div>
      </div>
    </div>
  );
}
