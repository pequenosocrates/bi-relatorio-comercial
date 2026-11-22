import type { SupportComment, Visit } from '../types/report';
import { isSafeImageDataUrl } from './photo';
import { formatDatePT, getRecordedVisits, getVisitCoordinates } from './storage';

interface JsPdfInstance {
  internal: {
    pageSize: {
      getWidth: () => number;
      getHeight: () => number;
    };
    getNumberOfPages: () => number;
  };
  setPage: (page: number) => void;
  addPage: () => void;
  setFillColor: (r: number, g: number, b: number) => void;
  setDrawColor: (r: number, g: number, b: number) => void;
  setTextColor: (r: number, g: number, b: number) => void;
  setLineWidth: (w: number) => void;
  rect: (x: number, y: number, w: number, h: number, style?: string) => void;
  roundedRect: (x: number, y: number, w: number, h: number, rx: number, ry: number, style?: string) => void;
  line: (x1: number, y1: number, x2: number, y2: number) => void;
  setFont: (fontName: string, fontStyle?: string) => void;
  setFontSize: (size: number) => void;
  text: (text: string | string[], x: number, y: number, options?: Record<string, unknown>) => void;
  splitTextToSize: (text: string, maxWidth: number) => string[];
  addImage: (
    imageData: string,
    format: string,
    x: number,
    y: number,
    width: number,
    height: number
  ) => void;
  output: (type: 'blob') => Blob;
  save: (filename: string) => void;
}

type JsPdfCtor = new (options?: {
  orientation?: 'portrait' | 'landscape';
  unit?: 'mm' | 'pt' | 'px';
  format?: string;
}) => JsPdfInstance;

const JSPDF_CDN_URL = 'https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js';

async function loadJsPdfFromCdn(): Promise<JsPdfCtor> {
  const win = window as unknown as { jspdf?: { jsPDF?: JsPdfCtor } };
  if (win.jspdf?.jsPDF) {
    return win.jspdf.jsPDF;
  }

  await new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${JSPDF_CDN_URL}"]`
    );
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Falha ao carregar jsPDF.')), {
        once: true,
      });
      window.setTimeout(() => {
        if (win.jspdf?.jsPDF) resolve();
        else reject(new Error('Tempo limite excedido ao carregar gerador de PDF.'));
      }, 6000);
      return;
    }

    const script = document.createElement('script');
    script.src = JSPDF_CDN_URL;
    script.crossOrigin = 'anonymous';
    script.onload = () => resolve();
    script.onerror = () =>
      reject(
        new Error(
          'Não foi possível carregar o gerador de PDF (CDN indisponível offline sem cache prévio).'
        )
      );
    document.head.appendChild(script);
  });

  if (!win.jspdf?.jsPDF) {
    throw new Error('Biblioteca jsPDF indisponível neste momento.');
  }
  return win.jspdf.jsPDF;
}

async function deliverPdfOutput(
  doc: JsPdfInstance,
  fileName: string,
  title: string,
  shareAfterExport: boolean
): Promise<{ ok: boolean; message: string; type: 'success' | 'info' | 'error' }> {
  if (shareAfterExport) {
    const blob = doc.output('blob');
    const file = new File([blob], fileName, { type: 'application/pdf' });
    if (
      typeof navigator !== 'undefined' &&
      typeof navigator.canShare === 'function' &&
      navigator.canShare({ files: [file] })
    ) {
      try {
        await navigator.share({
          title,
          text: fileName,
          files: [file],
        });
        return {
          ok: true,
          message: 'Relatório PDF partilhado com sucesso!',
          type: 'success',
        };
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          return { ok: false, message: '', type: 'info' };
        }
      }
    }
  }

  doc.save(fileName);
  return {
    ok: true,
    message: `Relatório ${fileName} descarregado com sucesso!`,
    type: 'success',
  };
}

function formatCommentDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('pt-PT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export async function exportDailyReportToPdf(params: {
  visits: Visit[];
  activeDateISO: string;
  sellerName: string;
  dailyManagerComments?: SupportComment[];
  adminOnlyLocked?: boolean;
  shareAfterExport?: boolean;
}): Promise<{ ok: boolean; message: string; type: 'success' | 'info' | 'error' }> {
  const {
    visits,
    activeDateISO,
    sellerName,
    dailyManagerComments = [],
    adminOnlyLocked = false,
    shareAfterExport = false,
  } = params;

  const lockedVisits = visits.filter((v) => v.isLocked);
  const recordedVisits = getRecordedVisits(visits);
  const targetVisits = adminOnlyLocked
    ? lockedVisits
    : lockedVisits.length > 0
      ? lockedVisits
      : recordedVisits;

  if (targetVisits.length === 0) {
    return {
      ok: false,
      message: adminOnlyLocked
        ? 'Ainda não existem visitas concluídas e trancadas para gerar o PDF.'
        : 'Registe ou conclua pelo menos uma visita antes de exportar o PDF.',
      type: 'error',
    };
  }

  const JsPDF = await loadJsPdfFromCdn();
  const doc = new JsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  const footerReserve = 16;

  // Institutional BI Header
  doc.setFillColor(25, 40, 99); // #192863
  doc.rect(0, 0, pageWidth, 28, 'F');
  doc.setFillColor(0, 132, 199); // #0084C7
  doc.rect(0, 28, pageWidth, 2, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('BI · RELATÓRIO COMERCIAL DIÁRIO', margin, 13);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(224, 242, 254);
  doc.text('Business Intelligence · Grupo CTS · Maputo', margin, 20);

  // Date pill on top right
  doc.setFillColor(245, 158, 11); // #F59E0B
  doc.roundedRect(pageWidth - margin - 36, 8, 36, 12, 2, 2, 'F');
  doc.setTextColor(16, 27, 71);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text(formatDatePT(activeDateISO), pageWidth - margin - 18, 15.5, { align: 'center' });

  let y = 37;

  // Summary strip
  const hotCount = targetVisits.filter(
    (v) => v.probability === 'Maior' || v.probability === 'Muito maior'
  ).length;
  const photoCount = targetVisits.reduce((acc, v) => acc + (v.photos?.length ?? 0), 0);

  doc.setFillColor(244, 248, 251); // #F4F8FB
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(margin, y, contentWidth, 20, 2.5, 2.5, 'FD');

  doc.setTextColor(25, 40, 99);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text(`Vendedor: ${sellerName.trim() || 'Não definido'}`, margin + 4, y + 7);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.8);
  doc.setTextColor(51, 65, 85);
  doc.text(
    `Visitas no relatório: ${targetVisits.length}   |   Concluídas: ${lockedVisits.length}   |   Oportunidades Quentes: ${hotCount}   |   Fotos: ${photoCount}`,
    margin + 4,
    y + 14.5
  );

  y += 26;

  const ensureSpace = (neededHeight: number) => {
    if (y + neededHeight > pageHeight - footerReserve) {
      doc.addPage();
      y = 16;
    }
  };

  // Daily Manager Recommendations
  if (dailyManagerComments.length > 0) {
    ensureSpace(22);
    doc.setFillColor(224, 242, 254);
    doc.setDrawColor(0, 132, 199);
    doc.roundedRect(margin, y, contentWidth, 8, 2, 2, 'FD');
    doc.setTextColor(25, 40, 99);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.text('RECOMENDAÇÕES & APOIO DA GESTÃO (RESUMO DO DIA)', margin + 3.5, y + 5.5);
    y += 11;

    for (const c of dailyManagerComments) {
      const roleLabel = c.authorRole === 'admin' ? 'Gestão' : 'Vendedor';
      const headerLine = `${c.authorName || roleLabel} (${roleLabel}) · ${formatCommentDateTime(
        c.createdAt
      )}`;
      const msgLines = doc.splitTextToSize(c.message, contentWidth - 8);
      const blockH = 7 + msgLines.length * 4.3;
      ensureSpace(blockH + 3);

      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(margin, y, contentWidth, blockH, 2, 2, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.2);
      doc.setTextColor(0, 132, 199);
      doc.text(headerLine, margin + 4, y + 4.8);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.8);
      doc.setTextColor(30, 41, 59);
      doc.text(msgLines, margin + 4, y + 9.2);
      y += blockH + 3;
    }
    y += 3;
  }

  // Structured Visits
  for (const visit of targetVisits) {
    const numStr = String(visit.id).padStart(2, '0');
    const companyTitle = visit.company.trim() || 'Empresa não registada';
    const statusLabel = visit.isLocked ? 'CONCLUÍDA' : 'EM CURSO';

    ensureSpace(34);

    // Visit Header Bar
    doc.setFillColor(25, 40, 99);
    doc.roundedRect(margin, y, contentWidth, 9, 2, 2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(`VISITA ${numStr} · ${companyTitle}`, margin + 3.5, y + 6);

    doc.setFontSize(8);
    doc.setTextColor(245, 158, 11);
    doc.text(statusLabel, pageWidth - margin - 3.5, y + 5.8, { align: 'right' });
    y += 12.5;

    const writeField = (label: string, value: string) => {
      const textVal = value.trim() || '---';
      const lines = doc.splitTextToSize(textVal, contentWidth - 4);
      const height = 4.2 + lines.length * 4.3;
      ensureSpace(height + 2);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(25, 40, 99);
      doc.text(label, margin + 1, y);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(51, 65, 85);
      doc.text(lines, margin + 1, y + 4.2);
      y += height + 1.5;
    };

    if (visit.contactName?.trim() || visit.contactPhone?.trim()) {
      const contactStr = [visit.contactName?.trim(), visit.contactPhone?.trim()]
        .filter(Boolean)
        .join(' · ');
      writeField('Contacto:', contactStr);
    }

    const coords = getVisitCoordinates(visit);
    const locationStr = coords
      ? `${visit.location.trim() || ''} (${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)})`.trim()
      : visit.location.trim() || 'Não registada';

    writeField('Descrição:', visit.description);
    writeField('Localização:', locationStr);
    writeField('Problema identificado:', visit.problem);
    writeField('Feedback do cliente:', visit.feedback || 'Sem observações');

    const actionText =
      visit.nextAction === 'Outro'
        ? `Outro: ${visit.otherAction.trim() || 'Não especificado'}`
        : visit.nextAction || 'Não definida';

    ensureSpace(10);
    doc.setFillColor(244, 248, 251);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(margin, y, contentWidth, 8, 1.5, 1.5, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.4);
    doc.setTextColor(25, 40, 99);
    doc.text(
      `Possibilidade de fecho: ${visit.probability || 'Não definida'}    |    Acção a seguir: ${actionText}`,
      margin + 3,
      y + 5.2
    );
    y += 11;

    // Embedded Photo Thumbnails (up to 3)
    const validPhotos = (visit.photos ?? []).filter((p) => isSafeImageDataUrl(p.dataUrl));
    if (validPhotos.length > 0) {
      const thumbW = 54;
      const thumbH = 38;
      ensureSpace(thumbH + 10);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(0, 132, 199);
      doc.text(`Fotografias de Evidência (${validPhotos.length}):`, margin + 1, y);
      y += 3;

      validPhotos.slice(0, 3).forEach((photo, pIdx) => {
        const xPos = margin + pIdx * (thumbW + 5);
        const ratio = photo.width > 0 && photo.height > 0 ? photo.height / photo.width : 0.75;
        let drawW = thumbW;
        let drawH = drawW * ratio;
        if (drawH > thumbH) {
          drawH = thumbH;
          drawW = drawH / ratio;
        }
        doc.setDrawColor(203, 213, 225);
        doc.rect(xPos, y, thumbW, thumbH, 'S');
        try {
          doc.addImage(
            photo.dataUrl,
            'JPEG',
            xPos + (thumbW - drawW) / 2,
            y + (thumbH - drawH) / 2,
            drawW,
            drawH
          );
        } catch {
          // Skip invalid photo cleanly
        }
      });

      y += thumbH + 5;
    }

    // Per-Visit Manager Recommendations
    const visitComments = visit.managerComments ?? [];
    if (visitComments.length > 0) {
      ensureSpace(14);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(0, 132, 199);
      doc.text('Recomendações & Apoio da Gestão:', margin + 1, y);
      y += 3.5;

      for (const c of visitComments) {
        const roleLabel = c.authorRole === 'admin' ? 'Gestão' : 'Vendedor';
        const msgLines = doc.splitTextToSize(c.message, contentWidth - 8);
        const boxH = 6.5 + msgLines.length * 4.2;
        ensureSpace(boxH + 3);

        doc.setFillColor(240, 249, 255);
        doc.setDrawColor(186, 230, 253);
        doc.roundedRect(margin, y, contentWidth, boxH, 1.5, 1.5, 'FD');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.8);
        doc.setTextColor(25, 40, 99);
        doc.text(
          `${c.authorName || roleLabel} (${roleLabel}) · ${formatCommentDateTime(c.createdAt)}`,
          margin + 3.5,
          y + 4.3
        );

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(30, 41, 59);
        doc.text(msgLines, margin + 3.5, y + 8.5);
        y += boxH + 2.5;
      }
    }

    // Subtle divider between visits
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.line(margin, y, pageWidth - margin, y);
    y += 6;
  }

  // Footer with seller signature & pagination on every page
  const totalPages = doc.internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    const footerY = pageHeight - 9;
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.25);
    doc.line(margin, footerY - 4, pageWidth - margin, footerY - 4);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.2);
    doc.setTextColor(25, 40, 99);
    doc.text(`Relatório elaborado por: ${sellerName.trim() || 'Não definido'}`, margin, footerY);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(`Página ${p} de ${totalPages}`, pageWidth - margin, footerY, { align: 'right' });
  }

  const fileName = `Relatorio_Comercial_BI_${activeDateISO}.pdf`;
  return deliverPdfOutput(doc, fileName, 'Relatório Comercial Diário · BI', shareAfterExport);
}

export async function exportAnalyticsDashboardToPdf(params: {
  periodDescription: string;
  sellerName: string;
  isAdminMode: boolean;
  kpis: {
    total: number;
    locked: number;
    completionRate: number;
    avgPerBusinessDay: string;
    highProbCount: number;
    potentialIndex: number;
    topAction: string;
    topActionCount: number;
  };
  probabilityBreakdown: Array<{ label: string; count: number }>;
  actionBreakdown: Array<{ label: string; count: number }>;
}): Promise<{ ok: boolean; message: string; type: 'success' | 'info' | 'error' }> {
  const JsPDF = await loadJsPdfFromCdn();
  const doc = new JsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;

  doc.setFillColor(25, 40, 99);
  doc.rect(0, 0, pageWidth, 26, 'F');
  doc.setFillColor(0, 132, 199);
  doc.rect(0, 26, pageWidth, 2, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('BI · INDICADORES & DASHBOARDS COMERCIAIS', margin, 12.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(224, 242, 254);
  doc.text(`Período: ${params.periodDescription}`, margin, 19.5);

  let y = 36;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(25, 40, 99);
  doc.text(
    `${params.isAdminMode ? 'Visão de Gestão (Apenas Visitas Concluídas)' : 'Visão Comercial'} · Vendedor: ${
      params.sellerName.trim() || 'Não definido'
    }`,
    margin,
    y
  );
  y += 8;

  const kpiCards = [
    ['Volume de Visitas', String(params.kpis.total)],
    ['Média por Dia Útil', params.kpis.avgPerBusinessDay],
    ['Concluídas e Trancadas', `${params.kpis.completionRate}% (${params.kpis.locked})`],
    ['Oportunidades Quentes', `${params.kpis.potentialIndex}% (${params.kpis.highProbCount})`],
  ];

  const cardW = (contentWidth - 6) / 2;
  kpiCards.forEach(([title, val], idx) => {
    const col = idx % 2;
    const row = Math.floor(idx / 2);
    const x = margin + col * (cardW + 6);
    const cy = y + row * 22;

    doc.setFillColor(244, 248, 251);
    doc.setDrawColor(203, 213, 225);
    doc.roundedRect(x, cy, cardW, 18, 2, 2, 'FD');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text(title, x + 4, cy + 6);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(25, 40, 99);
    doc.text(val, x + 4, cy + 13.5);
  });

  y += 50;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(25, 40, 99);
  doc.text('Possibilidade de Fechar Venda', margin, y);
  y += 5;

  params.probabilityBreakdown.forEach((item) => {
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(margin, y, contentWidth, 8, 1.5, 1.5, 'FD');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(51, 65, 85);
    doc.text(item.label, margin + 4, y + 5.3);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 132, 199);
    doc.text(`${item.count} visita(s)`, pageWidth - margin - 4, y + 5.3, { align: 'right' });
    y += 9.5;
  });

  y += 6;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(25, 40, 99);
  doc.text(
    `Distribuição por Acção a Seguir (Predominante: ${params.kpis.topAction})`,
    margin,
    y
  );
  y += 5;

  params.actionBreakdown.forEach((item) => {
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(margin, y, contentWidth, 8, 1.5, 1.5, 'FD');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(51, 65, 85);
    doc.text(item.label, margin + 4, y + 5.3);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(25, 40, 99);
    doc.text(`${item.count} visita(s)`, pageWidth - margin - 4, y + 5.3, { align: 'right' });
    y += 9.5;
  });

  const footerY = pageHeight - 9;
  doc.setDrawColor(203, 213, 225);
  doc.line(margin, footerY - 4, pageWidth - margin, footerY - 4);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.2);
  doc.setTextColor(25, 40, 99);
  doc.text(`Relatório elaborado por: ${params.sellerName.trim() || 'Não definido'}`, margin, footerY);

  const safePeriod = params.periodDescription.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 32);
  const fileName = `Indicadores_BI_${safePeriod}.pdf`;
  return deliverPdfOutput(doc, fileName, 'Indicadores BI · Relatório Comercial', false);
}
