import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { TelegramColors, TelegramFonts } from '../theme/telegramTheme';

interface DocumentBubbleProps {
  fileName: string;
  fileSize: string;
}

export const DocumentBubble = ({ fileName, fileSize }: DocumentBubbleProps) => (
  <View style={styles.container}>
    <Text style={styles.icon}>📄</Text>
    <View style={styles.info}>
      <Text numberOfLines={1} style={styles.name}>{fileName}</Text>
      <Text style={styles.size}>{fileSize}</Text>
    </View>
  </View>
);

const styles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', height: 56, paddingHorizontal: 12, backgroundColor: TelegramColors.light.secondaryBackground, borderRadius: 12 },
  icon: { fontSize: 24, marginRight: 12 },
  info: { flex: 1 },
  name: { fontSize: TelegramFonts.sizes.message, fontWeight: TelegramFonts.weights.semiBold, color: TelegramColors.light.primaryText },
  size: { fontSize: TelegramFonts.sizes.time, color: TelegramColors.light.secondaryText },
});
