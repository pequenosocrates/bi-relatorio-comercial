import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  type ChartOptions,
} from 'chart.js';
import {
  BarChart3,
  Briefcase,
  Calendar,
  CheckCircle2,
  FileText,
  Flame,
  Layers,
  Loader2,
  ShieldCheck,
  Target,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Bar, Doughnut, Line } from 'react-chartjs-2';
import type { ToastType, ViewName, Visit } from '../types/report';
import { exportAnalyticsDashboardToPdf } from '../utils/pdfExport';
import {
  ACTION_OPTIONS,
  formatDatePT,
  getRecordedVisits,
  loadAllReportsByDate,
  PROBABILITY_OPTIONS,
} from '../utils/storage';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface AnalyticsViewProps {
  activeDateISO: string;
  currentVisits: Visit[];
  sellerName?: string;
  isAdminMode?: boolean;
  onNavigate: (view: ViewName) => void;
  onOpenVisit: (index: number) => void;
  onToast?: (message: string, type: ToastType) => void;
}

type PeriodMode = 'daily' | 'weekly' | 'monthly' | 'annual';

const MONTH_LABELS = [
  'Jan',
  'Fev',
  'Mar',
  'Abr',
  'Mai',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Out',
  'Nov',
  'Dez',
];

const MONTH_FULL_LABELS = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

const WEEKDAY_SHORT = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

function toISODate(dt: Date): string {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function getMondayOfWeek(dt: Date): Date {
  const copy = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
  const day = copy.getDay(); // 0=Sun..6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
  return copy;
}

interface WeekOption {
  index: number;
  startISO: string;
  endISO: string;
  label: string;
  days: string[];
}

function getWeeksOfYear(year: number): WeekOption[] {
  const jan1 = new Date(year, 0, 1);
  let cursor = getMondayOfWeek(jan1);
  // If Monday falls before Dec 29 of prev year and Jan 1 is Fri-Sun, move to first Monday inside Jan
  if (cursor.getFullYear() < year && jan1.getDay() !== 1 && jan1.getDay() > 4) {
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 7);
  }

  const weeks: WeekOption[] = [];
  let idx = 1;
  while (cursor.getFullYear() <= year) {
    if (cursor.getFullYear() === year || (cursor.getFullYear() === year - 1 && idx === 1)) {
      const days: string[] = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + i);
        days.push(toISODate(d));
      }
      const startISO = days[0];
      const endISO = days[6];
      const fmtShort = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
      weeks.push({
        index: idx,
        startISO,
        endISO,
        label: `Sem. ${String(idx).padStart(2, '0')} (${fmtShort(startISO)} – ${fmtShort(endISO)})`,
        days,
      });
      idx += 1;
    }
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 7);
    if (cursor.getFullYear() > year) break;
  }
  return weeks;
}

function countBusinessDaysBetween(start: Date, end: Date): number {
  let count = 0;
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const endNorm = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  while (cursor <= endNorm) {
    const day = cursor.getDay();
    if (day >= 1 && day <= 5) {
      count += 1;
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return Math.max(count, 1);
}

function getLast7DaysISO(anchorDateISO: string): string[] {
  const anchor = parseISODate(anchorDateISO);
  const days: string[] = [];
  for (let offset = 6; offset >= 0; offset--) {
    const dt = new Date(anchor);
    dt.setDate(anchor.getDate() - offset);
    days.push(toISODate(dt));
  }
  return days;
}

export function AnalyticsView({
  activeDateISO,
  currentVisits,
  sellerName = '',
  isAdminMode = false,
  onNavigate,
  onOpenVisit,
  onToast,
}: AnalyticsViewProps) {
  const [periodMode, setPeriodMode] = useState<PeriodMode>('daily');
  const [exportingPdf, setExportingPdf] = useState(false);

  const allReports = useMemo(() => loadAllReportsByDate(), [activeDateISO, currentVisits]);

  const availableYears = useMemo(() => {
    const years = new Set<string>();
    years.add(activeDateISO.slice(0, 4));
    years.add(String(new Date().getFullYear()));
    allReports.forEach((r) => {
      if (r.date.length >= 4) years.add(r.date.slice(0, 4));
    });
    return Array.from(years).sort().reverse();
  }, [allReports, activeDateISO]);

  const [selectedDateISO, setSelectedDateISO] = useState<string>(activeDateISO);
  const [selectedYear, setSelectedYear] = useState<string>(activeDateISO.slice(0, 4));
  const [selectedMonth, setSelectedMonth] = useState<number>(
    () => Number(activeDateISO.slice(5, 7)) || 1
  );

  const weeksInSelectedYear = useMemo(
    () => getWeeksOfYear(Number(selectedYear) || new Date().getFullYear()),
    [selectedYear]
  );

  const [selectedWeekStartISO, setSelectedWeekStartISO] = useState<string>(() => {
    const monday = toISODate(getMondayOfWeek(parseISODate(activeDateISO)));
    return monday;
  });

  // Keep selectedWeekStartISO valid when year changes
  const activeWeek = useMemo(() => {
    const exact = weeksInSelectedYear.find((w) => w.startISO === selectedWeekStartISO);
    if (exact) return exact;
    const containingToday = weeksInSelectedYear.find((w) => w.days.includes(activeDateISO));
    return containingToday ?? weeksInSelectedYear[0];
  }, [weeksInSelectedYear, selectedWeekStartISO, activeDateISO]);

  // Use plain Record instead of Map for consistency across codebase
  // In Admin mode, strictly include only concluded & locked visits (humanized non-surveillance rule)
  const reportByDate = useMemo(() => {
    const dict: Record<string, Visit[]> = {};
    allReports.forEach((entry) => {
      dict[entry.date] = isAdminMode
        ? entry.report.visits.filter((v) => v.isLocked)
        : entry.report.visits;
    });
    dict[activeDateISO] = isAdminMode
      ? currentVisits.filter((v) => v.isLocked)
      : currentVisits;
    return dict;
  }, [allReports, activeDateISO, currentVisits, isAdminMode]);

  // Scoped visits & business-day denominator
  const { scopedVisits, businessDaysInPeriod, periodDescription } = useMemo(() => {
    if (periodMode === 'daily') {
      const dayVisits = getRecordedVisits(reportByDate[selectedDateISO] ?? []);
      return {
        scopedVisits: dayVisits,
        businessDaysInPeriod: 1,
        periodDescription: `Dia ${formatDatePT(selectedDateISO)}`,
      };
    }

    if (periodMode === 'weekly') {
      const days = activeWeek?.days ?? [];
      const collected: Visit[] = [];
      days.forEach((iso) => {
        collected.push(...getRecordedVisits(reportByDate[iso] ?? []));
      });
      return {
        scopedVisits: collected,
        businessDaysInPeriod: 5,
        periodDescription: activeWeek ? activeWeek.label : `Semana (${selectedYear})`,
      };
    }

    if (periodMode === 'monthly') {
      const yr = Number(selectedYear);
      const monthPrefix = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-`;
      const daysInMonth = new Date(yr, selectedMonth, 0).getDate();
      const start = new Date(yr, selectedMonth - 1, 1);
      const end = new Date(yr, selectedMonth - 1, daysInMonth);
      const now = new Date();
      const effectiveEnd =
        yr === now.getFullYear() && selectedMonth === now.getMonth() + 1 && now < end ? now : end;

      const collected: Visit[] = [];
      Object.entries(reportByDate).forEach(([date, dayVisits]) => {
        if (date.startsWith(monthPrefix)) {
          collected.push(...getRecordedVisits(dayVisits));
        }
      });

      return {
        scopedVisits: collected,
        businessDaysInPeriod: countBusinessDaysBetween(start, effectiveEnd),
        periodDescription: `${MONTH_FULL_LABELS[selectedMonth - 1]} de ${selectedYear}`,
      };
    }

    // Annual mode
    const yr = Number(selectedYear);
    const start = new Date(yr, 0, 1);
    const end = new Date(yr, 11, 31);
    const now = new Date();
    const effectiveEnd = yr === now.getFullYear() && now < end ? now : end;

    const collected: Visit[] = [];
    Object.entries(reportByDate).forEach(([date, dayVisits]) => {
      if (date.startsWith(`${selectedYear}-`)) {
        collected.push(...getRecordedVisits(dayVisits));
      }
    });

    return {
      scopedVisits: collected,
      businessDaysInPeriod: countBusinessDaysBetween(start, effectiveEnd),
      periodDescription: `Ano ${selectedYear} (Jan – Dez)`,
    };
  }, [periodMode, reportByDate, selectedDateISO, activeWeek, selectedYear, selectedMonth]);

  // 4 Productivity KPIs
  const kpis = useMemo(() => {
    const total = scopedVisits.length;
    const locked = scopedVisits.filter((v) => v.isLocked).length;
    const completionRate = total > 0 ? Math.round((locked / total) * 100) : 0;
    const avgPerBusinessDay =
      businessDaysInPeriod > 0 ? (total / businessDaysInPeriod).toFixed(1) : '0.0';

    const highProbCount = scopedVisits.filter(
      (v) => v.probability === 'Maior' || v.probability === 'Muito maior'
    ).length;
    const potentialIndex = total > 0 ? Math.round((highProbCount / total) * 100) : 0;

    const actionDict: Record<string, number> = {};
    scopedVisits.forEach((v) => {
      if (!v.nextAction) return;
      actionDict[v.nextAction] = (actionDict[v.nextAction] ?? 0) + 1;
    });

    let topAction = 'Sem registos';
    let topActionCount = 0;
    Object.entries(actionDict).forEach(([action, count]) => {
      if (count > topActionCount) {
        topAction = action;
        topActionCount = count;
      }
    });

    return {
      total,
      locked,
      completionRate,
      avgPerBusinessDay,
      highProbCount,
      potentialIndex,
      topAction,
      topActionCount,
    };
  }, [scopedVisits, businessDaysInPeriod]);

  // Chart 1: Volume evolution over selected period
  const evolutionData = useMemo(() => {
    if (periodMode === 'daily') {
      const days = getLast7DaysISO(selectedDateISO);
      const labels = days.map((iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`);
      const values = days.map((iso) => getRecordedVisits(reportByDate[iso] ?? []).length);
      const colors = days.map((iso) => (iso === selectedDateISO ? '#0084C7' : '#192863'));

      return {
        kind: 'bar' as const,
        labels,
        values,
        colors,
        subtitle: `Últimos 7 dias (dia ${formatDatePT(selectedDateISO)} em destaque)`,
      };
    }

    if (periodMode === 'weekly') {
      const days = activeWeek?.days ?? [];
      const labels = days.map(
        (iso, idx) => `${WEEKDAY_SHORT[idx]} ${iso.slice(8, 10)}/${iso.slice(5, 7)}`
      );
      const values = days.map((iso) => getRecordedVisits(reportByDate[iso] ?? []).length);
      const colors = days.map((_, idx) => (idx < 5 ? '#0084C7' : '#F59E0B'));

      return {
        kind: 'bar' as const,
        labels,
        values,
        colors,
        subtitle: `Distribuição de Segunda a Domingo · ${activeWeek?.label ?? ''}`,
      };
    }

    if (periodMode === 'monthly') {
      const yr = Number(selectedYear);
      const daysInMonth = new Date(yr, selectedMonth, 0).getDate();
      const mm = String(selectedMonth).padStart(2, '0');
      const labels = Array.from({ length: daysInMonth }, (_, i) =>
        String(i + 1).padStart(2, '0')
      );
      const values = labels.map((dd) => {
        const iso = `${selectedYear}-${mm}-${dd}`;
        return getRecordedVisits(reportByDate[iso] ?? []).length;
      });

      return {
        kind: 'line' as const,
        labels,
        values,
        colors: ['#0084C7'],
        subtitle: `Evolução diária ao longo de ${MONTH_FULL_LABELS[selectedMonth - 1]} de ${selectedYear}`,
      };
    }

    // Annual
    const monthlyCounts = Array(12).fill(0) as number[];
    Object.entries(reportByDate).forEach(([date, dayVisits]) => {
      if (!date.startsWith(`${selectedYear}-`)) return;
      const monthIdx = Number(date.slice(5, 7)) - 1;
      if (monthIdx >= 0 && monthIdx < 12) {
        monthlyCounts[monthIdx] += getRecordedVisits(dayVisits).length;
      }
    });

    return {
      kind: 'bar' as const,
      labels: MONTH_LABELS,
      values: monthlyCounts,
      colors: monthlyCounts.map((_, idx) => (idx % 2 === 0 ? '#192863' : '#0084C7')),
      subtitle: `Acumulado mensal de Janeiro a Dezembro (${selectedYear})`,
    };
  }, [periodMode, selectedDateISO, activeWeek, selectedYear, selectedMonth, reportByDate]);

  const barEvolutionChartData = useMemo(
    () => ({
      labels: evolutionData.labels,
      datasets: [
        {
          label: 'Visitas registadas',
          data: evolutionData.values,
          backgroundColor: evolutionData.colors,
          borderRadius: 6,
          maxBarThickness: 36,
        },
      ],
    }),
    [evolutionData]
  );

  const lineEvolutionChartData = useMemo(
    () => ({
      labels: evolutionData.labels,
      datasets: [
        {
          label: 'Visitas no dia',
          data: evolutionData.values,
          borderColor: '#0084C7',
          backgroundColor: 'rgba(0, 132, 199, 0.14)',
          pointBackgroundColor: '#192863',
          pointBorderColor: '#FFFFFF',
          pointBorderWidth: 1.5,
          pointRadius: 3.5,
          tension: 0.3,
          fill: true,
        },
      ],
    }),
    [evolutionData]
  );

  // Chart 2: Probability Distribution (Doughnut)
  const probabilityCounts = useMemo(
    () =>
      PROBABILITY_OPTIONS.map(
        (opt) => scopedVisits.filter((v) => v.probability === opt.id).length
      ),
    [scopedVisits]
  );

  const probabilityChartData = useMemo(
    () => ({
      labels: PROBABILITY_OPTIONS.map((o) => o.label),
      datasets: [
        {
          data: probabilityCounts,
          backgroundColor: ['#DC2626', '#F59E0B', '#64748B', '#0084C7', '#192863'],
          borderColor: '#FFFFFF',
          borderWidth: 2,
          hoverOffset: 6,
        },
      ],
    }),
    [probabilityCounts]
  );

  // Chart 3: Next Action Distribution (Bar)
  const actionCounts = useMemo(
    () =>
      ACTION_OPTIONS.map((act) => scopedVisits.filter((v) => v.nextAction === act).length),
    [scopedVisits]
  );

  const actionChartData = useMemo(
    () => ({
      labels: ACTION_OPTIONS,
      datasets: [
        {
          label: 'Total de visitas',
          data: actionCounts,
          backgroundColor: ['#192863', '#0084C7', '#F59E0B', '#059669', '#64748B'],
          borderRadius: 8,
          maxBarThickness: 42,
        },
      ],
    }),
    [actionCounts]
  );

  const barOptions: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#192863',
        padding: 10,
        cornerRadius: 8,
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: '#475569', font: { size: 11, weight: 'bold' } },
      },
      y: {
        beginAtZero: true,
        ticks: { stepSize: 1, precision: 0, color: '#64748B', font: { size: 11 } },
        grid: { color: '#E2E8F0' },
      },
    },
  };

  const lineOptions: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#192863',
        padding: 10,
        cornerRadius: 8,
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: '#475569', font: { size: 10, weight: 'bold' } },
      },
      y: {
        beginAtZero: true,
        ticks: { stepSize: 1, precision: 0, color: '#64748B', font: { size: 11 } },
        grid: { color: '#E2E8F0' },
      },
    },
  };

  const doughnutOptions: ChartOptions<'doughnut'> = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '64%',
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          boxWidth: 12,
          padding: 14,
          color: '#192863',
          font: { size: 11, weight: 'bold' },
        },
      },
      tooltip: {
        backgroundColor: '#192863',
        padding: 10,
        cornerRadius: 8,
      },
    },
  };

  const periodModes: Array<{ id: PeriodMode; label: string }> = [
    { id: 'daily', label: 'Visão Diária' },
    { id: 'weekly', label: 'Visão Semanal' },
    { id: 'monthly', label: 'Visão Mensal' },
    { id: 'annual', label: 'Visão Anual' },
  ];

  const handleExportIndicatorsPdf = async () => {
    if (exportingPdf) return;
    setExportingPdf(true);
    try {
      const result = await exportAnalyticsDashboardToPdf({
        periodDescription,
        sellerName,
        isAdminMode,
        kpis,
        probabilityBreakdown: PROBABILITY_OPTIONS.map((opt, idx) => ({
          label: opt.label,
          count: probabilityCounts[idx] ?? 0,
        })),
        actionBreakdown: ACTION_OPTIONS.map((act, idx) => ({
          label: act,
          count: actionCounts[idx] ?? 0,
        })),
      });
      if (result.message && onToast) {
        onToast(result.message, result.type);
      }
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Não foi possível exportar os indicadores em PDF.';
      onToast?.(msg, 'error');
    } finally {
      setExportingPdf(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header & 4-Period Filters */}
      <section className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-brand-cyan">
              Business Intelligence · {periodDescription}
            </p>
            <div className="flex flex-wrap items-center gap-2 mt-0.5">
              <h2 className="text-xl font-extrabold text-brand-900">
                Estatísticas &amp; Gráficos
              </h2>
              {isAdminMode && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-brand-900 text-white text-[11px] font-bold">
                  <ShieldCheck className="w-3 h-3 text-brand-gold" />
                  <span>Apenas Visitas Concluídas</span>
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start sm:self-center">
            <button
              type="button"
              onClick={handleExportIndicatorsPdf}
              disabled={exportingPdf}
              className="min-h-[40px] px-4 py-2 rounded-xl bg-brand-gold hover:bg-brand-goldHover disabled:opacity-60 text-brand-950 font-extrabold text-xs transition inline-flex items-center gap-1.5 shadow-xs"
            >
              {exportingPdf ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <FileText className="w-3.5 h-3.5" />
              )}
              <span>Exportar Indicadores (PDF)</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate(isAdminMode ? 'admin' : 'dashboard')}
              className="min-h-[40px] px-4 py-2 rounded-xl bg-brand-surface hover:bg-sky-100 text-brand-900 font-bold text-xs transition"
            >
              Voltar
            </button>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pt-2 border-t border-slate-100">
          {/* Exact 4 Period Modes */}
          <div className="grid grid-cols-2 sm:inline-flex items-center p-1 bg-brand-surface border border-slate-200 rounded-xl gap-1">
            {periodModes.map((mode) => (
              <button
                key={mode.id}
                type="button"
                onClick={() => setPeriodMode(mode.id)}
                className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap ${
                  periodMode === mode.id
                    ? 'bg-brand-900 text-white shadow-xs'
                    : 'text-slate-600 hover:text-brand-900'
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>

          {/* Contextual Selectors + Year */}
          <div className="flex flex-wrap items-center gap-2.5">
            {periodMode === 'daily' && (
              <div>
                <label htmlFor="analytics-date-input" className="sr-only">
                  Seleccionar dia
                </label>
                <input
                  id="analytics-date-input"
                  type="date"
                  value={selectedDateISO}
                  onChange={(e) => {
                    if (e.target.value) setSelectedDateISO(e.target.value);
                  }}
                  className="min-h-[40px] px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-bold text-brand-900 font-mono tabular-nums focus:border-brand-cyan focus:outline-none"
                />
              </div>
            )}

            {periodMode === 'weekly' && (
              <div>
                <label htmlFor="analytics-week-select" className="sr-only">
                  Seleccionar semana
                </label>
                <select
                  id="analytics-week-select"
                  value={activeWeek?.startISO ?? ''}
                  onChange={(e) => setSelectedWeekStartISO(e.target.value)}
                  className="min-h-[40px] pl-3 pr-8 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-bold text-brand-900 font-mono tabular-nums focus:border-brand-cyan focus:outline-none"
                >
                  {weeksInSelectedYear.map((w) => (
                    <option key={w.startISO} value={w.startISO}>
                      {w.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {periodMode === 'monthly' && (
              <div>
                <label htmlFor="analytics-month-select" className="sr-only">
                  Seleccionar mês
                </label>
                <select
                  id="analytics-month-select"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(Number(e.target.value))}
                  className="min-h-[40px] pl-3 pr-8 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-bold text-brand-900 focus:border-brand-cyan focus:outline-none"
                >
                  {MONTH_FULL_LABELS.map((label, idx) => (
                    <option key={label} value={idx + 1}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {periodMode !== 'daily' && (
              <div>
                <label htmlFor="analytics-year-select" className="sr-only">
                  Seleccionar ano
                </label>
                <select
                  id="analytics-year-select"
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(e.target.value)}
                  className="min-h-[40px] pl-3 pr-8 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-bold text-brand-900 font-mono tabular-nums focus:border-brand-cyan focus:outline-none"
                >
                  {availableYears.map((yr) => (
                    <option key={yr} value={yr}>
                      Ano {yr}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Top 4 Productivity KPIs */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 mb-2">
            <span>Volume Bruto de Visitas</span>
            <Layers className="w-4 h-4 text-brand-cyan" />
          </div>
          <p className="text-2xl font-extrabold text-brand-900 font-mono tabular-nums">
            {kpis.total}
          </p>
          <p className="text-xs text-slate-500 mt-1 tabular-nums">
            Total registado em {periodDescription}
          </p>
        </div>

        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 mb-2">
            <span>Média por Dia Útil</span>
            <Briefcase className="w-4 h-4 text-brand-900" />
          </div>
          <p className="text-2xl font-extrabold text-brand-900 font-mono tabular-nums">
            {kpis.avgPerBusinessDay}
          </p>
          <p className="text-xs text-slate-500 mt-1 tabular-nums">
            Base: {businessDaysInPeriod} dia(s) útil(eis) no período
          </p>
        </div>

        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 mb-2">
            <span>Concluídas e Trancadas</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-2xl font-extrabold text-brand-900 font-mono tabular-nums">
            {kpis.completionRate}%
          </p>
          <p className="text-xs text-emerald-700 font-semibold mt-1 tabular-nums">
            {kpis.locked} de {kpis.total} visita(s) trancada(s)
          </p>
        </div>

        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 mb-2">
            <span>Oportunidades Quentes</span>
            <Flame className="w-4 h-4 text-brand-gold" />
          </div>
          <div className="flex items-baseline gap-2">
            <p className="text-2xl font-extrabold text-brand-900 font-mono tabular-nums">
              {kpis.potentialIndex}%
            </p>
            <span className="text-sm font-bold text-brand-cyan font-mono tabular-nums">
              ({kpis.highProbCount})
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">Níveis «Maior» e «Muito maior»</p>
        </div>
      </section>

      {/* Empty Hint when no visits in scope */}
      {kpis.total === 0 && (
        <div className="bg-white rounded-2xl p-6 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <Calendar className="w-5 h-5 text-brand-cyan shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-brand-900">
                {isAdminMode
                  ? 'Ainda não existem visitas concluídas e trancadas neste período.'
                  : 'Ainda não existem visitas registadas neste período.'}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                {isAdminMode
                  ? 'Por respeito à privacidade dos rascunhos, apenas os registos concluídos pelo vendedor aparecem nos indicadores de gestão.'
                  : 'Registe visitas comerciais ou gere dados de demonstração nas Definições para testar os gráficos semanais, mensais e anuais.'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {!isAdminMode && (
              <button
                type="button"
                onClick={() => onOpenVisit(0)}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-brand-gold hover:bg-brand-goldHover text-brand-950 font-bold text-xs transition"
              >
                Registar Visita
              </button>
            )}
            <button
              type="button"
              onClick={() => onNavigate(isAdminMode ? 'admin' : 'settings')}
              className="min-h-[40px] px-4 py-2 rounded-xl bg-brand-surface hover:bg-sky-100 text-brand-900 font-bold text-xs border border-slate-200 transition"
            >
              {isAdminMode ? 'Painel Gestor' : 'Definições'}
            </button>
          </div>
        </div>
      )}

      {/* Charts Grid */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Chart 1: Evolution */}
        <div className="lg:col-span-7 bg-white rounded-2xl p-5 sm:p-6 border border-slate-200">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-extrabold text-brand-900">Volume de Visitas</h3>
              <p className="text-xs text-slate-500">{evolutionData.subtitle}</p>
            </div>
            <BarChart3 className="w-4 h-4 text-brand-cyan shrink-0" />
          </div>
          <div className="h-64 w-full">
            {evolutionData.kind === 'line' ? (
              <Line data={lineEvolutionChartData} options={lineOptions} />
            ) : (
              <Bar data={barEvolutionChartData} options={barOptions} />
            )}
          </div>
        </div>

        {/* Chart 2: Sale Probability Doughnut */}
        <div className="lg:col-span-5 bg-white rounded-2xl p-5 sm:p-6 border border-slate-200">
          <div className="mb-4">
            <h3 className="text-base font-extrabold text-brand-900">
              Possibilidade de Fechar Venda
            </h3>
            <p className="text-xs text-slate-500">Distribuição pelos 5 níveis de probabilidade</p>
          </div>
          <div className="h-64 w-full flex items-center justify-center">
            {scopedVisits.some((v) => Boolean(v.probability)) ? (
              <Doughnut data={probabilityChartData} options={doughnutOptions} />
            ) : (
              <p className="text-xs text-slate-400 text-center">
                Sem classificações de probabilidade neste período.
              </p>
            )}
          </div>
        </div>

        {/* Chart 3: Next Action Distribution */}
        <div className="lg:col-span-12 bg-white rounded-2xl p-5 sm:p-6 border border-slate-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
            <div>
              <h3 className="text-base font-extrabold text-brand-900">
                Distribuição por Acção a Seguir
              </h3>
              <p className="text-xs text-slate-500">
                Volume de visitas agrupado pelo próximo passo comercial definido
              </p>
            </div>
            <div className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-900 bg-brand-surface border border-slate-200 px-3 py-1.5 rounded-xl self-start sm:self-center">
              <Target className="w-3.5 h-3.5 text-brand-cyan" />
              <span>
                Predominante: {kpis.topAction}
                {kpis.topActionCount > 0 ? ` (${kpis.topActionCount})` : ''}
              </span>
            </div>
          </div>
          <div className="h-64 w-full">
            <Bar data={actionChartData} options={barOptions} />
          </div>
        </div>
      </section>
    </div>
  );
}
