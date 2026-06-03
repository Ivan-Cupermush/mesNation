import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { TelegramColors, TelegramSizes, TelegramFonts } from '../theme/telegramTheme';

interface VoiceMessageBubbleProps {
  duration: string;
  isPlayed?: boolean;
}

export const VoiceMessageBubble = ({ duration, isPlayed }: VoiceMessageBubbleProps) => (
  <View style={styles.container}>
    <Text style={styles.icon}>🎤</Text>
    <View style={styles.waveform} />
    <Text style={styles.duration}>{duration}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', height: 40, paddingHorizontal: 12 },
  icon: { fontSize: 20 },
  waveform: { flex: 1, height: 24, backgroundColor: TelegramColors.light.accent, borderRadius: 12, marginHorizontal: 8 },
  duration: { fontSize: TelegramFonts.sizes.time, color: TelegramColors.light.secondaryText },
});
