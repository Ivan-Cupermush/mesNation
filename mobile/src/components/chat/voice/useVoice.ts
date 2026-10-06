import { useEffect, useState } from 'react';
import { getVoiceState, subscribeVoice, VoiceState } from './voicePlayer';

const same = (a: any, b: any) => !!a && !!b && (a.id === b.id || (!!b.client_id && a.client_id === b.client_id));

/**
 * Состояние плеера для конкретного голосового. Пузыри, которые сейчас
 * не играют, не перерисовываются на каждый тик прогресса.
 */
export function useVoiceFor(msg: any): VoiceState | null {
  const [s, setS] = useState<VoiceState | null>(() => (same(getVoiceState().msg, msg) ? getVoiceState() : null));
  useEffect(
    () =>
      subscribeVoice((next) => {
        const mine = same(next.msg, msg);
        setS((prev) => (mine ? next : prev === null ? prev : null));
      }),
    [msg],
  );
  return s;
}

/** Всё состояние плеера (полоска сверху чата). */
export function useVoiceState(): VoiceState {
  const [s, setS] = useState(getVoiceState);
  useEffect(() => subscribeVoice(setS), []);
  return s;
}
