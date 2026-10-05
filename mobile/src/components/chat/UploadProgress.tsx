import React from 'react';
import { TouchableOpacity, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { X } from 'lucide-react-native';

/**
 * Кольцо загрузки с крестиком, как в Telegram: показывает долю отправленного
 * и по нажатию отменяет отправку. Без известного прогресса — короткая дуга.
 */
export default function UploadProgress({
  progress,
  size = 44,
  color = '#FFFFFF',
  track = 'rgba(255,255,255,0.25)',
  background = 'rgba(0,0,0,0.45)',
  onCancel,
}: {
  progress?: number | null;
  size?: number;
  color?: string;
  track?: string;
  background?: string;
  onCancel?: () => void;
}) {
  const stroke = 2.5;
  const r = size / 2 - stroke - 2;
  const len = 2 * Math.PI * r;
  const p = progress == null ? 0.12 : Math.max(0.04, Math.min(1, progress));
  const body = (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: background, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${len * p} ${len}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      {onCancel ? <X size={size * 0.4} color={color} strokeWidth={2.4} /> : null}
    </View>
  );
  if (!onCancel) return body;
  return (
    <TouchableOpacity onPress={onCancel} hitSlop={8} activeOpacity={0.7} accessibilityLabel="Отменить отправку">
      {body}
    </TouchableOpacity>
  );
}
