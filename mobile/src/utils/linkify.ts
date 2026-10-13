/** Текст сообщения → куски текста и ссылки (как на сайте, web/src/features/chats/model.ts). */
export function linkify(text: string): (string | { url: string })[] {
  const parts: (string | { url: string })[] = [];
  const re = /\bhttps?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]]/gi;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push({ url: m[0] });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}
