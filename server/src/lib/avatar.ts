const MAX_AVATAR_BYTES = 500_000;
const ALLOWED_PREFIXES = ["data:image/jpeg;", "data:image/png;", "data:image/webp;", "data:image/gif;"];

/** Проверка base64-аватара: только изображения, без исполняемого контента */
export function validateAvatarDataUrl(avatar: string | null | undefined): string | null {
  if (!avatar) return null;
  if (avatar.length > MAX_AVATAR_BYTES) {
    throw new Error("Файл слишком большой (макс. 500 КБ)");
  }
  const ok = ALLOWED_PREFIXES.some((p) => avatar.startsWith(p));
  if (!ok) throw new Error("Допустимы только изображения JPEG, PNG, WebP или GIF");
  return avatar;
}
