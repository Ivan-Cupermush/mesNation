import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertCircle, VolumeX } from 'lucide-react';
import { formatDuration } from '../../../lib/format';
import { UploadRing } from '../UploadRing';
import type { Message } from '../types';
import { claimMediaFocus, onMediaFocus } from './mediaFocus';
import { pauseVoice } from './voicePlayer';
import { cachedSignedUrl } from './signedUrl';
import s from './voice.module.css';

export const VIDEO_NOTE_SIZE = 240;

/**
 * Кружочек как в Telegram: в ленте крутится без звука; нажатие — с начала
 * со звуком и кольцом прогресса, повторное — пауза. Видео грузится, только
 * когда кружочек виден на экране.
 */
export default function VideoNoteBubble({
  msg,
  unlistened,
  meta,
  onPlayed,
  onCancel,
}: {
  msg: Message;
  unlistened: boolean;
  meta: ReactNode;
  onPlayed: (msg: Message) => void;
  onCancel?: (msg: Message) => void;
}) {
  const D = Math.min(VIDEO_NOTE_SIZE, typeof window !== 'undefined' ? Math.round(window.innerWidth * 0.64) : VIDEO_NOTE_SIZE);
  const ref = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [visible, setVisible] = useState(false);
  const [url, setUrl] = useState<string | null>(msg.localUrl || null);
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState(false);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [left, setLeft] = useState<number | null>(null);
  const owner = useRef(`video_note:${msg.client_id || msg.id}`);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (url || !visible || !msg.file_url || msg.pending) return;
    let alive = true;
    cachedSignedUrl(msg.file_url)
      .then((u) => alive && setUrl(u))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [url, visible, msg.file_url, msg.pending]);

  // Не виден — без звука и не тратим процессор.
  useEffect(() => {
    const v = video.current;
    if (!v || !url) return;
    if (!visible) {
      v.pause();
      return;
    }
    if (!active) v.play().catch(() => undefined);
  }, [visible, url, active]);

  // Кто-то другой заиграл — пауза.
  useEffect(
    () =>
      onMediaFocus((who) => {
        if (who !== owner.current && active && !video.current?.paused) {
          video.current?.pause();
          setPaused(true);
        }
      }),
    [active],
  );

  const stopActive = () => {
    const v = video.current;
    setActive(false);
    setPaused(false);
    setProgress(0);
    setLeft(null);
    if (v) {
      v.muted = true;
      v.loop = true;
      v.play().catch(() => undefined);
    }
  };

  const onClick = () => {
    const v = video.current;
    if (!v || msg.pending) return;
    if (!active) {
      pauseVoice();
      claimMediaFocus(owner.current);
      v.currentTime = 0;
      v.muted = false;
      v.loop = false;
      v.play()
        .then(() => {
          setActive(true);
          setPaused(false);
          onPlayed(msg);
        })
        .catch(() => {
          v.muted = true;
        });
      return;
    }
    if (v.paused) {
      claimMediaFocus(owner.current);
      v.play().catch(() => undefined);
      setPaused(false);
    } else {
      v.pause();
      setPaused(true);
    }
  };

  const ringR = D / 2 + 4;
  const circ = 2 * Math.PI * ringR;
  const duration = Number(msg.media_duration || 0);

  return (
    <div ref={ref} className={s.note} style={{ width: D, height: D }}>
      <button type="button" className={s.noteCircle} style={{ width: D, height: D }} onClick={(e) => (e.stopPropagation(), onClick())} aria-label={active && !paused ? 'Пауза' : 'Смотреть видеосообщение'}>
        {msg.thumb_url && !url && <img src={msg.thumb_url} alt="" className={s.noteMedia} draggable={false} />}
        {url && (
          <video
            ref={video}
            className={s.noteMedia}
            src={url}
            poster={msg.thumb_url || undefined}
            muted
            loop
            playsInline
            preload="metadata"
            onTimeUpdate={(e) => {
              const v = e.currentTarget;
              if (!active || !v.duration) return;
              setProgress(v.currentTime / v.duration);
              setLeft(Math.max(0, v.duration - v.currentTime));
            }}
            onEnded={() => active && stopActive()}
            onError={() => setFailed(true)}
          />
        )}
        {!url && !msg.thumb_url && <span className={s.notePlaceholder} />}
        {failed && (
          <span className={s.noteOverlay}>
            <AlertCircle size={28} />
          </span>
        )}
        {msg.pending === 'sending' && (
          <span className={s.noteOverlay}>
            <UploadRing progress={msg.progress} onCancel={onCancel ? () => onCancel(msg) : undefined} size={52} />
          </span>
        )}
      </button>
      {active && (
        <svg className={s.noteRing} width={D + 12} height={D + 12} aria-hidden>
          <circle
            cx={D / 2 + 6}
            cy={D / 2 + 6}
            r={ringR}
            fill="none"
            stroke="currentColor"
            strokeWidth={3}
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={circ * (1 - progress)}
            transform={`rotate(-90 ${D / 2 + 6} ${D / 2 + 6})`}
          />
        </svg>
      )}
      {!msg.pending && (
        <span className={s.noteBadge}>
          {formatDuration(active && left !== null ? left : duration)}
          {!active && <VolumeX size={12} />}
          {unlistened && <span className={s.noteDot} />}
        </span>
      )}
      <span className={s.noteMeta}>{meta}</span>
    </div>
  );
}
