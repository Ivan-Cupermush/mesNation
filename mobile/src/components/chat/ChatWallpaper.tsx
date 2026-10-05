import React from 'react';
import { View, Image, StyleSheet } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Rect, Pattern, Circle, Path, G } from 'react-native-svg';
import { useTheme } from '../../theme/ThemeContext';
import { GRADIENTS, PATTERNS, PATTERN_INTENSITY, Wallpaper } from '../../theme/wallpapers';

/**
 * Фон ленты сообщений. Градиенты и узоры рисуются векторно (чёткие на любом
 * экране, без картинок в сборке), своё фото — с лёгким затемнением в тёмной
 * теме, чтобы пузыри оставались читаемыми.
 */

function patternShapes(id: string, color: string) {
  switch (id) {
    case 'dots':
      return (
        <G fill={color}>
          <Circle cx={8} cy={8} r={2.2} />
          <Circle cx={38} cy={24} r={1.6} />
          <Circle cx={20} cy={42} r={2} />
          <Circle cx={52} cy={52} r={1.4} />
        </G>
      );
    case 'waves':
      return (
        <G stroke={color} strokeWidth={1.6} fill="none" strokeLinecap="round">
          <Path d="M0 16 Q 15 6 30 16 T 60 16" />
          <Path d="M0 46 Q 15 36 30 46 T 60 46" />
        </G>
      );
    case 'grid':
      return (
        <G stroke={color} strokeWidth={1}>
          <Path d="M0 0 H60 M0 30 H60 M0 0 V60 M30 0 V60" />
        </G>
      );
    default:
      // «Узор» — мелкие значки в духе Telegram: облачка сообщений, звёзды, галочки.
      return (
        <G stroke={color} strokeWidth={1.6} fill="none" strokeLinecap="round" strokeLinejoin="round">
          <Path d="M6 10 h14 a4 4 0 0 1 4 4 v6 a4 4 0 0 1 -4 4 h-8 l-5 4 v-4 h-1 a4 4 0 0 1 -4 -4 v-6 a4 4 0 0 1 4 -4 z" />
          <Path d="M44 8 l2.5 5 5.5 .8 -4 3.9 .9 5.5 -4.9 -2.6 -4.9 2.6 .9 -5.5 -4 -3.9 5.5 -.8 z" />
          <Path d="M10 46 l5 5 10 -10" />
          <Circle cx={48} cy={46} r={6} />
          <Path d="M30 30 h6 M33 27 v6" />
        </G>
      );
  }
}

export function WallpaperView({ wallpaper, style, radius = 0 }: { wallpaper: Wallpaper; style?: any; radius?: number }) {
  const { isDark, colors } = useTheme();

  if (wallpaper.type === 'image') {
    return (
      <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.chatBg, borderRadius: radius, overflow: 'hidden' }, style]}>
        <Image source={{ uri: wallpaper.uri }} style={StyleSheet.absoluteFill} resizeMode="cover" blurRadius={wallpaper.blur ? 12 : 0} />
        {(() => {
          // Затемнение задаётся в настройках; по умолчанию — лёгкое в тёмной теме.
          const dim = wallpaper.dim ?? (isDark ? 0.4 : 0);
          return dim > 0 ? <View style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(0,0,0,${dim})` }]} /> : null;
        })()}
      </View>
    );
  }

  if (wallpaper.type === 'none') {
    return <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.chatBg, borderRadius: radius }, style]} />;
  }

  const patternId = wallpaper.type === 'pattern' ? wallpaper.id : null;
  const gradId = wallpaper.type === 'gradient' ? wallpaper.id : PATTERNS.find((p) => p.id === patternId)?.gradient || 'mint';
  const g = GRADIENTS.find((x) => x.id === gradId) || GRADIENTS[0];
  const stops = isDark ? g.dark : g.light;
  const intensity = wallpaper.type === 'pattern' ? wallpaper.intensity ?? PATTERN_INTENSITY.default : PATTERN_INTENSITY.default;
  const ink = isDark ? `rgba(255,255,255,${intensity})` : `rgba(0,0,0,${intensity})`;

  return (
    <View style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: 'hidden' }, style]} pointerEvents="none">
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id="wg" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={stops[0]} />
            <Stop offset="0.55" stopColor={stops[1]} />
            <Stop offset="1" stopColor={stops[2]} />
          </LinearGradient>
          {patternId && (
            <Pattern id="wp" width={60} height={60} patternUnits="userSpaceOnUse">
              {patternShapes(patternId, ink)}
            </Pattern>
          )}
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#wg)" />
        {patternId && <Rect x="0" y="0" width="100%" height="100%" fill="url(#wp)" />}
      </Svg>
    </View>
  );
}
