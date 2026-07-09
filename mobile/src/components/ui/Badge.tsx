import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';

type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'muted';

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
  size?: 'sm' | 'md';
  dot?: boolean;
}

export const Badge = ({ label, variant = 'info', size = 'sm', dot }: BadgeProps) => {
  const { colors } = useTheme();
  const getColor = () => {
    switch (variant) {
      case 'success': return colors.success;
      case 'warning': return colors.warning;
      case 'danger': return colors.danger;
      case 'info': return colors.accent;
      case 'muted': return colors.textMuted;
    }
  };
  const c = getColor();
  const s = size === 'sm' ? { px: 8, py: 3, fs: 11 } : { px: 12, py: 5, fs: 13 };
  return (
    <View style={[styles.badge, { backgroundColor: c + '20', paddingHorizontal: s.px, paddingVertical: s.py }]}>
      {dot && <View style={{ backgroundColor: c, width: 6, height: 6, borderRadius: 3, marginRight: 5 }} />}
      <Text style={{ color: c, fontSize: s.fs, fontWeight: '600' }}>{label}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: { borderRadius: 20, flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start' },
});
