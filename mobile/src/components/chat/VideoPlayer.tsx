import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, PanResponder, Image } from 'react-native';
import Video, { VideoRef, OnLoadData, OnProgressData } from 'react-native-video';
import { Play, Pause, RotateCcw, Volume2, VolumeX } from 'lucide-react-native';
import { formatDuration } from './chatUtils';

import { T, themed } from '../../theme/runtime';
/**
 * Встроенный видеоплеер для просмотра медиа из чата: кнопка воспроизведения,
 * полоса перемотки с перетаскиванием, время, звук. Тап по видео прячет
 * панель управления.
 */

interface Props {
  width: number;
  height: number;
  /** Подписанная ссылка на файл (null — ещё получаем). */
  uri: string | null;
  posterUri?: string | null;
  active: boolean;
  chromeVisible: boolean;
  onTap: () => void;
}

export default function VideoPlayer({ width, height, uri, posterUri, active, chromeVisible, onTap }: Props) {
  const ref = useRef<VideoRef>(null);
  const [paused, setPaused] = useState(!active);
  const [duration, setDuration] = useState(0);
  const [time, setTime] = useState(0);
  const [buffering, setBuffering] = useState(true);
  const [ended, setEnded] = useState(false);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [barWidth, setBarWidth] = useState(1);
  const seeking = useRef(false);
  const stateRef = useRef({ duration: 0, barWidth: 1 });
  stateRef.current = { duration, barWidth };

  // Ушли на другой слайд — ставим на паузу; вернулись — продолжаем.
  useEffect(() => {
    setPaused(!active);
  }, [active]);

  const toggle = () => {
    if (ended) {
      ref.current?.seek(0);
      setEnded(false);
      setPaused(false);
      return;
    }
    setPaused((p) => !p);
  };

  const seekTo = (x: number) => {
    const { duration: d, barWidth: w } = stateRef.current;
    if (!d) return;
    const t = Math.max(0, Math.min(d, (x / w) * d));
    setTime(t);
    ref.current?.seek(t);
    setEnded(false);
  };

  const scrub = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        seeking.current = true;
        seekTo(e.nativeEvent.locationX);
      },
      onPanResponderMove: (e) => seekTo(e.nativeEvent.locationX),
      onPanResponderRelease: () => {
        seeking.current = false;
      },
      onPanResponderTerminate: () => {
        seeking.current = false;
      },
    }),
  ).current;

  const progress = duration ? Math.min(1, time / duration) : 0;

  return (
    <View style={{ width, height, backgroundColor: 'black' }}>
      <TouchableOpacity activeOpacity={1} onPress={onTap} style={StyleSheet.absoluteFill}>
        {uri ? (
          <Video
            ref={ref}
            source={{ uri }}
            style={StyleSheet.absoluteFill}
            resizeMode="contain"
            paused={paused}
            muted={muted}
            poster={posterUri ? { source: { uri: posterUri }, resizeMode: 'contain' } : undefined}
            onLoad={(d: OnLoadData) => {
              setDuration(d.duration);
              setBuffering(false);
            }}
            onProgress={(p: OnProgressData) => {
              if (!seeking.current) setTime(p.currentTime);
            }}
            onBuffer={({ isBuffering }: { isBuffering: boolean }) => setBuffering(isBuffering)}
            onEnd={() => {
              setEnded(true);
              setPaused(true);
            }}
            onError={() => setError('Не удалось воспроизвести видео')}
          />
        ) : posterUri ? (
          <Image source={{ uri: posterUri }} style={StyleSheet.absoluteFill} resizeMode="contain" />
        ) : null}
      </TouchableOpacity>

      {error ? (
        <View style={styles.centerBox} pointerEvents="none">
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : (buffering || !uri) && !paused ? (
        <View style={styles.centerBox} pointerEvents="none">
          <ActivityIndicator color={T.onAccent} size="large" />
        </View>
      ) : chromeVisible || paused ? (
        <View style={styles.centerBox} pointerEvents="box-none">
          <TouchableOpacity onPress={toggle} style={styles.bigBtn} accessibilityLabel={paused ? 'Воспроизвести' : 'Пауза'}>
            {ended ? (
              <RotateCcw size={30} color={T.onAccent} />
            ) : paused ? (
              <Play size={32} color={T.onAccent} fill={T.onAccent} style={{ marginLeft: 4 }} />
            ) : (
              <Pause size={30} color={T.onAccent} fill={T.onAccent} />
            )}
          </TouchableOpacity>
        </View>
      ) : null}

      {chromeVisible && (
        <View style={styles.controls}>
          <Text style={styles.time}>{formatDuration(time)}</Text>
          <View style={styles.barHit} onLayout={(e) => setBarWidth(e.nativeEvent.layout.width || 1)} {...scrub.panHandlers}>
            <View style={styles.barTrack}>
              <View style={[styles.barFill, { width: `${progress * 100}%` }]} />
            </View>
            <View style={[styles.knob, { left: progress * barWidth - 7 }]} />
          </View>
          <Text style={styles.time}>{formatDuration(duration)}</Text>
          <TouchableOpacity onPress={() => setMuted((m) => !m)} hitSlop={10} accessibilityLabel="Звук">
            {muted ? <VolumeX size={20} color={T.onAccent} /> : <Volume2 size={20} color={T.onAccent} />}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = themed(() => ({
  centerBox: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  bigBtn: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: T.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: { color: T.onAccent, fontSize: 15 },
  controls: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 96,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
  },
  time: { color: T.onAccent, fontSize: 12, fontVariant: ['tabular-nums'], minWidth: 38, textAlign: 'center' },
  barHit: { flex: 1, height: 32, justifyContent: 'center' },
  barTrack: { height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.3)', overflow: 'hidden' },
  barFill: { height: 3, backgroundColor: T.card },
  knob: { position: 'absolute', top: 9, width: 14, height: 14, borderRadius: 7, backgroundColor: T.card },
}));
