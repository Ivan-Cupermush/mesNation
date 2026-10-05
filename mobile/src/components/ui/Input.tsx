import React, { forwardRef } from 'react';
import { TextInput, View, Text, TextInputProps, ViewStyle } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';

import { themed } from '../../theme/runtime';
interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  /** Эмодзи-строка (старое API) или иконка-компонент. */
  icon?: string | React.ReactNode;
  containerStyle?: ViewStyle;
}

export const Input = forwardRef<TextInput, InputProps>(
  ({ label, error, icon, containerStyle, style, ...rest }, ref) => {
    const { colors } = useTheme();
    return (
      <View style={[styles.container, containerStyle]}>
        {label && <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text>}
        <View style={[styles.wrapper, { backgroundColor: colors.surface, borderColor: error ? colors.danger : colors.border }]}>
          {typeof icon === 'string' ? (
            <Text style={[styles.icon, { color: colors.textMuted }]}>{icon}</Text>
          ) : icon ? (
            <View style={styles.iconNode}>{icon}</View>
          ) : null}
          <TextInput
            ref={ref}
            placeholderTextColor={colors.textMuted}
            style={[styles.input, { color: colors.textPrimary }, style]}
            {...rest}
          />
        </View>
        {error && <Text style={[styles.error, { color: colors.danger }]}>{error}</Text>}
      </View>
    );
  },
);

const styles = themed(() => ({
  container: { marginBottom: 12 },
  label: { fontSize: 13, fontWeight: '600', marginBottom: 6, marginLeft: 2 },
  wrapper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, paddingHorizontal: 14 },
  icon: { fontSize: 18, marginRight: 8 },
  iconNode: { marginRight: 10 },
  input: { flex: 1, paddingVertical: 12, fontSize: 15 },
  error: { fontSize: 12, marginTop: 4, marginLeft: 2 }
}));
