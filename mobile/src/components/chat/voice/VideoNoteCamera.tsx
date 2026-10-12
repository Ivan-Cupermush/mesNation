import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Animated, PanResponder, useWindowDimensions, GestureResponderEvent } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { SwitchCamera, Zap, ZapOff } from 'lucide-react-native';
import { Camera, CommonResolutions, useCameraDevice, useVideoOutput } from 'react-native-vision-camera';
import type { Recorder } from 'react-native-vision-camera';
import { T, themed } from '../../../theme/runtime';
import type { ChatRecorder } from './ChatRecorder';
import { VIDEO_NOTE_MAX_S } from './ChatRecorder';

/**
 * Камера кружочка поверх чата: круглое превью, кольцо — минута записи
 * (как в Telegram). Запись начинается, когда камера готова; камеру можно
 * сменить и во время записи.
 *
 * Зум — щипком по кружку, ведением пальца по кружку вверх-вниз или кнопкой
 * «1× / 2×». Вспышка: у задней камеры — фонарик, у фронтальной — яркий
 * белый экран вокруг кружка, который подсвечивает лицо.
 */

const dist = (e: GestureResponderEvent) => {
  const t = e.nativeEvent.touches;
  if (t.length < 2) return 0;
  return Math.hypot(t[0].pageX - t[1].pageX, t[0].pageY - t[1].pageY);
};
const fmtZoom = (z: number) => `${z < 10 ? z.toFixed(1).replace('.0', '') : Math.round(z)}×`;
export default function VideoNoteCamera({ rec }: { rec: ChatRecorder }) {
  const { width } = useWindowDimensions();
  const D = Math.min(Math.round(width * 0.8), 330);
  const R = D / 2;
  const ring = R + 7;
  const circ = 2 * Math.PI * ring;
  const [elapsed, setElapsed] = useState(0);
  const fade = useRef(new Animated.Value(0)).current;
  const recorder = useRef<Recorder | null>(null);
  const startedAt = useRef(0);
  const cancelled = useRef(false);
  const stopping = useRef(false);
  const unmounted = useRef(false);
  const finish = useRef<((r: { uri: string; durationMs: number } | null) => void) | null>(null);
  const recRef = useRef(rec);
  recRef.current = rec;

  // ----- Зум и вспышка -----
  const device = useCameraDevice(rec.facing);
  const minZoom = Math.max(1, device?.minZoom ?? 1);
  const maxZoom = Math.max(minZoom, Math.min(device?.maxZoom ?? 4, 8));
  const [zoom, setZoom] = useState(minZoom);
  const [flash, setFlash] = useState(false);
  const [zoomHint, setZoomHint] = useState(false);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const limits = useRef({ min: minZoom, max: maxZoom });
  limits.current = { min: minZoom, max: maxZoom };
  const torchAvailable = rec.facing === 'back' && !!device?.hasTorch;
  const screenFlash = flash && rec.facing === 'front';

  // Сменили камеру — зум с начала (у камер разный диапазон).
  useEffect(() => {
    setZoom(minZoom);
  }, [rec.facing, minZoom]);

  const applyZoom = (z: number) => {
    const next = Math.round(Math.min(limits.current.max, Math.max(limits.current.min, z)) * 10) / 10;
    if (next !== zoomRef.current) setZoom(next);
    setZoomHint(true);
    if (hintTimer.current) clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => setZoomHint(false), 900);
  };

  const gesture = useRef({ startDist: 0, startZoom: 1 });
  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          gesture.current = { startDist: 0, startZoom: zoomRef.current };
        },
        onPanResponderMove: (e, g) => {
          const d = dist(e);
          if (d) {
            // Щипок: зум пропорционален расстоянию между пальцами.
            if (!gesture.current.startDist) gesture.current = { startDist: d, startZoom: zoomRef.current };
            else applyZoom(gesture.current.startZoom * (d / gesture.current.startDist));
          } else if (!gesture.current.startDist) {
            // Один палец: вверх — приблизить, вниз — отдалить.
            applyZoom(gesture.current.startZoom - g.dy / 90);
          }
        },
        onPanResponderRelease: () => {
          gesture.current.startDist = 0;
        },
        onPanResponderTerminate: () => {
          gesture.current.startDist = 0;
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => () => {
    if (hintTimer.current) clearTimeout(hintTimer.current);
  }, []);

  const videoOutput = useVideoOutput({
    targetResolution: CommonResolutions.VGA_4_3,
    enableAudio: true,
    enablePersistentRecorder: true,
    targetBitRate: 1_600_000,
  });

  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 180, useNativeDriver: true }).start();
  }, [fade]);

  // Таймер и кольцо.
  useEffect(() => {
    const t = setInterval(() => {
      if (!startedAt.current) return;
      const ms = Date.now() - startedAt.current;
      setElapsed(ms);
      recRef.current.onVideoTick(ms);
    }, 100);
    return () => clearInterval(t);
  }, []);

  // Управление для useChatRecorder: остановить (и получить файл) или отменить.
  useEffect(() => {
    rec.setVideoApi({
      stop: () =>
        new Promise((resolve) => {
          const r = recorder.current;
          if (!r || !startedAt.current) return resolve(null);
          stopping.current = true;
          finish.current = resolve;
          r.stopRecording().catch(() => resolve(null));
          setTimeout(() => resolve(null), 4000);
        }),
      cancel: async () => {
        cancelled.current = true;
        await recorder.current?.cancelRecording().catch(() => undefined);
      },
    });
    return () => rec.setVideoApi(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Уход с экрана посреди записи — запись не сохраняем.
  useEffect(
    () => () => {
      unmounted.current = true;
      if (recorder.current?.isRecording && !stopping.current) {
        cancelled.current = true;
        recorder.current.cancelRecording().catch(() => undefined);
      }
    },
    [],
  );

  const startRecording = async () => {
    if (recorder.current || cancelled.current) return;
    try {
      const r = await videoOutput.createRecorder({ maxDuration: VIDEO_NOTE_MAX_S });
      // Палец отпустили, пока камера готовилась, — не начинаем.
      if (unmounted.current || cancelled.current || stopping.current) return;
      recorder.current = r;
      await r.startRecording(
        (filePath, reason) => {
          const durationMs = startedAt.current ? Date.now() - startedAt.current : 0;
          const res = cancelled.current ? null : { uri: filePath.startsWith('file://') ? filePath : `file://${filePath}`, durationMs };
          if (finish.current) {
            finish.current(res);
            finish.current = null;
          } else if (reason === 'max-duration-reached') {
            recRef.current.onVideoFinished(res);
          }
        },
        () => {
          finish.current?.(null);
          finish.current = null;
          if (!cancelled.current) recRef.current.onVideoFinished(null);
        },
      );
      startedAt.current = Date.now();
    } catch {
      recRef.current.onVideoFinished(null);
    }
  };

  const progress = Math.min(1, elapsed / (VIDEO_NOTE_MAX_S * 1000));

  return (
    <Animated.View style={[styles.overlay, screenFlash && styles.overlayFlash, { opacity: fade }]} pointerEvents="box-none">
      <View style={{ width: D + 20, height: D + 20, alignItems: 'center', justifyContent: 'center' }}>
        <View style={[styles.circle, { width: D, height: D, borderRadius: R }]} {...pan.panHandlers}>
          <Camera
            style={{ width: D, height: D }}
            device={rec.facing}
            isActive
            outputs={[videoOutput]}
            implementationMode="compatible"
            resizeMode="cover"
            mirrorMode="auto"
            zoom={zoom}
            torchMode={flash && torchAvailable ? 'on' : 'off'}
            onPreviewStarted={startRecording}
            onError={() => recRef.current.onVideoFinished(null)}
          />
        </View>
        <Svg width={D + 20} height={D + 20} style={styles.ringSvg} pointerEvents="none">
          <Circle cx={R + 10} cy={R + 10} r={ring} stroke={screenFlash ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.22)'} strokeWidth={4} fill="none" />
          <Circle
            cx={R + 10}
            cy={R + 10}
            r={ring}
            stroke={T.accent}
            strokeWidth={4}
            fill="none"
            strokeDasharray={`${circ} ${circ}`}
            strokeDashoffset={circ * (1 - progress)}
            strokeLinecap="round"
            transform={`rotate(-90 ${R + 10} ${R + 10})`}
          />
        </Svg>
        {zoomHint && (
          <View style={styles.zoomHint} pointerEvents="none">
            <Text style={styles.zoomHintText}>{fmtZoom(zoom)}</Text>
          </View>
        )}
      </View>

      <View style={styles.controls}>
        <TouchableOpacity
          onPress={() => setFlash((f) => !f)}
          style={[styles.ctrl, screenFlash && styles.ctrlOnLight, flash && styles.ctrlActive]}
          disabled={rec.facing === 'back' && !torchAvailable}
          accessibilityLabel={flash ? 'Выключить вспышку' : 'Включить вспышку'}
        >
          {flash ? <Zap size={21} color="#1A1A1A" fill="#FFD43B" /> : <ZapOff size={21} color={rec.facing === 'back' && !torchAvailable ? 'rgba(255,255,255,0.35)' : '#FFFFFF'} />}
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => applyZoom(zoom >= Math.min(2, maxZoom) - 0.05 ? minZoom : Math.min(2, maxZoom))}
          style={[styles.zoomPill, screenFlash && styles.ctrlOnLight]}
          disabled={maxZoom <= minZoom}
          accessibilityLabel={`Зум ${fmtZoom(zoom)}. Нажмите, чтобы переключить`}
        >
          <Text style={[styles.zoomText, screenFlash && styles.textOnLight]}>{fmtZoom(zoom)}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={rec.flip} style={[styles.ctrl, screenFlash && styles.ctrlOnLight]} accessibilityLabel="Сменить камеру">
          <SwitchCamera size={22} color={screenFlash ? '#1A1A1A' : '#FFFFFF'} />
        </TouchableOpacity>
      </View>
      {!startedAt.current ? (
        <Text style={[styles.wait, screenFlash && styles.textOnLight]}>Камера включается…</Text>
      ) : (
        <Text style={[styles.hint, screenFlash && styles.textOnLight]}>Щипок или палец вверх по кружку — зум</Text>
      )}
    </Animated.View>
  );
}

const styles = themed(() => ({
  overlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Вспышка фронтальной камеры: яркий тёплый экран вокруг кружка подсвечивает лицо.
  overlayFlash: { backgroundColor: '#FFF7E6' },
  circle: { overflow: 'hidden', backgroundColor: '#000' },
  zoomHint: {
    position: 'absolute',
    top: 24,
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  zoomHintText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 18, marginTop: 22 },
  ctrl: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctrlActive: { backgroundColor: '#FFD43B', borderColor: '#FFD43B' },
  ctrlOnLight: { backgroundColor: 'rgba(0,0,0,0.08)', borderColor: 'rgba(0,0,0,0.12)' },
  zoomPill: {
    minWidth: 56,
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomText: { color: '#FFD43B', fontSize: 14, fontWeight: '800' },
  textOnLight: { color: '#1A1A1A' },
  hint: { color: 'rgba(255,255,255,0.7)', marginTop: 12, fontSize: 12.5 },
  ringSvg: { position: 'absolute', left: 0, top: 0 },
  wait: { color: 'rgba(255,255,255,0.8)', marginTop: 12, fontSize: 13 },
}));
