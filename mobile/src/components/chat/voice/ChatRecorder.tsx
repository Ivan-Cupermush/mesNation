import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Animated, PanResponder, Vibration, Alert, Easing, Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Mic, Video, Lock, ChevronUp, Square, SendHorizonal, Trash2, SwitchCamera } from 'lucide-react-native';
import { T, themed } from '../../../theme/runtime';
import { withAlpha } from '../../../theme/palettes';
import { glass } from '../../../theme/glass';
import { C, formatDuration } from '../chatUtils';
import { cancelAudio, ensureCameraPermissions, ensureMicPermission, RecordedAudio, startAudio, stopAudio } from './audioRecorder';
import { encodeWaveform, recordTimer } from './waveformData';
import { stopVoice, toggleVoice } from './voicePlayer';
import { useVoiceFor } from './useVoice';
import Waveform from './Waveform';
import { PlayGlyph } from './VoiceBubble';

/**
 * Запись голосовых и кружочков — механика Telegram:
 * - нажатие на микрофон переключает режим: голос ↔ кружочек;
 * - удержание — запись; отпустил — отправилось;
 * - свайп влево — отмена; свайп вверх — замок (запись без рук);
 * - в замке: «Отмена», отправка большой кнопкой, у голосового — стоп
 *   и прослушивание перед отправкой.
 */

export type RecordMode = 'voice' | 'video';
export type RecordPhase = 'idle' | 'recording' | 'locked' | 'preview';

const MODE_KEY = '@offix/chat/recordMode';
const HOLD_MS = 180;
const CANCEL_DX = 110;
const LOCK_DY = 80;
const MIN_VOICE_MS = 700;
const MIN_VIDEO_MS = 1000;
export const VIDEO_NOTE_MAX_S = 60;

export interface VoiceResult {
  uri: string;
  durationMs: number;
  waveform: string;
}
export interface VideoNoteResult {
  uri: string;
  durationMs: number;
}

/** Управление камерой кружочка — регистрирует оверлей с камерой. */
export interface VideoNoteApi {
  stop: () => Promise<VideoNoteResult | null>;
  cancel: () => Promise<void>;
}

export interface ChatRecorder {
  mode: RecordMode;
  phase: RecordPhase;
  ms: number;
  hint: string | null;
  facing: 'front' | 'back';
  preview: RecordedAudio | null;
  level: Animated.Value;
  dx: Animated.Value;
  dy: Animated.Value;
  panHandlers: any;
  send: () => void;
  cancel: () => void;
  stopToPreview: () => void;
  flip: () => void;
  setVideoApi: (api: VideoNoteApi | null) => void;
  onVideoTick: (ms: number) => void;
  onVideoFinished: (res: VideoNoteResult | null) => void;
}

export function useChatRecorder({
  onVoice,
  onVideoNote,
}: {
  onVoice: (r: VoiceResult) => void;
  onVideoNote: (r: VideoNoteResult) => void;
}): ChatRecorder {
  const [mode, setMode] = useState<RecordMode>('voice');
  const [phase, setPhaseState] = useState<RecordPhase>('idle');
  const [ms, setMs] = useState(0);
  const [hint, setHint] = useState<string | null>(null);
  const [facing, setFacing] = useState<'front' | 'back'>('front');
  const [preview, setPreview] = useState<RecordedAudio | null>(null);
  const level = useRef(new Animated.Value(0)).current;
  const dx = useRef(new Animated.Value(0)).current;
  const dy = useRef(new Animated.Value(0)).current;

  const S = useRef({
    mode: 'voice' as RecordMode,
    phase: 'idle' as RecordPhase,
    holdTimer: null as any,
    pressed: false,
    // Удержание дошло до записи (даже если она не началась из-за разрешений).
    held: false,
    videoApi: null as VideoNoteApi | null,
  });
  const cb = useRef({ onVoice, onVideoNote });
  cb.current = { onVoice, onVideoNote };
  const hintTimer = useRef<any>(null);

  useEffect(() => {
    AsyncStorage.getItem(MODE_KEY)
      .then((m) => {
        if (m === 'video' || m === 'voice') {
          S.current.mode = m;
          setMode(m);
        }
      })
      .catch(() => undefined);
  }, []);

  const setPhase = (p: RecordPhase) => {
    S.current.phase = p;
    setPhaseState(p);
  };

  const resetGesture = () => {
    Animated.spring(dx, { toValue: 0, useNativeDriver: true, friction: 8 }).start();
    Animated.spring(dy, { toValue: 0, useNativeDriver: true, friction: 8 }).start();
  };

  const showHint = (text: string) => {
    setHint(text);
    clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => setHint(null), 2600);
  };

  const begin = async () => {
    const m = S.current.mode;
    const perm = m === 'voice' ? await ensureMicPermission() : await ensureCameraPermissions();
    if (perm === 'denied') {
      Alert.alert(
        m === 'voice' ? 'Нет доступа к микрофону' : 'Нет доступа к камере',
        'Разрешите доступ в настройках телефона, чтобы записывать сообщения.',
        [
          { text: 'Отмена', style: 'cancel' },
          { text: 'Настройки', onPress: () => Linking.openSettings() },
        ],
      );
      return;
    }
    // Разрешение только что выдали — палец уже отпущен; запись — со следующего нажатия.
    if (perm === 'asked' || !S.current.pressed) return;
    stopVoice();
    Vibration.vibrate(12);
    setMs(0);
    level.setValue(0);
    dx.setValue(0);
    dy.setValue(0);
    setPhase('recording');
    if (m === 'voice') {
      try {
        await startAudio((t, lv) => {
          setMs(t);
          Animated.timing(level, { toValue: lv, duration: 90, useNativeDriver: true }).start();
        });
        // Отпустили, пока микрофон запускался.
        if (S.current.phase === 'idle') cancelAudio();
      } catch (e: any) {
        setPhase('idle');
        Alert.alert('Не удалось начать запись', e?.message || '');
      }
    }
    // Кружочек: запись начнёт оверлей с камерой, когда камера будет готова.
  };

  const finishVoice = async (send: boolean) => {
    const res = await stopAudio();
    if (!send || !res) return;
    if (res.durationMs < MIN_VOICE_MS) {
      showHint('Удерживайте, чтобы записать голосовое');
      return;
    }
    cb.current.onVoice({ uri: res.uri, durationMs: res.durationMs, waveform: encodeWaveform(res.levels) });
  };

  const finishVideo = async (send: boolean) => {
    const api = S.current.videoApi;
    if (!api) return;
    if (!send) {
      await api.cancel().catch(() => undefined);
      return;
    }
    const res = await api.stop().catch(() => null);
    if (res && res.durationMs >= MIN_VIDEO_MS) cb.current.onVideoNote(res);
  };

  const send = useCallback(async () => {
    const p = S.current.phase;
    if (p === 'idle') return;
    if (S.current.mode === 'video' && p !== 'preview') {
      // Камера должна дописать файл, прежде чем закроется.
      S.current.phase = 'idle';
      await finishVideo(true);
      setPhase('idle');
      resetGesture();
      return;
    }
    setPhase('idle');
    resetGesture();
    if (p === 'preview') {
      setPreview((pv) => {
        if (pv) {
          stopVoice();
          cb.current.onVoice({ uri: pv.uri, durationMs: pv.durationMs, waveform: encodeWaveform(pv.levels) });
        }
        return null;
      });
      return;
    }
    await finishVoice(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cancel = useCallback(async () => {
    const p = S.current.phase;
    if (p === 'idle') return;
    setPhase('idle');
    resetGesture();
    Vibration.vibrate(20);
    if (p === 'preview') {
      stopVoice();
      setPreview(null);
      return;
    }
    if (S.current.mode === 'voice') await finishVoice(false);
    else await finishVideo(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lock = () => {
    if (S.current.phase !== 'recording') return;
    Vibration.vibrate(12);
    setPhase('locked');
    resetGesture();
  };

  /** В замке: остановить голосовое и послушать перед отправкой. */
  const stopToPreview = useCallback(async () => {
    if (S.current.phase !== 'locked' || S.current.mode !== 'voice') return;
    const res = await stopAudio();
    if (!res || res.durationMs < MIN_VOICE_MS) {
      setPhase('idle');
      return;
    }
    setPreview(res);
    setPhase('preview');
  }, []);

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => S.current.phase === 'idle',
      onPanResponderGrant: () => {
        if (S.current.phase === 'locked' || S.current.phase === 'preview') return;
        S.current.pressed = true;
        S.current.held = false;
        clearTimeout(S.current.holdTimer);
        S.current.holdTimer = setTimeout(() => {
          S.current.held = true;
          begin();
        }, HOLD_MS);
      },
      onPanResponderMove: (_e, g) => {
        if (S.current.phase !== 'recording') return;
        dx.setValue(Math.min(0, g.dx));
        dy.setValue(Math.min(0, g.dy));
        if (g.dx < -CANCEL_DX) cancel();
        else if (g.dy < -LOCK_DY) lock();
      },
      onPanResponderRelease: () => {
        S.current.pressed = false;
        clearTimeout(S.current.holdTimer);
        const p = S.current.phase;
        if (p === 'recording') {
          send();
          return;
        }
        if (p === 'idle' && !S.current.held) {
          // Короткое нажатие — переключить голос ↔ кружочек.
          const next: RecordMode = S.current.mode === 'voice' ? 'video' : 'voice';
          S.current.mode = next;
          setMode(next);
          AsyncStorage.setItem(MODE_KEY, next).catch(() => undefined);
          showHint(next === 'video' ? 'Удерживайте для записи кружочка. Нажмите — голосовое' : 'Удерживайте для записи голосового. Нажмите — кружочек');
        }
      },
      onPanResponderTerminate: () => {
        S.current.pressed = false;
        clearTimeout(S.current.holdTimer);
        if (S.current.phase === 'recording') send();
      },
    }),
  ).current;

  // Ушли с экрана посреди записи — ничего не отправляем.
  useEffect(
    () => () => {
      clearTimeout(S.current.holdTimer);
      clearTimeout(hintTimer.current);
      if (S.current.phase !== 'idle') {
        if (S.current.mode === 'voice') cancelAudio();
        else S.current.videoApi?.cancel().catch(() => undefined);
      }
    },
    [],
  );

  return {
    mode,
    phase,
    ms,
    hint,
    facing,
    preview,
    level,
    dx,
    dy,
    panHandlers: pan.panHandlers,
    send,
    cancel,
    stopToPreview,
    flip: () => setFacing((f) => (f === 'front' ? 'back' : 'front')),
    setVideoApi: (api) => {
      S.current.videoApi = api;
    },
    onVideoTick: setMs,
    onVideoFinished: (res) => {
      // Кружочек дошёл до минуты — отправляется сам, как в Telegram.
      if (S.current.phase === 'idle') return;
      setPhase('idle');
      resetGesture();
      if (res && res.durationMs >= MIN_VIDEO_MS) cb.current.onVideoNote(res);
    },
  };
}

// ---------- Кнопка микрофона / кружочка в поле ввода ----------

export function RecordButton({ rec }: { rec: ChatRecorder }) {
  const Icon = rec.mode === 'voice' ? Mic : Video;
  const flipAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    flipAnim.setValue(0.4);
    Animated.spring(flipAnim, { toValue: 1, useNativeDriver: true, friction: 5, tension: 120 }).start();
  }, [rec.mode, flipAnim]);
  return (
    <View style={styles.btnSlot} {...rec.panHandlers} accessibilityRole="button" accessibilityLabel={rec.mode === 'voice' ? 'Голосовое: удерживайте' : 'Кружочек: удерживайте'}>
      <Animated.View style={[styles.btn, { opacity: rec.phase === 'idle' ? 1 : 0, transform: [{ scale: flipAnim }] }]}>
        <Icon size={24} color={C.textMuted} strokeWidth={2} />
      </Animated.View>
      {rec.hint && rec.phase === 'idle' && (
        <View style={styles.hint} pointerEvents="none">
          <Text style={styles.hintText}>{rec.hint}</Text>
        </View>
      )}
    </View>
  );
}

// ---------- Слой записи поверх поля ввода ----------

const BIG = 96;
// Геометрия парящего поля ввода: отступ сбоку и снизу, высота капсулы.
const SIDE = 8;
const BOTTOM = 6;
const ROW = 44;

export function RecordingLayer({ rec }: { rec: ChatRecorder }) {
  const blink = useRef(new Animated.Value(1)).current;
  const bob = useRef(new Animated.Value(0)).current;
  const appear = useRef(new Animated.Value(0)).current;
  const active = rec.phase !== 'idle';

  useEffect(() => {
    if (!active) {
      appear.setValue(0);
      return;
    }
    Animated.spring(appear, { toValue: 1, useNativeDriver: true, friction: 7, tension: 90 }).start();
    const a = Animated.loop(
      Animated.sequence([
        Animated.timing(blink, { toValue: 0.15, duration: 500, useNativeDriver: true }),
        Animated.timing(blink, { toValue: 1, duration: 500, useNativeDriver: true }),
      ]),
    );
    const b = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, { toValue: -5, duration: 600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(bob, { toValue: 0, duration: 600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    a.start();
    b.start();
    return () => {
      a.stop();
      b.stop();
    };
  }, [active, blink, bob, appear]);

  if (!active) return null;
  const locked = rec.phase === 'locked';
  const preview = rec.phase === 'preview';
  const isVideo = rec.mode === 'video';

  // Центр большой кнопки совпадает с центром маленькой (справа в поле ввода).
  const cx = SIDE + ROW / 2;
  const cy = BOTTOM + ROW / 2;
  const bigScale = rec.level.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] });
  const haloScale = rec.level.interpolate({ inputRange: [0, 1], outputRange: [1, 1.7] });
  const cancelOpacity = rec.dx.interpolate({ inputRange: [-CANCEL_DX, -20, 0], outputRange: [0, 0.8, 1], extrapolate: 'clamp' });
  const lockShift = rec.dy.interpolate({ inputRange: [-LOCK_DY, 0], outputRange: [-34, 0], extrapolate: 'clamp' });

  return (
    <View style={[styles.layer, { height: BOTTOM + ROW + 170 }]} pointerEvents="box-none">
      {/* Капсула внизу: таймер и «влево — отмена» / «Отмена» / прослушивание */}
      <View style={styles.bar}>
        {preview ? (
          <PreviewRow rec={rec} />
        ) : (
          <>
            <View style={styles.timerBox}>
              <Animated.View style={[styles.redDot, { opacity: blink }]} />
              <Text style={styles.timer}>{recordTimer(rec.ms)}</Text>
            </View>
            {locked ? (
              <TouchableOpacity onPress={rec.cancel} style={styles.cancelBtn} hitSlop={10}>
                <Text style={styles.cancelText}>ОТМЕНА</Text>
              </TouchableOpacity>
            ) : (
              <Animated.View style={[styles.slide, { opacity: cancelOpacity, transform: [{ translateX: Animated.multiply(rec.dx, 0.6) }] }]} pointerEvents="none">
                <Text style={styles.slideText}>‹  Влево — отмена</Text>
              </Animated.View>
            )}
          </>
        )}
      </View>

      {/* Замок над кнопкой: тянуть вверх; в замке — стоп (голос) или камера (кружочек) */}
      {!preview && (
        <Animated.View style={[styles.lockPill, { right: cx - 20, bottom: cy + BIG / 2 + 14, transform: [{ translateY: locked ? 0 : lockShift }] }]}>
          {locked ? (
            isVideo ? (
              <TouchableOpacity onPress={rec.flip} style={styles.lockAction} accessibilityLabel="Сменить камеру">
                <SwitchCamera size={20} color={C.accent} />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={rec.stopToPreview} style={styles.lockAction} accessibilityLabel="Остановить и прослушать">
                <Square size={16} color={C.danger} fill={C.danger} />
              </TouchableOpacity>
            )
          ) : (
            <>
              <Lock size={18} color={C.textMuted} />
              <Animated.View style={{ transform: [{ translateY: bob }] }}>
                <ChevronUp size={18} color={C.textMuted} />
              </Animated.View>
            </>
          )}
        </Animated.View>
      )}

      {/* Большая кнопка под пальцем: пульсирует от громкости; в замке — «отправить» */}
      <Animated.View
        style={[styles.bigWrap, { right: cx - BIG / 2, bottom: cy - BIG / 2, opacity: appear, transform: [{ scale: appear }] }]}
        pointerEvents={locked || preview ? 'auto' : 'none'}
      >
        {!preview && <Animated.View style={[styles.halo, { transform: [{ scale: haloScale }] }]} />}
        <Animated.View style={[styles.big, preview && styles.bigSmall, { transform: [{ scale: preview ? 1 : bigScale }] }]}>
          {locked || preview ? (
            <TouchableOpacity onPress={rec.send} style={styles.bigTouch} accessibilityLabel="Отправить">
              <SendHorizonal size={preview ? 20 : 30} color={T.onAccent} strokeWidth={2.4} />
            </TouchableOpacity>
          ) : isVideo ? (
            <Video size={34} color={T.onAccent} strokeWidth={2} />
          ) : (
            <Mic size={34} color={T.onAccent} strokeWidth={2} />
          )}
        </Animated.View>
      </Animated.View>
    </View>
  );
}

/** Прослушивание записи перед отправкой: удалить, играть/пауза, волна. */
function PreviewRow({ rec }: { rec: ChatRecorder }) {
  const pv = rec.preview;
  const msg = useRef({ client_id: `rec-${Date.now()}` }).current as any;
  if (pv) {
    msg.local_uri = pv.uri;
    msg.media_duration = pv.durationMs / 1000;
  }
  const st = useVoiceFor(msg);
  if (!pv) return null;
  const levels = pv.levels.length ? pv.levels : [0];
  const progress = st && st.duration ? st.position / st.duration : 0;
  return (
    <View style={styles.previewRow}>
      <TouchableOpacity onPress={rec.cancel} style={styles.trash} accessibilityLabel="Удалить запись">
        <Trash2 size={22} color={C.danger} />
      </TouchableOpacity>
      <View style={styles.previewPill}>
        <TouchableOpacity onPress={() => toggleVoice(msg).catch(() => undefined)} style={styles.previewPlay} hitSlop={8}>
          <PlayGlyph playing={!!st?.playing} color={T.onAccent} size={14} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Waveform levels={levels} progress={progress} color={T.onAccent} dimColor={withAlpha(T.onAccent, 0.45)} height={20} />
        </View>
        <Text style={styles.previewTime}>{formatDuration((st?.playing ? st.position : pv.durationMs) / 1000)}</Text>
      </View>
      <View style={{ width: 50 }} />
    </View>
  );
}

const styles = themed(() => ({
  btnSlot: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  btn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  hint: {
    position: 'absolute',
    right: 0,
    bottom: 50,
    width: 230,
    backgroundColor: 'rgba(20,24,22,0.88)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  hintText: { color: '#FFFFFF', fontSize: 13, lineHeight: 17 },
  layer: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  bar: {
    position: 'absolute',
    left: SIDE,
    right: SIDE,
    bottom: BOTTOM,
    height: ROW,
    borderRadius: ROW / 2,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 16,
    paddingRight: 112,
    ...glass(0.97),
  },
  timerBox: { flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 92 },
  redDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#EF4444' },
  timer: { fontSize: 16, color: C.text, fontVariant: ['tabular-nums'] },
  slide: { flex: 1, alignItems: 'center' },
  slideText: { fontSize: 15, color: C.textMuted },
  cancelBtn: { flex: 1, alignItems: 'center' },
  cancelText: { fontSize: 15, fontWeight: '800', color: C.accent, letterSpacing: 0.4 },
  lockPill: {
    position: 'absolute',
    width: 40,
    minHeight: 40,
    paddingVertical: 8,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    backgroundColor: T.card,
    borderWidth: 0.5,
    borderColor: C.border,
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  lockAction: { width: 40, height: 28, alignItems: 'center', justifyContent: 'center' },
  bigWrap: { position: 'absolute', width: BIG, height: BIG, alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute', width: BIG, height: BIG, borderRadius: BIG / 2, backgroundColor: withAlpha(T.accent, 0.18) },
  big: {
    width: BIG,
    height: BIG,
    borderRadius: BIG / 2,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  bigSmall: { width: 44, height: 44, borderRadius: 22 },
  bigTouch: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  previewRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, marginRight: -110 },
  trash: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  previewPill: {
    flex: 1,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.accent,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 4,
    paddingRight: 12,
  },
  previewPlay: { width: 28, height: 28, borderRadius: 14, backgroundColor: withAlpha('#000000', 0.18), alignItems: 'center', justifyContent: 'center' },
  previewTime: { color: T.onAccent, fontSize: 12, fontVariant: ['tabular-nums'] },
}));
