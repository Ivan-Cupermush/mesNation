/**
 * Одновременно звучит что-то одно: включили кружочек — голосовое на паузу,
 * и наоборот (как в Telegram).
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
