import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { TelegramColors, TelegramFonts } from '../theme/telegramTheme';

interface ReplyPreviewProps {
  senderName: string;
  messageText: string;
  onCancel: () => void;
}

export const ReplyPreview = ({ senderName, messageText, onCancel }: ReplyPreviewProps) => (
  <View style={styles.container}>
    <View style={styles.line} />
    <View style={styles.content}>
      <Text style={styles.sender}>{senderName}</Text>
      <Text style={styles.text} numberOfLines={1}>{messageText}</Text>
    </View>
  </View>
);

const styles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, backgroundColor: TelegramColors.light.secondaryBackground, borderBottomWidth: 1, borderColor: TelegramColors.light.divider },
  line: { width: 2, height: 32, backgroundColor: TelegramColors.light.accent, borderRadius: 1, marginRight: 8 },
  content: { flex: 1 },
  sender: { fontSize: TelegramFonts.sizes.time, fontWeight: TelegramFonts.weights.semiBold, color: TelegramColors.light.accent },
  text: { fontSize: TelegramFonts.sizes.message, color: TelegramColors.light.primaryText },
});
