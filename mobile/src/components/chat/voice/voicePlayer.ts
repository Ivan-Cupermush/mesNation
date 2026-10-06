import AsyncStorage from '@react-native-async-storage/async-storage';
import type { createSound, PlayBackType } from 'react-native-nitro-sound';
import { cachedSignedUrl } from '../../../services/http';
import { claimMediaFocus, onMediaFocus } from './mediaFocus';

/**
 * Плеер голосовых сообщений — один на приложение, как в Telegram:
 * - нажали другое голосовое — предыдущее останавливается;
 * - после окончания сам включается следующее голосовое в чате;
 * - скорость 1x / 1.5x / 2x запоминается;
 * - пузырь и полоска плеера сверху подписаны на его состояние.
 */

type SoundType = ReturnType<typeof createSound>;

export const SPEEDS = [1, 1.5, 2];
const SPEED_KEY = '@offix/voice/speed';
const FOCUS_OWNER = 'voice';

export interface VoiceState {
  msg: any | null;
  playing: boolean;
  loading: boolean;
  /** Позиция и длительность, мс. */
  position: number;
  duration: number;
  speed: number;
}

let state: VoiceState = { msg: null, playing: false, loading: false, position: 0, duration: 0, speed: 1 };
const listeners = new Set<(s: VoiceState) => void>();
let queue: any[] = [];
let token = 0;
let onStart: ((msg: any) => void) | null = null;
let sound: SoundType | null = null;

AsyncStorage.getItem(SPEED_KEY)
  .then((v) => {
    const s = Number(v);
    if (SPEEDS.includes(s)) set({ speed: s });
  })
  .catch(() => undefined);

// Кружочек или видео начали играть — голосовое на паузу.
onMediaFocus((owner) => {
  if (owner !== FOCUS_OWNER && state.playing) pauseVoice();
});

function getSound(): SoundType {
  if (!sound) {
    // Нативный модуль подключаем лениво: экран чата открывается и там,
    // где голосовых нет (и в тестах).
    const mod = require('react-native-nitro-sound');
    sound = mod.createSound() as SoundType;
    sound.setSubscriptionDuration(0.05);
  }
  return sound;
}

function set(patch: Partial<VoiceState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l(state));
}

export const getVoiceState = () => state;

export function subscribeVoice(l: (s: VoiceState) => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** Вызывается при начале прослушивания (отметить «прослушано»). */
export function setVoiceStartHandler(fn: ((msg: any) => void) | null) {
  onStart = fn;
}

const isCurrent = (msg: any) => !!state.msg && !!msg && (state.msg.id === msg.id || (!!msg.client_id && state.msg.client_id === msg.client_id));

/**
 * Нажатие на кнопку в пузыре: играть, пауза или продолжить.
 * next — голосовые после этого (для автопродолжения).
 */
export async function toggleVoice(msg: any, next: any[] = [], fromRatio?: number) {
  if (isCurrent(msg) && fromRatio === undefined) {
    if (state.playing || state.loading) return pauseVoice();
    return resumeVoice();
  }
  return startVoice(msg, next, fromRatio);
}

async function startVoice(msg: any, next: any[], fromRatio?: number) {
  const my = ++token;
  queue = next;
  claimMediaFocus(FOCUS_OWNER);
  const knownDuration = Math.round(Number(msg.media_duration || 0) * 1000);
  set({ msg, playing: false, loading: true, position: fromRatio ? fromRatio * knownDuration : 0, duration: knownDuration });
  try {
    const s = getSound();
    const uri = msg.local_uri || (await cachedSignedUrl(msg.file_url));
    if (my !== token) return;
    s.removePlayBackListener();
    s.removePlaybackEndListener();
    s.addPlayBackListener((e: PlayBackType) => {
      if (my !== token) return;
      set({ position: e.currentPosition, duration: e.duration || state.duration, loading: false });
    });
    s.addPlaybackEndListener(() => {
      if (my === token) finished();
    });
    await s.startPlayer(uri);
    if (my !== token) return;
    if (state.speed !== 1) await s.setPlaybackSpeed(state.speed).catch(() => undefined);
    if (fromRatio && knownDuration) await s.seekToPlayer(fromRatio * knownDuration).catch(() => undefined);
    set({ playing: true, loading: false });
    onStart?.(msg);
  } catch (e) {
    if (my === token) set({ playing: false, loading: false, msg: null });
    throw e;
  }
}

function finished() {
  const next = queue.shift();
  if (next) {
    startVoice(next, queue).catch(() => undefined);
  } else {
    set({ msg: null, playing: false, loading: false, position: 0 });
  }
}

export async function pauseVoice() {
  if (!state.msg) return;
  // Ещё грузится — отменяем запуск совсем, иначе заиграет после «паузы».
  if (state.loading) return stopVoice();
  set({ playing: false, loading: false });
  await getSound().pausePlayer().catch(() => undefined);
}

export async function resumeVoice() {
  if (!state.msg) return;
  claimMediaFocus(FOCUS_OWNER);
  const s = getSound();
  await s.resumePlayer().catch(() => undefined);
  // На части Android смена скорости на паузе сама запускает звук — ставим после.
  if (state.speed !== 1) await s.setPlaybackSpeed(state.speed).catch(() => undefined);
  set({ playing: true });
}

/** Перемотка по волне (0..1). Чужое голосовое начинает играть с этого места. */
export async function seekVoice(msg: any, ratio: number, next: any[] = []) {
  const r = Math.max(0, Math.min(1, ratio));
  if (!isCurrent(msg)) return startVoice(msg, next, r);
  const ms = r * (state.duration || 0);
  set({ position: ms });
  await getSound().seekToPlayer(ms).catch(() => undefined);
}

export async function cycleVoiceSpeed() {
  const speed = SPEEDS[(SPEEDS.indexOf(state.speed) + 1) % SPEEDS.length];
  set({ speed });
  AsyncStorage.setItem(SPEED_KEY, String(speed)).catch(() => undefined);
  if (state.playing) await getSound().setPlaybackSpeed(speed).catch(() => undefined);
}

export async function stopVoice() {
  token++;
  queue = [];
  if (!state.msg) return;
  set({ msg: null, playing: false, loading: false, position: 0 });
  await getSound().stopPlayer().catch(() => undefined);
}

export const isVoicePlaying = (msg: any) => isCurrent(msg) && (state.playing || state.loading);
