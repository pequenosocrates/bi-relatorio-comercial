import { Database, Download, ShieldCheck, Trash2, Upload } from 'lucide-react';
import { useRef, useState, type ChangeEvent } from 'react';
import type { ModalConfig, ToastType, UserRole, ViewName, Visit } from '../types/report';
import type { GoogleAuthSnapshot } from '../utils/driveSync';
import { downloadBackupJson } from '../utils/export';
import {
  clearDemoHistoricalReports,
  CODE_REGEX,
  formatDatePT,
  generateDemoHistoricalReports,
  getSavedReportDates,
  restoreReportEntriesFromJson,
  saveHashedAccessCode,
  STORAGE_KEYS,
} from '../utils/storage';
import { CloudSyncCard } from './CloudSyncCard';

interface SettingsViewProps {
  activeDateISO: string;
  currentDateISO: string;
  userRole: UserRole;
  sellerName: string;
  managerName: string;
  visits: Visit[];
  authSnapshot: GoogleAuthSnapshot;
  onAuthSnapshotChange: (snapshot: GoogleAuthSnapshot) => void;
  onRequestConfirmModal: (config: ModalConfig) => void;
  onReportsRestored: (dates: string[]) => void;
  onSaveSellerName: (name: string) => void;
  onSaveManagerName: (name: string) => void;
  onSwitchDate: (dateISO: string) => void;
  onConfirmReset: () => void;
  onNavigate: (view: ViewName) => void;
  onToast: (message: string, type: ToastType) => void;
}

export function SettingsView({
  activeDateISO,
  currentDateISO,
  userRole,
  sellerName,
  managerName,
  visits,
  authSnapshot,
  onAuthSnapshotChange,
  onRequestConfirmModal,
  onReportsRestored,
  onSaveSellerName,
  onSaveManagerName,
  onSwitchDate,
  onConfirmReset,
  onNavigate,
  onToast,
}: SettingsViewProps) {
  const isAdmin = userRole === 'admin';
  const [nameInput, setNameInput] = useState(sellerName);
  const [managerNameInput, setManagerNameInput] = useState(managerName);
  const [codeInput, setCodeInput] = useState('');
  const [adminCodeInput, setAdminCodeInput] = useState('');
  const [hasAdminCodeConfigured, setHasAdminCodeConfigured] = useState(() =>
    Boolean(localStorage.getItem(STORAGE_KEYS.ADMIN_CONFIG_CODE))
  );
  const [savedDates, setSavedDates] = useState<string[]>(() => getSavedReportDates());
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleSaveName = () => {
    const trimmed = nameInput.trim();
    if (!trimmed) {
      onToast('Introduza o nome do vendedor.', 'error');
      return;
    }
    onSaveSellerName(trimmed);
  };

  const handleSaveManager = () => {
    const trimmed = managerNameInput.trim();
    if (!trimmed) {
      onToast('Introduza o nome do gestor ou administrador.', 'error');
      return;
    }
    onSaveManagerName(trimmed);
  };

  const handleUpdateCode = async () => {
    const sanitized = codeInput.trim().toUpperCase();
    if (!CODE_REGEX.test(sanitized)) {
      onToast('Formato inválido! Use 2 letras maiúsculas e 3 números (ex: AB123).', 'error');
      return;
    }
    await saveHashedAccessCode(sanitized, 'seller');
    setCodeInput('');
    onToast('Código de vendedor actualizado com encriptação SHA-256!', 'success');
  };

  const handleUpdateAdminCode = async () => {
    const sanitized = adminCodeInput.trim().toUpperCase();
    if (!CODE_REGEX.test(sanitized)) {
      onToast('Formato inválido! Use 2 letras maiúsculas e 3 números (ex: AD999).', 'error');
      return;
    }
    await saveHashedAccessCode(sanitized, 'admin');
    setHasAdminCodeConfigured(true);
    setAdminCodeInput('');
    onToast('Código de Administrador / Gestor guardado com encriptação SHA-256!', 'success');
  };

  const handleGenerateDemo = () => {
    const count = generateDemoHistoricalReports();
    setSavedDates(getSavedReportDates());
    if (count > 0) {
      onToast(
        `${count} dia(s) de demonstração gerados para testar os gráficos anuais (registos reais mantidos).`,
        'success'
      );
    } else {
      onToast('Os dados de demonstração já se encontram disponíveis.', 'info');
    }
  };

  const handleClearDemo = () => {
    const removed = clearDemoHistoricalReports();
    setSavedDates(getSavedReportDates());
    if (removed > 0) {
      onToast(`${removed} dia(s) de demonstração removidos. Registos reais intactos.`, 'info');
    } else {
      onToast('Não existem dados de demonstração para remover.', 'info');
    }
  };

  const handleImportBackup = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    try {
      const text = await file.text();
      const result = restoreReportEntriesFromJson(text);
      setSavedDates(getSavedReportDates());
      onReportsRestored(result.restoredDates);
      onToast(
        `${result.restoredDates.length} relatório(s) restaurado(s) com sucesso!`,
        'success'
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Não foi possível importar o ficheiro JSON.';
      onToast(msg, 'error');
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
      <section className="lg:col-span-7 bg-white rounded-2xl p-5 sm:p-6 border border-slate-200 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-extrabold text-brand-900">
              {isAdmin ? 'Definições de Administrador / Gestor' : 'Definições do Vendedor'}
            </h2>
            {isAdmin && (
              <p className="text-xs text-slate-500 mt-0.5">
                Perfil de apoio comercial. Os registos e definições do vendedor permanecem protegidos.
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => onNavigate(isAdmin ? 'admin' : 'dashboard')}
            className="min-h-[40px] px-4 py-2 rounded-xl bg-brand-surface hover:bg-sky-100 text-brand-900 font-bold text-xs transition shrink-0"
          >
            Voltar
          </button>
        </div>

        {/* Admin / Manager Identity & Access Code (Visible to Admin, or initial setup by Seller) */}
        {(isAdmin || !hasAdminCodeConfigured) && (
          <div className="rounded-2xl bg-brand-surface border border-sky-200/80 p-4 sm:p-5 space-y-4">
            <div className="flex items-center gap-2 text-brand-900">
              <ShieldCheck className="w-4 h-4 text-brand-cyan shrink-0" />
              <h3 className="text-sm font-extrabold">
                Perfil de Administrador / Gestor
              </h3>
            </div>

            <div>
              <label
                htmlFor="settings-manager-name"
                className="block text-xs font-bold text-brand-900 mb-1.5"
              >
                Nome do Gestor (Identificação nos comentários de apoio)
              </label>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  id="settings-manager-name"
                  value={managerNameInput}
                  onChange={(e) => setManagerNameInput(e.target.value)}
                  placeholder="Ex.: Direcção Comercial · João Silva"
                  className="flex-1 min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-300 bg-white focus:border-brand-cyan focus:outline-none text-sm"
                />
                <button
                  type="button"
                  onClick={handleSaveManager}
                  className="min-h-[44px] px-5 py-2.5 rounded-xl bg-brand-gold hover:bg-brand-goldHover text-brand-950 font-extrabold text-sm transition shadow-xs whitespace-nowrap"
                >
                  Guardar Nome
                </button>
              </div>
            </div>

            <div className="pt-3 border-t border-sky-200/60">
              <label
                htmlFor="settings-admin-code"
                className="block text-xs font-bold text-brand-900 mb-1.5"
              >
                {hasAdminCodeConfigured
                  ? 'Alterar Código de Administrador / Gestor'
                  : 'Configurar Código de Administrador / Gestor (1.ª utilização)'}
              </label>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="password"
                  id="settings-admin-code"
                  maxLength={5}
                  autoComplete="off"
                  value={adminCodeInput}
                  onChange={(e) =>
                    setAdminCodeInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))
                  }
                  placeholder="Ex: AD999"
                  className="sm:w-44 min-h-[44px] text-center uppercase font-mono font-bold tracking-widest px-4 py-2.5 rounded-xl border border-slate-300 bg-white focus:border-brand-cyan focus:outline-none text-base text-brand-900"
                />
                <button
                  type="button"
                  onClick={handleUpdateAdminCode}
                  className="flex-1 min-h-[44px] px-4 py-2.5 rounded-xl bg-brand-900 hover:bg-brand-800 text-white font-bold text-sm transition whitespace-nowrap"
                >
                  {hasAdminCodeConfigured ? 'Actualizar Código Gestor' : 'Activar Acesso Gestor'}
                </button>
              </div>
              <p className="text-[11px] text-slate-500 mt-1.5">
                Formato obrigatório: 2 letras maiúsculas + 3 números (ex.: AD999). Armazenado de forma cifrada (SHA-256).
              </p>
            </div>
          </div>
        )}

        {!isAdmin && (
          <>
            {/* Seller Name */}
            <div>
              <label
                htmlFor="settings-seller-name"
                className="block text-sm font-bold text-brand-900 mb-1.5"
              >
                Nome do vendedor (Assinatura nos relatórios)
              </label>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  id="settings-seller-name"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  placeholder="Introduza o seu nome completo"
                  className="flex-1 min-h-[44px] px-4 py-3 rounded-xl border border-slate-300 focus:border-brand-cyan focus:outline-none text-base"
                />
                <button
                  type="button"
                  onClick={handleSaveName}
                  className="min-h-[44px] px-5 py-3 rounded-xl bg-brand-gold hover:bg-brand-goldHover text-brand-950 font-extrabold text-sm transition shadow-sm whitespace-nowrap"
                >
                  Guardar
                </button>
              </div>
              <p className="text-xs text-slate-500 mt-1.5">
                Este nome ficará guardado automaticamente para os relatórios seguintes.
              </p>
            </div>

            {/* Seller Access Code Configuration */}
            <div className="pt-5 border-t border-slate-100">
              <label
                htmlFor="settings-access-code"
                className="block text-sm font-bold text-brand-900 mb-1.5"
              >
                Alterar Código de Acesso (Vendedor)
              </label>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="password"
                  id="settings-access-code"
                  maxLength={5}
                  autoComplete="off"
                  value={codeInput}
                  onChange={(e) =>
                    setCodeInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))
                  }
                  placeholder="Novo PIN (Ex: AB123)"
                  className="sm:w-44 min-h-[44px] text-center uppercase font-mono font-bold tracking-widest px-4 py-3 rounded-xl border border-slate-300 focus:border-brand-cyan focus:outline-none text-base text-brand-900"
                />
                <button
                  type="button"
                  onClick={handleUpdateCode}
                  className="flex-1 min-h-[44px] px-4 py-3 rounded-xl bg-brand-900 hover:bg-brand-800 text-white font-bold text-sm transition whitespace-nowrap"
                >
                  Actualizar Código
                </button>
              </div>
              <p className="text-xs text-slate-500 mt-1.5">
                Requer exactamente 2 letras maiúsculas e 3 números (ex: XY789). Guardado de forma cifrada (SHA-256).
              </p>
            </div>

            {/* Local Backup & Restore (.json) */}
            <div className="pt-5 border-t border-slate-100">
              <h3 className="text-sm font-bold text-brand-900 mb-1">
                Cópia de Segurança Local (Exportar &amp; Restaurar)
              </h3>
              <p className="text-xs text-slate-500 mb-3">
                Exporte todos os dias guardados num único ficheiro JSON ou restaure um backup anterior ao mudar de telemóvel.
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={handleImportBackup}
              />
              <div className="flex flex-col sm:flex-row gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    downloadBackupJson(activeDateISO);
                    onToast('Cópia de segurança completa descarregada!', 'success');
                  }}
                  className="flex-1 min-h-[44px] py-2.5 px-4 rounded-xl bg-brand-surface hover:bg-sky-100 text-brand-900 border border-slate-200 font-bold text-xs sm:text-sm transition flex items-center justify-center gap-2"
                >
                  <Download className="w-4 h-4 text-brand-cyan shrink-0" />
                  <span>Exportar Backup Completo (.json)</span>
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-1 min-h-[44px] py-2.5 px-4 rounded-xl bg-white hover:bg-sky-50 text-brand-900 border border-sky-200 font-bold text-xs sm:text-sm transition flex items-center justify-center gap-2"
                >
                  <Upload className="w-4 h-4 text-brand-cyan shrink-0" />
                  <span>Importar / Restaurar (.json)</span>
                </button>
              </div>
            </div>

            {/* Demo Historical Data for Annual Analytics */}
            <div className="pt-5 border-t border-slate-100">
              <h3 className="text-sm font-bold text-brand-900 mb-1">
                Dados de Demonstração (Gráficos Anuais)
              </h3>
              <p className="text-xs text-slate-500 mb-3">
                Opcional: gere alguns dias históricos de exemplo para visualizar os gráficos anuais sem
                afectar nem apagar os seus registos reais.
              </p>
              <div className="flex flex-col sm:flex-row gap-2.5">
                <button
                  type="button"
                  onClick={handleGenerateDemo}
                  className="flex-1 min-h-[44px] py-2.5 px-4 rounded-xl bg-sky-50 hover:bg-sky-100 text-brand-900 border border-sky-200 font-bold text-xs sm:text-sm transition flex items-center justify-center gap-2"
                >
                  <Database className="w-4 h-4 text-brand-cyan shrink-0" />
                  <span>Gerar Histórico de Demonstração</span>
                </button>
                <button
                  type="button"
                  onClick={handleClearDemo}
                  className="min-h-[44px] py-2.5 px-4 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-semibold text-xs sm:text-sm transition"
                >
                  Limpar Demonstração
                </button>
              </div>
            </div>

            {/* Danger Zone */}
            <div className="pt-5 border-t border-red-100">
              <h3 className="text-sm font-bold text-red-700 mb-1">Zona de Segurança</h3>
              <p className="text-xs text-slate-500 mb-3">
                Apenas utilize esta opção caso pretenda apagar todos os registos do dia actual (
                <span className="font-mono tabular-nums">{formatDatePT(activeDateISO)}</span>) e
                recomeçar do zero.
              </p>
              <button
                type="button"
                onClick={onConfirmReset}
                className="w-full min-h-[44px] py-3 px-4 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 font-bold text-sm transition flex items-center justify-center gap-2"
              >
                <Trash2 className="w-4 h-4 shrink-0" />
                <span>Reiniciar relatório de hoje</span>
              </button>
            </div>
          </>
        )}
      </section>

      {/* Right Column: Cloud Sync & Saved Reports History */}
      <div className="lg:col-span-5 space-y-5">
        {!isAdmin && (
          <CloudSyncCard
            activeDateISO={activeDateISO}
            visits={visits}
            sellerName={sellerName}
            authSnapshot={authSnapshot}
            onAuthSnapshotChange={onAuthSnapshotChange}
            onRequestConfirmModal={onRequestConfirmModal}
            onReportsRestored={(dates) => {
              setSavedDates(getSavedReportDates());
              onReportsRestored(dates);
            }}
            onToast={onToast}
            compact
          />
        )}

        <section className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200">
          <h3 className="text-base font-extrabold text-brand-900 mb-3">
            Relatórios Guardados por Data
          </h3>

          {savedDates.length === 0 ? (
            <p className="text-xs text-slate-500">Nenhum relatório guardado encontrado.</p>
          ) : (
            <div className="space-y-2.5 max-h-[520px] overflow-y-auto pr-1">
              {savedDates.map((dateISO) => {
                const isSelected = dateISO === activeDateISO;
                const isToday = dateISO === currentDateISO;
                return (
                  <div
                    key={dateISO}
                    className={`flex items-center justify-between p-3.5 rounded-xl border ${
                      isSelected
                        ? 'bg-sky-50 border-sky-200'
                        : 'bg-brand-surface border-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-slate-800 font-mono tabular-nums">
                        {formatDatePT(dateISO)}
                      </span>
                      {isToday && (
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-brand-900 text-white">
                          Hoje
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => onSwitchDate(dateISO)}
                      className={`min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-bold transition ${
                        isSelected
                          ? 'bg-brand-cyan text-white'
                          : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {isSelected ? 'Activo' : 'Abrir'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
