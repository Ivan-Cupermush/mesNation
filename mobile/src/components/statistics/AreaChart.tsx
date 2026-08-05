import React from 'react';
import { View, Dimensions } from 'react-native';
import Svg, { Path, Defs, LinearGradient, Stop, Text as SvgText } from 'react-native-svg';
import { useTheme } from '../../theme/ThemeContext';

export interface ChartPoint { label: string; value: number; }

export const AreaChart: React.FC<{ data: ChartPoint[]; height?: number; color?: string }> = ({
  data, height = 170, color,
}) => {
  const { colors } = useTheme();
  const stroke = color || colors.accent;
  const width = Dimensions.get('window').width - 64;
  const pad = { top: 14, right: 6, bottom: 22, left: 6 };
  const cw = width - pad.left - pad.right;
  const ch = height - pad.top - pad.bottom;
  const max = Math.max(...data.map(d => d.value), 1) * 1.12;

  const pts = data.map((d, i) => ({
    x: pad.left + (i / Math.max(1, data.length - 1)) * cw,
    y: pad.top + ch - (d.value / max) * ch,
  }));

  const line = pts.reduce((acc, p, i) => {
    if (i === 0) return `M ${p.x} ${p.y}`;
    const prev = pts[i - 1];
    const c1x = prev.x + (p.x - prev.x) / 3;
    const c2x = p.x - (p.x - prev.x) / 3;
    return `${acc} C ${c1x} ${prev.y}, ${c2x} ${p.y}, ${p.x} ${p.y}`;
  }, '');
  const area = `${line} L ${pts[pts.length - 1].x} ${pad.top + ch} L ${pts[0].x} ${pad.top + ch} Z`;

  return (
    <View>
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id="iosFill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor={stroke} stopOpacity={0.16} />
            <Stop offset="100%" stopColor={stroke} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Path d={area} fill="url(#iosFill)" />
        <Path d={line} fill="none" stroke={stroke} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        {pts.map((p, i) => (
          <SvgText key={i} x={p.x} y={height - 6} fontSize={10} fill={colors.textMuted} textAnchor="middle">
            {data[i].label}
          </SvgText>
        ))}
      </Svg>
    </View>
  );
};
