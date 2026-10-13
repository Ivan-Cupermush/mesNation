/**
 * Имя и фамилия. Раньше было одно поле «Имя и фамилия», и люди писали
 * по-разному: «Тимур Тимуров», «Тимуров Тимур», «Тимуров Тимур Тимурович».
 * Разбор — тот же, что в миграции 0021_user_names.sql.
 */

const SURNAME = /(ов|ев|ёв|ова|ева|ёва|ский|цкий|ской|ская|цкая|енко|швили|дзе|ых|их)$/i;
const PATRONYMIC = /(вич|вна|ична|ич|оглы|кызы)$/i;

const isSurname = (w = '') => w.length >= 4 && SURNAME.test(w);
const isPatronymic = (w = '') => w.length >= 5 && PATRONYMIC.test(w);

export function splitFullName(full: string | null | undefined): { first: string; last: string } {
  const w = String(full || '').trim().split(/\s+/).filter(Boolean);
  if (!w.length) return { first: '', last: '' };
  if (w.length === 1) return { first: w[0], last: '' };
  // ФИО как в документах: «Тимуров Тимур Тимурович».
  if (w.length === 3 && isPatronymic(w[2]) && !isPatronymic(w[1])) return { first: `${w[1]} ${w[2]}`, last: w[0] };
  // «Тимур Тимурович Тимуров».
  if (w.length === 3 && isPatronymic(w[1])) return { first: `${w[0]} ${w[1]}`, last: w[2] };
  // Фамилия первой: «Тимуров Тимур».
  if (w.length === 2 && isSurname(w[0]) && !isSurname(w[1])) return { first: w[1], last: w[0] };
  return { first: w[0], last: w.slice(1).join(' ') };
}

export const joinName = (first?: string | null, last?: string | null) => [first, last].map((x) => (x || '').trim()).filter(Boolean).join(' ');

/**
 * Имя и фамилия из запроса: новые клиенты присылают first_name/last_name,
 * старые — одно display_name. Возвращает, что записать в users.
 */
export function namesFromBody(body: { first_name?: string; last_name?: string; display_name?: string }, fallback: string) {
  if (body.first_name !== undefined || body.last_name !== undefined) {
    const first = (body.first_name || '').trim();
    const last = (body.last_name || '').trim();
    return { first_name: first, last_name: last, display_name: joinName(first, last) || fallback };
  }
  const display = (body.display_name || '').trim() || fallback;
  const { first, last } = splitFullName(body.display_name);
  return { first_name: first || null, last_name: last, display_name: display };
}
