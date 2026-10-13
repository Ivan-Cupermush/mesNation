/**
 * Имя и фамилия (как server/src/lib/names.ts). Раньше было одно поле
 * «Имя и фамилия», и первое слово у «Тимуров Тимур» — фамилия.
 */

const SURNAME = /(ов|ев|ёв|ова|ева|ёва|ский|цкий|ской|ская|цкая|енко|швили|дзе|ых|их)$/i;
const PATRONYMIC = /(вич|вна|ична|ич|оглы|кызы)$/i;

const isSurname = (w = '') => w.length >= 4 && SURNAME.test(w);
const isPatronymic = (w = '') => w.length >= 5 && PATRONYMIC.test(w);

export function splitFullName(full: string | null | undefined): { first: string; last: string } {
  const w = String(full || '').trim().split(/\s+/).filter(Boolean);
  if (!w.length) return { first: '', last: '' };
  if (w.length === 1) return { first: w[0], last: '' };
  if (w.length === 3 && isPatronymic(w[2]) && !isPatronymic(w[1])) return { first: `${w[1]} ${w[2]}`, last: w[0] };
  if (w.length === 3 && isPatronymic(w[1])) return { first: `${w[0]} ${w[1]}`, last: w[2] };
  if (w.length === 2 && isSurname(w[0]) && !isSurname(w[1])) return { first: w[1], last: w[0] };
  return { first: w[0], last: w.slice(1).join(' ') };
}

/** Как обратиться к человеку: имя из профиля, иначе — разобранное из полного. */
export function firstNameOf(u: { first_name?: string | null; display_name?: string | null; username?: string } | string | null | undefined): string {
  if (!u) return '';
  if (typeof u === 'string') return splitFullName(u).first || u;
  return (u.first_name || '').trim() || splitFullName(u.display_name).first || u.username || '';
}

/** Поля формы для профиля: сохранённые имя и фамилия или разбор полного имени. */
export function nameParts(u: { first_name?: string | null; last_name?: string | null; display_name?: string | null } | null | undefined) {
  if (u?.first_name) return { first: u.first_name, last: u.last_name || '' };
  return splitFullName(u?.display_name);
}
