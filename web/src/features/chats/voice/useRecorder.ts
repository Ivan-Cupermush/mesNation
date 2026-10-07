import { useCallback, useEffect, useRef, useState } from 'react';
import { dbToLevel, encodeWaveform } from './waveform';

export type RecKind = 'voice' | 'video_note';

export interface Recording {
  file: File;
  kind: RecKind;
  /** Секунды. */
  duration: number;
  waveform: string | null;
  /** blob: — чтобы сразу проиграть у себя, не дожидаясь сервера. */
  url: string;
}

export type RecPhase = 'idle' | 'starting' | 'recording' | 'preview';

/** Кружочек — до минуты, как в Telegram. */
export const VIDEO_NOTE_MAX_S = 60;
/** Короче — не отправляем (случайное нажатие). */
const MIN_MS = 800;
const LIVE_BARS = 44;

const VOICE_TYPES = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4', 'audio/webm'];
const VIDEO_TYPES = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/mp4;codecs=avc1,mp4a', 'video/mp4', 'video/webm'];

function pickType(list: string[]): string | undefined {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') return undefined;
  return list.find((t) => MediaRecorder.isTypeSupported(t));
}

function extFor(mime: string, kind: RecKind) {
  if (mime.includes('ogg')) return '.ogg';
  if (mime.includes('mp4')) return kind === 'voice' ? '.m4a' : '.mp4';
  return '.webm';
}

export class RecorderError extends Error {}

/** Почему не получилось начать запись — понятным языком. */
function explain(e: unknown, kind: RecKind): RecorderError {
  const name = e instanceof DOMException ? e.name : '';
  const what = kind === 'voice' ? 'микрофону' : 'камере и микрофону';
  if (name === 'NotAllowedError' || name === 'SecurityError') return new RecorderError(`Нет доступа к ${what}. Разрешите его в настройках сайта (значок замка в адресной строке).`);
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return new RecorderError(kind === 'voice' ? 'Микрофон не найден' : 'Камера не найдена');
  if (name === 'NotReadableError') return new RecorderError(kind === 'voice' ? 'Микрофон занят другой программой' : 'Камера занята другой программой');
  return new RecorderError(e instanceof Error ? e.message : 'Не удалось начать запись');
}

/**
 * Запись голосового (микрофон + уровни громкости для волны) или кружочка
 * (камера + микрофон). Готовая запись уходит в onRecorded; с замком можно
 * сначала прослушать (phase = 'preview').
 */
export function useRecorder({ onRecorded, onError }: { onRecorded: (r: Recording) => void; onError: (e: Error) => void }) {
  const [phase, setPhase] = useState<RecPhase>('idle');
  const [kind, setKind] = useState<RecKind>('voice');
  const [locked, setLocked] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [live, setLive] = useState<number[]>([]);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [preview, setPreview] = useState<Recording | null>(null);

  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  const levels = useRef<number[]>([]);
  const ctx = useRef<AudioContext | null>(null);
  const timers = useRef<number[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  /** Что сделать, когда запись остановится; во время «starting» — отменить старт. */
  const after = useRef<'send' | 'preview' | 'cancel' | null>(null);
  const phaseRef = useRef<RecPhase>('idle');
  const cb = useRef({ onRecorded, onError });
  cb.current = { onRecorded, onError };

  const go = (p: RecPhase) => {
    phaseRef.current = p;
    setPhase(p);
  };

  const cleanup = useCallback(() => {
    timers.current.forEach((t) => window.clearInterval(t));
    timers.current = [];
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStream(null);
    ctx.current?.close().catch(() => undefined);
    ctx.current = null;
    rec.current = null;
  }, []);

  const finish = useCallback(
    (blob: Blob, mime: string, k: RecKind) => {
      const ms = Date.now() - startedAt.current;
      const action = after.current;
      after.current = null;
      cleanup();
      setLocked(false);
      if (action === 'cancel' || ms < MIN_MS || !blob.size) {
        go('idle');
        return;
      }
      const type = mime || blob.type || (k === 'voice' ? 'audio/webm' : 'video/webm');
      const base = k === 'voice' ? 'voice' : 'video_note';
      const file = new File([blob], base + extFor(type, k), { type: type.split(';')[0] });
      const r: Recording = {
        file,
        kind: k,
        duration: Math.round(ms / 100) / 10,
        waveform: k === 'voice' ? encodeWaveform(levels.current) : null,
        url: URL.createObjectURL(file),
      };
      if (action === 'preview') {
        setPreview(r);
        go('preview');
        return;
      }
      go('idle');
      cb.current.onRecorded(r);
    },
    [cleanup],
  );

  const start = useCallback(
    async (k: RecKind) => {
      if (phaseRef.current !== 'idle') return;
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
        cb.current.onError(new RecorderError('Браузер не умеет записывать. Откройте сайт по https в Chrome, Edge, Firefox или Safari.'));
        return;
      }
      after.current = null;
      setKind(k);
      setLocked(false);
      setElapsed(0);
      setLive([]);
      levels.current = [];
      go('starting');
      let media: MediaStream;
      try {
        media = await navigator.mediaDevices.getUserMedia(
          k === 'voice'
            ? { audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }
            : {
                audio: { echoCancellation: true, noiseSuppression: true },
                video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 640 }, aspectRatio: { ideal: 1 } },
              },
        );
      } catch (e) {
        go('idle');
        cb.current.onError(explain(e, k));
        return;
      }
      // Кнопку отпустили, пока браузер спрашивал разрешение, — не начинаем.
      if (after.current) {
        media.getTracks().forEach((t) => t.stop());
        after.current = null;
        go('idle');
        return;
      }
      streamRef.current = media;
      setStream(media);

      const mime = pickType(k === 'voice' ? VOICE_TYPES : VIDEO_TYPES);
      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(media, {
          ...(mime ? { mimeType: mime } : {}),
          audioBitsPerSecond: 64_000,
          ...(k === 'video_note' ? { videoBitsPerSecond: 1_000_000 } : {}),
        });
      } catch (e) {
        cleanup();
        go('idle');
        cb.current.onError(explain(e, k));
        return;
      }
      chunks.current = [];
      recorder.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      recorder.onstop = () => finish(new Blob(chunks.current, { type: recorder.mimeType || mime }), recorder.mimeType || mime || '', k);
      recorder.onerror = () => {
        after.current = 'cancel';
        if (recorder.state !== 'inactive') recorder.stop();
      };
      rec.current = recorder;
      recorder.start(250);
      startedAt.current = Date.now();
      go('recording');

      // Уровни громкости — для живой волны и волны в сообщении.
      try {
        const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ac = new AC();
        ctx.current = ac;
        const analyser = ac.createAnalyser();
        analyser.fftSize = 1024;
        ac.createMediaStreamSource(media).connect(analyser);
        const buf = new Float32Array(analyser.fftSize);
        timers.current.push(
          window.setInterval(() => {
            analyser.getFloatTimeDomainData(buf);
            let sum = 0;
            for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
            const level = dbToLevel(20 * Math.log10(Math.sqrt(sum / buf.length) || 1e-8));
            levels.current.push(level);
            setLive((prev) => [...prev.slice(-(LIVE_BARS - 1)), level]);
          }, 60),
        );
      } catch {
        // без волны запись всё равно идёт
      }
      timers.current.push(
        window.setInterval(() => {
          const ms = Date.now() - startedAt.current;
          setElapsed(ms);
          if (k === 'video_note' && ms >= VIDEO_NOTE_MAX_S * 1000 && rec.current?.state === 'recording') {
            after.current = 'send';
            rec.current.stop();
          }
        }, 100),
      );
    },
    [cleanup, finish],
  );

  /** Остановить: отправить, отменить или (с замком) — прослушать перед отправкой. */
  const stop = useCallback((action: 'send' | 'preview' | 'cancel') => {
    if (phaseRef.current === 'starting') {
      after.current = 'cancel';
      return;
    }
    const r = rec.current;
    if (phaseRef.current !== 'recording' || !r) return;
    after.current = action;
    if (r.state !== 'inactive') r.stop();
  }, []);

  const lock = useCallback(() => {
    if (phaseRef.current === 'recording' || phaseRef.current === 'starting') setLocked(true);
  }, []);

  const sendPreview = useCallback(() => {
    if (!preview) return;
    setPreview(null);
    go('idle');
    cb.current.onRecorded(preview);
  }, [preview]);

  const discardPreview = useCallback(() => {
    if (preview) URL.revokeObjectURL(preview.url);
    setPreview(null);
    go('idle');
  }, [preview]);

  // Ушли из чата посреди записи — ничего не отправляем.
  useEffect(
    () => () => {
      after.current = 'cancel';
      if (rec.current && rec.current.state !== 'inactive') rec.current.stop();
      cleanup();
    },
    [cleanup],
  );

  return { phase, kind, locked, elapsed, live, stream, preview, start, stop, lock, sendPreview, discardPreview };
}

export type RecorderApi = ReturnType<typeof useRecorder>;
