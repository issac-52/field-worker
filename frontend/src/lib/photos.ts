export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
export const PHOTO_MIME = ['image/jpeg', 'image/png', 'image/webp'];

// Decode one file at a time; keep a bounded demo image instead of full camera originals.
export async function preparePhoto(file: File): Promise<Blob> {
  if (!PHOTO_MIME.includes(file.type))
    throw new Error('JPG, PNG, WebP 이미지를 선택하세요. HEIC는 JPG로 변환 후 선택하세요.');
  if (!file.size || file.size > MAX_PHOTO_BYTES)
    throw new Error('이미지는 한 장당 10MB 이하로 선택하세요.');
  const source = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = source;
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight)
      throw new Error('이미지 크기를 확인할 수 없습니다.');
    const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('이미지 미리보기를 만들 수 없습니다.');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (value) => (value ? resolve(value) : reject(new Error('이미지를 변환하지 못했습니다.'))),
        'image/jpeg',
        0.8,
      ),
    );
    if (blob.size > 1024 * 1024)
      throw new Error('시연 이미지가 너무 큽니다. 더 작은 사진을 선택하세요.');
    return blob;
  } finally {
    URL.revokeObjectURL(source);
  }
}

export function photoDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('이미지를 읽지 못했습니다.'));
    reader.onabort = () => reject(new Error('이미지 읽기가 취소됐습니다.'));
    reader.readAsDataURL(blob);
  });
}
