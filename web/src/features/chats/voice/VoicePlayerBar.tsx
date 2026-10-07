import { X } from 'lucide-react';
import { formatDuration } from '../../../lib/format';
import { IconButton } from '../../../ui/Button';
import type { Message } from '../types';
import { PlayGlyph } from './VoiceBubble';
import { cycleVoiceSpeed, pauseVoice, resumeVoice, stopVoice, useVoiceState } from './voicePlayer';
import s from './voice.module.css';

/**
 * Полоска над лентой, пока играет голосовое (как в Telegram): пауза,
 * кто и когда записал, скорость, закрыть. Нажатие на имя — к сообщению.
 */
export default function VoicePlayerBar({ nameOf, onOpen }: { nameOf: (m: Message) => string; onOpen: (m: Message) => void }) {
  const st = useVoiceState();
  if (!st.msg) return null;
  const msg = st.msg;
  const ratio = st.duration ? Math.min(1, st.position / st.duration) : 0;
  return (
    <div className={s.bar}>
      <button
        type="button"
        className={s.barPlay}
        onClick={() => (st.playing || st.loading ? pauseVoice() : resumeVoice())}
        aria-label={st.playing ? 'Пауза' : 'Продолжить'}
      >
        <PlayGlyph playing={st.playing || st.loading} size={18} />
      </button>
      <button type="button" className={s.barBody} onClick={() => onOpen(msg)}>
        <span className={s.barName}>{nameOf(msg)}</span>
        <span className={s.barSub}>
          {msg.media_kind === 'video_note' ? 'Видеосообщение' : 'Голосовое сообщение'} · {formatDuration(st.position / 1000)} / {formatDuration(st.duration / 1000)}
        </span>
      </button>
      <button type="button" className={[s.barSpeed, st.speed !== 1 && s.barSpeedOn].filter(Boolean).join(' ')} onClick={cycleVoiceSpeed} title="Скорость">
        {st.speed}x
      </button>
      <IconButton label="Закрыть плеер" size={34} onClick={stopVoice}>
        <X size={18} />
      </IconButton>
      <span className={s.barProgress} style={{ width: `${ratio * 100}%` }} />
    </div>
  );
}
