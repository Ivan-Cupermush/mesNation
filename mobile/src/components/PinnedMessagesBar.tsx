import React from 'react';
import { TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import { TelegramColors, TelegramSizes, TelegramFonts } from '../theme/telegramTheme';

interface PinnedMessagesBarProps {
  text: string;
  current: number;
  total: number;
  onPress: () => void;
}

export const PinnedMessagesBar = ({ text, current, total, onPress }: PinnedMessagesBarProps) => (
  <TouchableOpacity style={styles.bar} onPress={onPress}>
    <Text numberOfLines={1} style={styles.text}>📌 {text}</Text>
    <Text style={styles.counter}>{current}/{total}</Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', height: TelegramSizes.pinnedBarHeight, paddingHorizontal: 12, backgroundColor: TelegramColors.light.secondaryBackground, borderBottomWidth: 1, borderColor: TelegramColors.light.divider },
  text: { flex: 1, fontSize: TelegramFonts.sizes.message, color: TelegramColors.light.primaryText },
  counter: { fontSize: TelegramFonts.sizes.time, color: TelegramColors.light.secondaryText },
});
