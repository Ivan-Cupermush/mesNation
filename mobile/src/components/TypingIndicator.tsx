import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { TelegramColors, TelegramFonts } from '../theme/telegramTheme';

interface TypingIndicatorProps {
  userName: string;
}

export const TypingIndicator = ({ userName }: TypingIndicatorProps) => (
  <View style={styles.container}>
    <Text style={styles.text}>{userName} печатает...</Text>
  </View>
);

const styles = StyleSheet.create({
  container: { paddingHorizontal: 12, paddingVertical: 4 },
  text: { fontSize: TelegramFonts.sizes.time, color: TelegramColors.light.secondaryText, fontStyle: 'italic' },
});
