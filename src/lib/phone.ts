/** Нормализация российского номера к 11 цифрам 7XXXXXXXXXX */
export function normalizePhoneDigits(phone: string): string {
  let d = phone.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("8")) d = `7${d.slice(1)}`;
  else if (d.length === 10) d = `7${d}`;
  return d;
}

export function isValidRuPhone(phone: string): boolean {
  const d = normalizePhoneDigits(phone);
  return d.length === 11 && d.startsWith("7");
}

/** Отображение: +7 (XXX) XXX-XX-XX */
export function formatPhoneDisplay(phone: string): string {
  const d = normalizePhoneDigits(phone);
  if (d.length === 11 && d.startsWith("7")) {
    return `+7 (${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7, 9)}-${d.slice(9, 11)}`;
  }
  return phone.trim();
}

/** Маска при вводе — только цифры, максимум 10 после кода страны */
export function formatPhoneInput(raw: string): string {
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("8")) d = `7${d.slice(1)}`;
  if (d.startsWith("7")) d = d.slice(1);
  d = d.slice(0, 10);
  if (!d) return "";
  let out = "+7";
  if (d.length > 0) out += ` (${d.slice(0, 3)}`;
  if (d.length >= 3) out += `) ${d.slice(3, 6)}`;
  if (d.length >= 6) out += `-${d.slice(6, 8)}`;
  if (d.length >= 8) out += `-${d.slice(8, 10)}`;
  return out;
}

export const PHONE_FORMAT_HINT = "+7 (XXX) XXX-XX-XX";
