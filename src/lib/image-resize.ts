import { MAX_IMAGE_DIMENSION } from './chat-constants';

/**
 * Resize de imagem client-side via canvas, preservando proporcao.
 * Reduz custo de envio pra Storage e tokens da Vision API.
 *
 * GIFs animados nao sao resized (canvas perderia animacao); retorna o file original.
 */
export async function resizeImageIfNeeded(
  file: File,
  maxDim: number = MAX_IMAGE_DIMENSION
): Promise<File> {
  // GIF e formatos exoticos: nao mexer
  if (file.type === 'image/gif') return file;
  if (!file.type.startsWith('image/')) return file;

  const img = await loadImage(file);
  if (img.width <= maxDim && img.height <= maxDim) return file;

  const scale = maxDim / Math.max(img.width, img.height);
  const targetW = Math.floor(img.width * scale);
  const targetH = Math.floor(img.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;
  ctx.drawImage(img, 0, 0, targetW, targetH);

  const blob: Blob | null = await new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b), file.type, 0.9)
  );

  if (!blob) return file;
  return new File([blob], file.name, { type: file.type, lastModified: Date.now() });
}

export async function getImageDimensions(file: File): Promise<{ width: number; height: number } | null> {
  if (!file.type.startsWith('image/')) return null;
  try {
    const img = await loadImage(file);
    return { width: img.width, height: img.height };
  } catch {
    return null;
  }
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}
