import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { TelegramColors, TelegramFonts } from '../theme/telegramTheme';

interface ForwardPreviewProps {
  fromChat: string;
  messageText: string;
}

export const ForwardPreview = ({ fromChat, messageText }: ForwardPreviewProps) => (
  <View style={styles.container}>
    <Text style={styles.from}>↪ Переслано из {fromChat}</Text>
    <Text style={styles.text} numberOfLines={2}>{messageText}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: { padding: 8, backgroundColor: TelegramColors.light.secondaryBackground, borderBottomWidth: 1, borderColor: TelegramColors.light.divider },
  from: { fontSize: TelegramFonts.sizes.time, color: TelegramColors.light.accent, marginBottom: 4 },
  text: { fontSize: TelegramFonts.sizes.message, color: TelegramColors.light.primaryText },
});
