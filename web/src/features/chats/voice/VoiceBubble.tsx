import { useMemo } from 'react';
import { formatDuration } from '../../../lib/format';
import { Spinner } from '../../../ui/Spinner';
import { UploadRing } from '../UploadRing';
import type { Message } from '../types';
import { decodeWaveform } from './waveform';
import { Waveform } from './Waveform';
import { useVoiceFor } from './voicePlayer';
import s from './voice.module.css';

/** Треугольник «играть» и «пауза» — залитые, как в Telegram. */
export function PlayGlyph({ playing, size = 18 }: { playing: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      {playing ? (
        <>
          <rect x="5" y="4" width="5" height="16" rx="1.5" fill="currentColor" />
          <rect x="14" y="4" width="5" height="16" rx="1.5" fill="currentColor" />
        </>
      ) : (
        <path d="M7 4.8v14.4c0 .9 1 1.5 1.8 1L20 13c.7-.5.7-1.5 0-2L8.8 3.8C8 3.3 7 3.9 7 4.8Z" fill="currentColor" />
      )}
    </svg>
  );
}

/**
 * Голосовое в пузыре: круглая кнопка, волна (перемотка мышью или пальцем),
 * длительность и точка «не прослушано».
 */
export default function VoiceBubble({
  msg,
  mine,
  unlistened,
  onPlay,
  onSeek,
  onCancel,
}: {
  msg: Message;
  mine: boolean;
  unlistened: boolean;
  onPlay: (msg: Message) => void;
  onSeek: (msg: Message, ratio: number) => void;
  onCancel?: (msg: Message) => void;
}) {
  const st = useVoiceFor(msg);
  const levels = useMemo(() => decodeWaveform(msg.media_waveform, msg.id > 0 ? msg.id : msg.client_id || 1), [msg.media_waveform, msg.id, msg.client_id]);
  const duration = st?.duration ? st.duration / 1000 : Number(msg.media_duration || 0);
  const progress = st && st.duration ? Math.min(1, st.position / st.duration) : 0;
  const playing = !!st?.playing;
  const sending = msg.pending === 'sending';

  return (
    <div className={[s.voice, mine ? s.voiceOut : s.voiceIn].join(' ')}>
      {sending ? (
        <span className={s.playBtn}>
          <UploadRing progress={msg.progress} size={44} onCancel={onCancel ? () => onCancel(msg) : undefined} />
        </span>
      ) : (
        <button
          type="button"
          className={s.playBtn}
          onClick={(e) => {
            e.stopPropagation();
            if (!msg.pending) onPlay(msg);
          }}
          aria-label={playing ? 'Пауза' : 'Слушать голосовое'}
        >
          {st?.loading ? <Spinner size={20} inherit /> : <PlayGlyph playing={playing} size={20} />}
        </button>
      )}
      <span className={s.voiceBody}>
        <Waveform levels={levels} progress={progress} className={s.wave} onSeek={sending || msg.pending ? undefined : (r) => onSeek(msg, r)} />
        <span className={s.voiceMeta}>
          <span className={s.voiceTime}>{formatDuration(st && (playing || st.position > 0) ? st.position / 1000 : duration)}</span>
          {unlistened && <span className={s.dot} aria-label="Не прослушано" />}
        </span>
      </span>
    </div>
  );
}
