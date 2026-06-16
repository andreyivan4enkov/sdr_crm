const WEAK = new Set(["1234", "123456", "12345678", "password", "qwerty", "admin", "changeme", "changeme123"]);

export function validatePassword(password: string): string | null {
  if (password.length < 8) return "Пароль не менее 8 символов";
  if (password.length > 128) return "Пароль слишком длинный";
  if (!/[a-zA-Zа-яА-Я]/.test(password)) return "Пароль должен содержать буквы";
  if (!/[0-9]/.test(password)) return "Пароль должен содержать цифры";
  if (WEAK.has(password.toLowerCase())) return "Слишком простой пароль";
  return null;
}
