import React, { useMemo, useRef, useState } from 'react';
import { View, PanResponder, LayoutChangeEvent } from 'react-native';
import { resample } from './waveformData';

const BAR = 3;
const GAP = 2;
const MIN_H = 3;

/**
 * Столбики волны. Прослушанная часть — ярким цветом. Палец по волне —
 * перемотка (как в Telegram).
 */
export default function Waveform({
  levels,
  progress,
  color,
  dimColor,
  height = 24,
  onSeek,
}: {
  levels: number[];
  progress: number;
  color: string;
  dimColor: string;
  height?: number;
  onSeek?: (ratio: number) => void;
}) {
  const [width, setWidth] = useState(0);
  const [drag, setDrag] = useState<number | null>(null);
  const widthRef = useRef(0);
  const seekRef = useRef(onSeek);
  seekRef.current = onSeek;

  const count = Math.max(1, Math.floor((width + GAP) / (BAR + GAP)));
  const bars = useMemo(() => resample(levels, count), [levels, count]);
  const shown = drag ?? progress;

  const ratioAt = (x: number) => Math.max(0, Math.min(1, x / (widthRef.current || 1)));
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !!seekRef.current,
      onMoveShouldSetPanResponder: (_e, g) => !!seekRef.current && Math.abs(g.dx) > 4,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => setDrag(ratioAt(e.nativeEvent.locationX)),
      onPanResponderMove: (e) => setDrag(ratioAt(e.nativeEvent.locationX)),
      onPanResponderRelease: (e) => {
        const r = ratioAt(e.nativeEvent.locationX);
        setDrag(null);
        seekRef.current?.(r);
      },
      onPanResponderTerminate: () => setDrag(null),
    }),
  ).current;

  return (
    <View
      style={{ height, flexDirection: 'row', alignItems: 'center', gap: GAP }}
      onLayout={(e: LayoutChangeEvent) => {
        widthRef.current = e.nativeEvent.layout.width;
        setWidth(e.nativeEvent.layout.width);
      }}
      {...pan.panHandlers}
    >
      {width > 0 &&
        bars.map((v, i) => (
          <View
            key={i}
            style={{
              width: BAR,
              height: Math.max(MIN_H, Math.round(v * height)),
              borderRadius: BAR / 2,
              backgroundColor: (i + 0.5) / bars.length <= shown ? color : dimColor,
            }}
          />
        ))}
    </View>
  );
}
