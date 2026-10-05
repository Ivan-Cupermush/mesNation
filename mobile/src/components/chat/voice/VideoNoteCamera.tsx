import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Animated, useWindowDimensions } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { SwitchCamera } from 'lucide-react-native';
import { Camera, CommonResolutions, useVideoOutput } from 'react-native-vision-camera';
import type { Recorder } from 'react-native-vision-camera';
import { T, themed } from '../../../theme/runtime';
import type { ChatRecorder } from './ChatRecorder';
import { VIDEO_NOTE_MAX_S } from './ChatRecorder';

/**
 * Камера кружочка поверх чата: круглое превью, кольцо — минута записи
 * (как в Telegram). Запись начинается, когда камера готова; камеру можно
 * сменить и во время записи.
 */
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
  const finish = useRef<((r: { uri: string; durationMs: number } | null) => void) | null>(null);
  const recRef = useRef(rec);
  recRef.current = rec;

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
      if (recorder.current?.isRecording) {
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
    <Animated.View style={[styles.overlay, { opacity: fade }]} pointerEvents="box-none">
      <View style={{ width: D + 20, height: D + 20, alignItems: 'center', justifyContent: 'center' }}>
        <View style={[styles.circle, { width: D, height: D, borderRadius: R }]}>
          <Camera
            style={{ width: D, height: D }}
            device={rec.facing}
            isActive
            outputs={[videoOutput]}
            implementationMode="compatible"
            resizeMode="cover"
            mirrorMode="auto"
            onPreviewStarted={startRecording}
            onError={() => recRef.current.onVideoFinished(null)}
          />
        </View>
        <Svg width={D + 20} height={D + 20} style={styles.ringSvg} pointerEvents="none">
          <Circle cx={R + 10} cy={R + 10} r={ring} stroke="rgba(255,255,255,0.22)" strokeWidth={4} fill="none" />
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
      </View>
      <TouchableOpacity onPress={rec.flip} style={styles.flip} accessibilityLabel="Сменить камеру">
        <SwitchCamera size={22} color="#FFFFFF" />
      </TouchableOpacity>
      {!startedAt.current && <Text style={styles.wait}>Камера включается…</Text>}
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
  circle: { overflow: 'hidden', backgroundColor: '#000' },
  ringSvg: { position: 'absolute', left: 0, top: 0 },
  flip: {
    marginTop: 22,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  wait: { color: 'rgba(255,255,255,0.8)', marginTop: 12, fontSize: 13 },
}));
