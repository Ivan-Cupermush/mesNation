import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { TelegramColors, TelegramFonts } from '../theme/telegramTheme';

interface ReactionBarProps {
  reactions: { emoji: string; count: number }[];
}

export const ReactionBar = ({ reactions }: ReactionBarProps) => (
  <View style={styles.container}>
    {reactions.map((r, i) => (
      <View key={i} style={styles.reaction}>
        <Text style={styles.emoji}>{r.emoji}</Text>
        <Text style={styles.count}>{r.count}</Text>
      </View>
    ))}
  </View>
);

const styles = StyleSheet.create({
  container: { flexDirection: 'row', gap: 4, marginTop: 2 },
  reaction: { flexDirection: 'row', alignItems: 'center', backgroundColor: TelegramColors.light.secondaryBackground, borderRadius: 12, paddingHorizontal: 6, paddingVertical: 2 },
  emoji: { fontSize: 14 },
  count: { fontSize: TelegramFonts.sizes.time, color: TelegramColors.light.secondaryText, marginLeft: 2 },
});
