import type { VisitPhoto } from '../types/report';

export const MAX_PHOTOS_PER_VISIT = 3;
const MAX_IMAGE_WIDTH = 1024;
const JPEG_QUALITY = 0.75;
const MAX_RAW_FILE_BYTES = 25 * 1024 * 1024;

export function isSafeImageDataUrl(url: string | undefined): url is string {
  if (!url) return false;
  return (
    url.startsWith('data:image/jpeg;base64,') ||
    url.startsWith('data:image/png;base64,') ||
    url.startsWith('data:image/webp;base64,')
  );
}

export async function compressImageToVisitPhoto(file: File): Promise<VisitPhoto> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Seleccione apenas ficheiros de imagem (JPEG, PNG ou WebP).');
  }
  if (file.size > MAX_RAW_FILE_BYTES) {
    throw new Error('A imagem seleccionada excede o limite de 25 MB.');
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('Não foi possível ler a fotografia seleccionada.'));
      element.src = objectUrl;
    });

    const naturalW = img.naturalWidth || 1024;
    const naturalH = img.naturalHeight || 768;
    const scale = naturalW > MAX_IMAGE_WIDTH ? MAX_IMAGE_WIDTH / naturalW : 1;
    const targetWidth = Math.max(1, Math.round(naturalW * scale));
    const targetHeight = Math.max(1, Math.round(naturalH * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('O navegador não suporta compressão de imagens.');
    }

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, targetWidth, targetHeight);
    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

    const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
    if (!isSafeImageDataUrl(dataUrl)) {
      throw new Error('Falha ao comprimir a fotografia.');
    }

    return {
      id: `photo_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      dataUrl,
      width: targetWidth,
      height: targetHeight,
      createdAt: new Date().toISOString(),
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
