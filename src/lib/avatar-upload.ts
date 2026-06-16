const MAX_PHOTO_BYTES = 400_000;

export function readAvatarFile(
  file: File | null | undefined,
  onOk: (dataUrl: string) => void,
  onErr: (msg: string) => void,
) {
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    onErr("Выберите изображение (JPG, PNG, WebP)");
    return;
  }
  if (file.size > MAX_PHOTO_BYTES) {
    onErr("Фото не больше 400 КБ");
    return;
  }
  const reader = new FileReader();
  reader.onload = () => onOk(String(reader.result));
  reader.onerror = () => onErr("Не удалось прочитать файл");
  reader.readAsDataURL(file);
}
