/**
 * Один звук за раз: голосовое, кружочек или видео. Кто начинает играть,
 * «забирает фокус» — остальные ставятся на паузу (как в Telegram).
 */
type Listener = (owner: string) => void;
const listeners = new Set<Listener>();

export function claimMediaFocus(owner: string) {
  listeners.forEach((l) => l(owner));
}

export function onMediaFocus(l: Listener): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
