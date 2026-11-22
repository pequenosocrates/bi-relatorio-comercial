import type { Visit } from '../types/report';
import { buildBackupPayload, formatDatePT, getRecordedVisits } from './storage';

const WHATSAPP_SAFE_TEXT_LIMIT = 2400;

export function generateWhatsAppReportText(
  visits: Visit[],
  activeDateISO: string,
  sellerNameInput: string
): string {
  const recorded = getRecordedVisits(visits);
  const sellerName = sellerNameInput.trim() || 'Vendedor não identificado';
  const dateFormatted = formatDatePT(activeDateISO);

  const lines: string[] = [
    'RELATÓRIO COMERCIAL DIÁRIO',
    '',
    `Data: ${dateFormatted}`,
    `Vendedor: ${sellerName}`,
    `Total de visitas: ${recorded.length}`,
    '',
  ];

  recorded.forEach((visit) => {
    const numStr = String(visit.id).padStart(2, '0');
    const actionText =
      visit.nextAction === 'Outro'
        ? `Outro: ${visit.otherAction.trim() || 'Não especificado'}`
        : visit.nextAction || 'Não definida';

    lines.push('━━━━━━━━━━━━━━━━━━');
    lines.push('');
    lines.push(`VISITA ${numStr}`);
    lines.push('');
    lines.push(`Empresa: ${visit.company.trim() || 'Não informada'}`);

    if (visit.contactName?.trim() || visit.contactPhone?.trim()) {
      const contactParts = [visit.contactName?.trim(), visit.contactPhone?.trim()].filter(Boolean);
      lines.push(`Contacto: ${contactParts.join(' · ')}`);
    }

    lines.push('');
    lines.push(`Descrição: ${visit.description.trim() || 'Não informada'}`);

    if (visit.location && visit.location.trim()) {
      lines.push('');
      lines.push(`Localização: ${visit.location.trim()}`);
    }

    lines.push('');
    lines.push(`Problema identificado: ${visit.problem.trim() || 'Não informado'}`);
    lines.push('');
    lines.push(`Feedback do cliente: ${visit.feedback.trim() || 'Sem observações'}`);
    lines.push('');
    lines.push(`Possibilidade de fechar a venda: ${visit.probability || 'Não definida'}`);
    lines.push('');
    lines.push(`Acção a seguir: ${actionText}`);
    lines.push('');
  });

  lines.push('━━━━━━━━━━━━━━━━━━');
  lines.push('');
  lines.push(`Relatório elaborado por: ${sellerName}`);

  return lines.join('\n');
}

export function generateCompactWhatsAppReportText(
  visits: Visit[],
  activeDateISO: string,
  sellerNameInput: string
): string {
  const recorded = getRecordedVisits(visits);
  const sellerName = sellerNameInput.trim() || 'Vendedor não identificado';
  const dateFormatted = formatDatePT(activeDateISO);

  const lines: string[] = [
    `RELATÓRIO COMERCIAL (${dateFormatted})`,
    `Vendedor: ${sellerName} · ${recorded.length} visita(s)`,
    '',
  ];

  recorded.forEach((visit) => {
    const numStr = String(visit.id).padStart(2, '0');
    const actionText =
      visit.nextAction === 'Outro'
        ? visit.otherAction.trim() || 'Outro'
        : visit.nextAction || 'N/D';
    const contact = [visit.contactName?.trim(), visit.contactPhone?.trim()]
      .filter(Boolean)
      .join(' / ');
    const summaryProblem = visit.problem.trim().slice(0, 90);
    lines.push(
      `${numStr}. ${visit.company.trim() || 'Sem nome'}${contact ? ` (${contact})` : ''} | ${
        visit.probability || 'N/D'
      } -> ${actionText}${summaryProblem ? ` | ${summaryProblem}` : ''}`
    );
  });

  return lines.join('\n');
}

export function buildWhatsAppPayload(
  visits: Visit[],
  activeDateISO: string,
  sellerNameInput: string
): {
  fullText: string;
  whatsappHref: string;
  usedCompactUrl: boolean;
} {
  const fullText = generateWhatsAppReportText(visits, activeDateISO, sellerNameInput);
  if (fullText.length <= WHATSAPP_SAFE_TEXT_LIMIT) {
    return {
      fullText,
      whatsappHref: buildWhatsAppUrl(fullText),
      usedCompactUrl: false,
    };
  }

  const compactText = generateCompactWhatsAppReportText(visits, activeDateISO, sellerNameInput);
  const safeUrlText =
    compactText.length <= WHATSAPP_SAFE_TEXT_LIMIT
      ? compactText
      : `${compactText.slice(0, WHATSAPP_SAFE_TEXT_LIMIT - 45)}\n...(envie o Excel ou copie o texto completo)`;

  return {
    fullText,
    whatsappHref: buildWhatsAppUrl(safeUrlText),
    usedCompactUrl: true,
  };
}

export function buildWhatsAppUrl(reportText: string): string {
  return `https://api.whatsapp.com/send?text=${encodeURIComponent(reportText)}`;
}

export function downloadBackupJson(activeDateISO: string): void {
  const payload = buildBackupPayload();
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `BI_Relatorio_Backup_${activeDateISO}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export async function buildVisitsExcelBlob(
  visits: Visit[],
  activeDateISO: string
): Promise<{ blob: Blob; fileName: string } | null> {
  const recorded = getRecordedVisits(visits);
  if (recorded.length === 0) return null;

  const XLSX = await import('xlsx');

  const rows = recorded.map((visit) => {
    const actionText =
      visit.nextAction === 'Outro'
        ? `Outro: ${visit.otherAction.trim() || 'Não especificado'}`
        : visit.nextAction || '';

    return {
      Empresa: visit.company.trim(),
      Descrição: visit.description.trim(),
      Problema: visit.problem.trim(),
      'Acção a seguir': actionText,
    };
  });

  const worksheet = XLSX.utils.json_to_sheet(rows, {
    header: ['Empresa', 'Descrição', 'Problema', 'Acção a seguir'],
  });

  worksheet['!cols'] = [
    { wch: 28 },
    { wch: 42 },
    { wch: 42 },
    { wch: 26 },
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Relatório Comercial');

  const fileName = `Relatorio_Comercial_${activeDateISO}.xlsx`;
  const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([wbout], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  return { blob, fileName };
}

export async function exportVisitsToExcel(
  visits: Visit[],
  activeDateISO: string,
  shareAfterExport: boolean
): Promise<{ ok: boolean; message: string; type: 'success' | 'info' | 'error' }> {
  const built = await buildVisitsExcelBlob(visits, activeDateISO);
  if (!built) {
    return {
      ok: false,
      message: 'Não existem visitas registadas para exportar.',
      type: 'error',
    };
  }

  const { blob, fileName } = built;

  const triggerDownload = () => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (shareAfterExport) {
    const file = new File([blob], fileName, { type: blob.type });

    if (
      typeof navigator !== 'undefined' &&
      typeof navigator.canShare === 'function' &&
      navigator.canShare({ files: [file] })
    ) {
      try {
        await navigator.share({
          title: 'Relatório Comercial Diário',
          text: `Relatório Comercial Diário (${formatDatePT(activeDateISO)})`,
          files: [file],
        });
        return {
          ok: true,
          message: 'Ficheiro Excel partilhado com sucesso!',
          type: 'success',
        };
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          return { ok: false, message: '', type: 'info' };
        }
        triggerDownload();
        return {
          ok: true,
          message: 'Ficheiro Excel descarregado para o dispositivo.',
          type: 'info',
        };
      }
    }

    triggerDownload();
    return {
      ok: true,
      message: 'Ficheiro Excel descarregado! Pode anexá-lo no WhatsApp.',
      type: 'info',
    };
  }

  triggerDownload();
  return {
    ok: true,
    message: `Ficheiro ${fileName} descarregado!`,
    type: 'success',
  };
}
