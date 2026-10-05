import React, { useRef, useState } from 'react';
import { View, PanResponder, LayoutChangeEvent, GestureResponderEvent } from 'react-native';
import { T, themed } from '../../theme/runtime';

/**
 * Ползунок со ступенями, как в настройках Telegram (размер текста, углы
 * сообщений). Тянуть можно пальцем или нажать в любое место дорожки.
 */
export default function StepSlider({
  min,
  max,
  step = 1,
  value,
  onChange,
  showTicks = true,
  accessibilityLabel,
}: {
  min: number;
  max: number;
  step?: number;
  value: number;
  onChange: (v: number) => void;
  showTicks?: boolean;
  accessibilityLabel?: string;
}) {
  const [width, setWidth] = useState(0);
  const widthRef = useRef(0);
  const startX = useRef(0);
  const props = useRef({ min, max, step, onChange, value });
  props.current = { min, max, step, onChange, value };

  const steps = Math.round((max - min) / step);
  const frac = steps > 0 ? (value - min) / (max - min) : 0;
  const THUMB = 26;

  const valueAt = (x: number) => {
    const p = props.current;
    const w = widthRef.current - THUMB;
    if (w <= 0) return p.value;
    const f = Math.max(0, Math.min(1, (x - THUMB / 2) / w));
    const v = p.min + Math.round((f * (p.max - p.min)) / p.step) * p.step;
    return Math.max(p.min, Math.min(p.max, Number(v.toFixed(4))));
  };

  const emit = (x: number) => {
    const v = valueAt(x);
    if (v !== props.current.value) props.current.onChange(v);
  };

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      // Пока тянем ползунок, прокрутка экрана не перехватывает жест.
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e: GestureResponderEvent) => {
        startX.current = e.nativeEvent.locationX;
        emit(startX.current);
      },
      onPanResponderMove: (_e, g) => emit(startX.current + g.dx),
    }),
  ).current;

  const onLayout = (e: LayoutChangeEvent) => {
    widthRef.current = e.nativeEvent.layout.width;
    setWidth(e.nativeEvent.layout.width);
  };

  const track = Math.max(0, width - THUMB);
  return (
    <View
      style={styles.wrap}
      onLayout={onLayout}
      {...responder.panHandlers}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min, max, now: value }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === 'increment') onChange(Math.min(max, value + step));
        if (e.nativeEvent.actionName === 'decrement') onChange(Math.max(min, value - step));
      }}
    >
      <View style={[styles.track, { left: THUMB / 2, right: THUMB / 2 }]} pointerEvents="none">
        <View style={[styles.fill, { width: track * frac }]} />
      </View>
      {showTicks && steps > 0 && steps <= 24 && width > 0 && (
        <View style={[styles.ticks, { left: THUMB / 2, right: THUMB / 2 }]} pointerEvents="none">
          {Array.from({ length: steps + 1 }, (_, i) => (
            <View key={i} style={[styles.tick, i / steps <= frac && styles.tickOn]} />
          ))}
        </View>
      )}
      <View pointerEvents="none" style={[styles.thumb, { width: THUMB, height: THUMB, borderRadius: THUMB / 2, left: track * frac }]} />
    </View>
  );
}

const styles = themed(() => ({
  wrap: { height: 40, justifyContent: 'center' },
  track: { position: 'absolute', height: 4, borderRadius: 2, backgroundColor: T.surfaceActive, overflow: 'hidden' },
  fill: { height: 4, backgroundColor: T.accent },
  ticks: { position: 'absolute', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', height: 8 },
  tick: { width: 4, height: 4, borderRadius: 2, backgroundColor: T.textMuted },
  tickOn: { backgroundColor: T.onAccent },
  thumb: {
    position: 'absolute',
    backgroundColor: '#FFFFFF',
    borderWidth: 0.5,
    borderColor: T.border,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
}));
