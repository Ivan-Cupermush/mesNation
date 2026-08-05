import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';

interface StatTileProps {
  emoji: string;
  label: string;
  value: string;
  tint: string;
}

export const StatTile: React.FC<StatTileProps> = ({ emoji, label, value, tint }) => {
  const { colors } = useTheme();
  return (
    <View style={[styles.tile, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[styles.iconWrap, { backgroundColor: tint + '1A' }]}>
        <Text style={styles.emoji}>{emoji}</Text>
      </View>
      <Text
        style={[styles.value, { color: colors.textPrimary }]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>
      <Text style={[styles.label, { color: colors.textSecondary }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    minWidth: '46%',
    padding: 14,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emoji: { fontSize: 19 },
  value: { fontSize: 19, fontWeight: '800', letterSpacing: -0.4, marginBottom: 2 },
  label: { fontSize: 12, fontWeight: '500' },
});
