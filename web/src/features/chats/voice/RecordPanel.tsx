import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronUp, Lock, Square, Trash2 } from 'lucide-react';
import { formatDuration } from '../../../lib/format';
import type { RecorderApi } from './useRecorder';
import { VIDEO_NOTE_MAX_S } from './useRecorder';
import { decodeWaveform, recordTimer } from './waveform';
import { Waveform } from './Waveform';
import { PlayGlyph } from './VoiceBubble';
import s from './record.module.css';

/**
 * Поле ввода во время записи (как в Telegram):
 * - удержание: красная точка, таймер, «влево — отмена», над кнопкой — замок;
 * - с замком: корзина, таймер с живой волной, «стоп» (прослушать);
 * - прослушивание: корзина, плеер записи.
 */
export function RecordPanel({ rec, dragX }: { rec: RecorderApi; dragX: number }) {
  if (rec.phase === 'preview' && rec.preview) {
    return (
      <div className={s.panel}>
        <button type="button" className={s.trash} onClick={rec.discardPreview} aria-label="Удалить запись" title="Удалить">
          <Trash2 size={21} />
        </button>
        <PreviewPlayer url={rec.preview.url} duration={rec.preview.duration} waveform={rec.preview.waveform} />
      </div>
    );
  }

  const starting = rec.phase === 'starting';
  return (
    <div className={s.panel}>
      {rec.locked && (
        <button type="button" className={s.trash} onClick={() => rec.stop('cancel')} aria-label="Отменить запись" title="Отменить">
          <Trash2 size={21} />
        </button>
      )}
      <span className={s.timer}>
        <span className={[s.redDot, starting && s.redDotWait].filter(Boolean).join(' ')} />
        {recordTimer(rec.elapsed)}
      </span>
      {rec.locked ? (
        <>
          {rec.kind === 'voice' ? <LiveWave levels={rec.live} /> : <span className={s.hint}>Видеосообщение</span>}
          {rec.kind === 'voice' && (
            <button type="button" className={s.stop} onClick={() => rec.stop('preview')} aria-label="Остановить и прослушать" title="Остановить и прослушать">
              <Square size={14} fill="currentColor" />
            </button>
          )}
        </>
      ) : (
        <span className={s.slide} style={{ transform: `translateX(${-Math.min(dragX, 140) * 0.6}px)`, opacity: 1 - Math.min(dragX, 140) / 180 }}>
          <ChevronLeft size={16} />
          {starting ? 'Подключаю микрофон…' : 'Влево — отмена'}
        </span>
      )}
    </div>
  );
}

/** Замок над кнопкой записи: потянуть вверх — запись без удержания. */
export function LockHint({ dragY }: { dragY: number }) {
  const p = Math.min(1, Math.max(0, dragY) / 80);
  return (
    <span className={s.lock} style={{ transform: `translateY(${-p * 18}px)` }} aria-hidden>
      <Lock size={16} />
      <ChevronUp size={14} className={s.lockArrow} />
    </span>
  );
}

function LiveWave({ levels }: { levels: number[] }) {
  return (
    <span className={s.live} aria-hidden>
      {levels.map((v, i) => (
        <span key={i} style={{ height: `${Math.max(8, v * 100)}%` }} />
      ))}
    </span>
  );
}

function PreviewPlayer({ url, duration, waveform }: { url: string; duration: number; waveform: string | null }) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const levels = useMemo(() => decodeWaveform(waveform, url), [waveform, url]);

  useEffect(() => {
    const a = new Audio(url);
    audio.current = a;
    let raf = 0;
    const loop = () => {
      setPos(a.currentTime);
      raf = requestAnimationFrame(loop);
    };
    a.onplay = () => {
      setPlaying(true);
      raf = requestAnimationFrame(loop);
    };
    a.onpause = () => {
      setPlaying(false);
      cancelAnimationFrame(raf);
    };
    a.onended = () => {
      setPlaying(false);
      setPos(0);
      cancelAnimationFrame(raf);
    };
    return () => {
      cancelAnimationFrame(raf);
      a.pause();
      audio.current = null;
    };
  }, [url]);

  return (
    <span className={s.preview}>
      <button
        type="button"
        className={s.previewPlay}
        onClick={() => (playing ? audio.current?.pause() : audio.current?.play().catch(() => undefined))}
        aria-label={playing ? 'Пауза' : 'Прослушать'}
      >
        <PlayGlyph playing={playing} size={16} />
      </button>
      <Waveform
        levels={levels}
        progress={duration ? pos / duration : 0}
        width={150}
        height={22}
        className={s.previewWave}
        onSeek={(r) => {
          if (audio.current) audio.current.currentTime = r * duration;
          setPos(r * duration);
        }}
      />
      <span className={s.previewTime}>{formatDuration(playing || pos ? pos : duration)}</span>
    </span>
  );
}

/** Кружок с камерой поверх чата и кольцо — минута записи. */
export function VideoNoteOverlay({ rec }: { rec: RecorderApi }) {
  const video = useRef<HTMLVideoElement>(null);
  const D = Math.min(320, Math.round(Math.min(window.innerWidth, window.innerHeight) * 0.62));
  const R = D / 2 + 7;
  const circ = 2 * Math.PI * R;
  const progress = Math.min(1, rec.elapsed / (VIDEO_NOTE_MAX_S * 1000));

  useEffect(() => {
    if (video.current && rec.stream) {
      video.current.srcObject = rec.stream;
      video.current.play().catch(() => undefined);
    }
  }, [rec.stream]);

  return createPortal(
    <div className={s.overlay}>
      <div className={s.cam} style={{ width: D + 20, height: D + 20 }}>
        <div className={s.camCircle} style={{ width: D, height: D }}>
          <video ref={video} muted playsInline className={s.camVideo} />
          {!rec.stream && <span className={s.camWait}>Камера включается…</span>}
        </div>
        <svg width={D + 20} height={D + 20} className={s.camRing} aria-hidden>
          <circle cx={D / 2 + 10} cy={D / 2 + 10} r={R} stroke="rgba(255,255,255,0.22)" strokeWidth={4} fill="none" />
          <circle
            cx={D / 2 + 10}
            cy={D / 2 + 10}
            r={R}
            stroke="currentColor"
            strokeWidth={4}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={circ * (1 - progress)}
            transform={`rotate(-90 ${D / 2 + 10} ${D / 2 + 10})`}
          />
        </svg>
      </div>
    </div>,
    document.body,
  );
}
