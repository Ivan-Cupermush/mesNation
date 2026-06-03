import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { TelegramColors, TelegramSizes, TelegramFonts } from '../theme/telegramTheme';

interface MessageBubbleProps {
  text: string;
  isMine: boolean;
  time?: string;
  isEdited?: boolean;
  readStatus?: 'sent' | 'delivered' | 'read';
}

export const MessageBubble = ({ text, isMine, time, isEdited, readStatus }: MessageBubbleProps) => {
  const bubbleStyle = isMine ? styles.mine : styles.other;
  return (
    <View style={[styles.wrapper, isMine ? styles.mineWrapper : styles.otherWrapper]}>
      <View style={[styles.bubble, bubbleStyle]}>
        <Text style={styles.text}>{text}</Text>
        <View style={styles.meta}>
          {isEdited && <Text style={styles.edited}>edited </Text>}
          {time && <Text style={styles.time}>{time}</Text>}
          {readStatus && isMine && (
            <Text style={styles.status}>{readStatus === 'sent' ? '✓' : readStatus === 'delivered' ? '✓✓' : '✓✓'}</Text>
          )}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: { marginVertical: 2 },
  mineWrapper: { alignItems: 'flex-end' },
  otherWrapper: { alignItems: 'flex-start' },
  bubble: { maxWidth: TelegramSizes.messageBubbleMaxWidth, paddingHorizontal: 10, paddingVertical: 6, borderRadius: TelegramSizes.messageBubbleRadius },
  mine: { backgroundColor: TelegramColors.light.myMessageBubble, borderBottomRightRadius: 6 },
  other: { backgroundColor: TelegramColors.light.otherMessageBubble, borderBottomLeftRadius: 6 },
  text: { fontSize: TelegramFonts.sizes.message, color: TelegramColors.light.primaryText },
  meta: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', marginTop: 4 },
  time: { fontSize: TelegramFonts.sizes.time, opacity: 0.6, color: TelegramColors.light.primaryText },
  edited: { fontSize: TelegramFonts.sizes.time, opacity: 0.6, marginRight: 4, color: TelegramColors.light.primaryText },
  status: { fontSize: TelegramFonts.sizes.time, marginLeft: 4, color: TelegramColors.light.success },
});
