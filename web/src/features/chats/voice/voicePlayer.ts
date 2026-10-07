import { useSyncExternalStore } from 'react';
import { storage } from '../../../lib/storage';
import type { Message } from '../types';
import { claimMediaFocus, onMediaFocus } from './mediaFocus';
import { cachedSignedUrl } from './signedUrl';

/**
 * Плеер голосовых — один на сайт, как в Telegram:
 * - включили другое голосовое — предыдущее останавливается;
 * - после окончания само включается следующее голосовое в чате;
 * - скорость 1x / 1.5x / 2x запоминается;
 * - пузыри и полоска плеера над лентой подписаны на его состояние.
 */

export const SPEEDS = [1, 1.5, 2];
const SPEED_KEY = 'offix.voice.speed';
const FOCUS_OWNER = 'voice';

export interface VoiceState {
  msg: Message | null;
  playing: boolean;
  loading: boolean;
  /** Позиция и длительность, мс. */
  position: number;
  duration: number;
  speed: number;
}

const savedSpeed = Number(storage.get(SPEED_KEY));
let state: VoiceState = { msg: null, playing: false, loading: false, position: 0, duration: 0, speed: SPEEDS.includes(savedSpeed) ? savedSpeed : 1 };
const listeners = new Set<() => void>();
let queue: Message[] = [];
let token = 0;
let onStart: ((msg: Message) => void) | null = null;
let onError: ((e: unknown) => void) | null = null;
let audio: HTMLAudioElement | null = null;
let raf = 0;

onMediaFocus((owner) => {
  if (owner !== FOCUS_OWNER && state.playing) pauseVoice();
});

function set(patch: Partial<VoiceState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

function el(): HTMLAudioElement {
  if (!audio) {
    audio = new Audio();
    audio.preload = 'auto';
    audio.addEventListener('ended', () => finished());
    audio.addEventListener('loadedmetadata', () => {
      if (audio && Number.isFinite(audio.duration)) set({ duration: audio.duration * 1000 });
    });
  }
  return audio;
}

// Позиция обновляется каждый кадр — волна заполняется плавно, а не рывками timeupdate.
function tick() {
  cancelAnimationFrame(raf);
  const loop = () => {
    if (!audio || !state.playing) return;
    set({ position: audio.currentTime * 1000 });
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
}

export const getVoiceState = () => state;

export function subscribeVoice(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** Начали слушать (отметить «прослушано») и ошибка воспроизведения. */
export function setVoiceHandlers(handlers: { onStart?: ((msg: Message) => void) | null; onError?: ((e: unknown) => void) | null }) {
  if ('onStart' in handlers) onStart = handlers.onStart ?? null;
  if ('onError' in handlers) onError = handlers.onError ?? null;
}

const same = (a: Message | null, b: Message | null) => !!a && !!b && (a.id === b.id || (!!b.client_id && a.client_id === b.client_id));

/**
 * Кнопка в пузыре: играть, пауза или продолжить.
 * next — голосовые после этого (автопродолжение).
 */
export function toggleVoice(msg: Message, next: Message[] = []) {
  if (same(state.msg, msg)) {
    if (state.playing || state.loading) return pauseVoice();
    return resumeVoice();
  }
  return startVoice(msg, next);
}

async function startVoice(msg: Message, next: Message[], fromRatio?: number) {
  const my = ++token;
  queue = next;
  claimMediaFocus(FOCUS_OWNER);
  const known = Math.round(Number(msg.media_duration || 0) * 1000);
  set({ msg, playing: false, loading: true, position: fromRatio ? fromRatio * known : 0, duration: known });
  const a = el();
  try {
    const src = msg.localUrl || (msg.file_url ? await cachedSignedUrl(msg.file_url) : null);
    if (!src) throw new Error('Файл недоступен');
    if (my !== token) return;
    a.pause();
    a.src = src;
    a.playbackRate = state.speed;
    if (fromRatio) {
      await new Promise<void>((resolve) => {
        const go = () => {
          a.currentTime = fromRatio * mediaSeconds(a, known / 1000);
          resolve();
        };
        if (a.readyState >= 1) go();
        else {
          a.addEventListener('loadedmetadata', go, { once: true });
          // Файл не открылся — дальше play() сообщит об ошибке.
          a.addEventListener('error', () => resolve(), { once: true });
        }
      });
    }
    await a.play();
    if (my !== token) return;
    // Скорость сбрасывается при смене src в части браузеров — ставим ещё раз.
    a.playbackRate = state.speed;
    set({ playing: true, loading: false });
    tick();
    onStart?.(msg);
  } catch (e) {
    if (my !== token) return;
    set({ msg: null, playing: false, loading: false, position: 0 });
    onError?.(e);
  }
}

/**
 * Длительность для перемотки. У WebM из браузерной записи длительности в
 * файле нет (Infinity) — берём известную из сообщения.
 */
function mediaSeconds(a: HTMLAudioElement, fallback: number) {
  return Number.isFinite(a.duration) && a.duration > 0 ? a.duration : fallback;
}

function finished() {
  cancelAnimationFrame(raf);
  const next = queue.shift();
  if (next) startVoice(next, queue);
  else set({ msg: null, playing: false, loading: false, position: 0 });
}

export function pauseVoice() {
  if (!state.msg) return;
  // Ещё грузится — отменяем запуск совсем, иначе заиграет после «паузы».
  if (state.loading) return stopVoice();
  audio?.pause();
  cancelAnimationFrame(raf);
  set({ playing: false, position: (audio?.currentTime || 0) * 1000 });
}

export function resumeVoice() {
  if (!state.msg || !audio) return;
  claimMediaFocus(FOCUS_OWNER);
  audio.playbackRate = state.speed;
  audio
    .play()
    .then(() => {
      set({ playing: true });
      tick();
    })
    .catch((e) => onError?.(e));
}

/** Перемотка по волне (0..1). Другое голосовое начинает играть с этого места. */
export function seekVoice(msg: Message, ratio: number, next: Message[] = []) {
  const r = Math.max(0, Math.min(1, ratio));
  if (!same(state.msg, msg)) return startVoice(msg, next, r);
  if (!audio) return;
  const dur = mediaSeconds(audio, state.duration / 1000);
  audio.currentTime = r * dur;
  set({ position: r * dur * 1000 });
}

/** Перемотка на секунды вперёд/назад (стрелки на клавиатуре). */
export function skipVoice(seconds: number) {
  if (!audio || !state.msg) return;
  audio.currentTime = Math.max(0, Math.min(mediaSeconds(audio, state.duration / 1000), audio.currentTime + seconds));
  set({ position: audio.currentTime * 1000 });
}

export function cycleVoiceSpeed() {
  const speed = SPEEDS[(SPEEDS.indexOf(state.speed) + 1) % SPEEDS.length];
  storage.set(SPEED_KEY, String(speed));
  if (audio) audio.playbackRate = speed;
  set({ speed });
}

export function stopVoice() {
  token++;
  queue = [];
  cancelAnimationFrame(raf);
  if (audio) {
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
  }
  if (state.msg) set({ msg: null, playing: false, loading: false, position: 0 });
}

const NONE = null;

/** Состояние плеера для одного сообщения; у остальных пузырей перерисовок нет. */
export function useVoiceFor(msg: Message): VoiceState | null {
  return useSyncExternalStore(subscribeVoice, () => (same(state.msg, msg) ? state : NONE));
}

export function useVoiceState(): VoiceState {
  return useSyncExternalStore(subscribeVoice, getVoiceState);
}
