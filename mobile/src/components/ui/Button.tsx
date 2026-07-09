import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, ViewStyle, TextStyle } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  disabled?: boolean;
  icon?: string;
  fullWidth?: boolean;
  style?: ViewStyle;
}

const sizeMap = {
  sm: { py: 8, px: 14, fs: 14, icon: 14 },
  md: { py: 12, px: 18, fs: 15, icon: 16 },
  lg: { py: 14, px: 22, fs: 16, icon: 18 },
};

export const Button = ({
  title, onPress, variant = 'primary', size = 'md',
  loading = false, disabled = false, icon, fullWidth = false, style,
}: ButtonProps) => {
  const { colors } = useTheme();
  const s = sizeMap[size];
  const isDisabled = disabled || loading;

  const getButtonStyle = (): ViewStyle => {
    const base: ViewStyle = { borderRadius: 10, borderWidth: 1, borderColor: 'transparent' };
    switch (variant) {
      case 'primary': return { ...base, backgroundColor: colors.accent, borderColor: colors.accent };
      case 'secondary': return { ...base, backgroundColor: colors.surface, borderColor: colors.border };
      case 'danger': return { ...base, backgroundColor: colors.danger, borderColor: colors.danger };
      case 'ghost': return base;
    }
  };
  const getTextStyle = (): TextStyle => {
    switch (variant) {
      case 'primary': case 'danger': return { color: colors.onAccent };
      case 'secondary': return { color: colors.textPrimary };
      case 'ghost': return { color: colors.accent };
    }
  };

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.7}
      style={[
        styles.base,
        getButtonStyle(),
        { paddingVertical: s.py, paddingHorizontal: s.px, opacity: isDisabled ? 0.5 : 1 },
        fullWidth && styles.fullWidth,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={variant === 'secondary' ? colors.accent : colors.onAccent} />
      ) : (
        <>
          {icon && <Text style={{ fontSize: s.icon, marginRight: 8 }}>{icon}</Text>}
          <Text style={[styles.text, getTextStyle(), { fontSize: s.fs }]} numberOfLines={1}>{title}</Text>
        </>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  base: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  fullWidth: { width: '100%' },
  text: { fontWeight: '600' },
});
