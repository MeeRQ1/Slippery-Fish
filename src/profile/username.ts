/**
 * Username validation. Names are LOCAL to this device — not globally unique,
 * not reserved, not an account (no backend exists in this build).
 */
const BLOCKED = ['admin', 'moderator', 'official', 'support', 'fuck', 'shit', 'bitch', 'cunt', 'nigg', 'fag', 'rape', 'nazi', 'slut', 'whore', 'dick', 'pussy', 'cock'];

export interface UsernameCheck {
  ok: boolean;
  value: string;
  message: string;
}

export function validateUsername(raw: string): UsernameCheck {
  const value = raw.replace(/\s+/g, ' ').trim();
  if (value.length < 3) return { ok: false, value, message: 'At least 3 characters, please.' };
  if (value.length > 16) return { ok: false, value, message: '16 characters at most.' };
  if (!/^[\p{L}\p{N}][\p{L}\p{N} _\-.]*$/u.test(value)) return { ok: false, value, message: 'Letters, numbers, spaces, _ - . only (start with a letter or number).' };
  const flat = value.toLowerCase().replace(/[^a-z]/g, '').replace(/0/g, 'o');
  if (BLOCKED.some((b) => flat.includes(b))) return { ok: false, value, message: 'Let’s pick a friendlier name.' };
  return { ok: true, value, message: 'Looks great!' };
}
