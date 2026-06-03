import React from 'react';
import { TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import { Avatar } from './Avatar';
import { TelegramColors, TelegramSizes, TelegramFonts } from '../theme/telegramTheme';

interface ChatRowProps {
  title: string;
  lastMessage?: string;
  unreadCount?: number;
  time?: string;
  avatar?: string;
  isPinned?: boolean;
  isMuted?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
}

export const ChatRow = ({ title, lastMessage, unreadCount = 0, time, avatar, isPinned, isMuted, onPress, onLongPress }: ChatRowProps) => (
  <TouchableOpacity style={[styles.root, { backgroundColor: isPinned ? TelegramColors.light.secondaryBackground : TelegramColors.light.background }]} onPress={onPress} onLongPress={onLongPress} activeOpacity={0.6}>
    <Avatar size={TelegramSizes.avatar.chatList} image={avatar} title={title} />
    <View style={styles.center}>
      <Text numberOfLines={1} style={styles.title}>{isPinned ? '📌 ' : ''}{title}</Text>
      {lastMessage ? <Text numberOfLines={1} style={styles.message}>{lastMessage}</Text> : null}
    </View>
    <View style={styles.right}>
      {time ? <Text style={styles.time}>{time}</Text> : null}
      {unreadCount > 0 ? <View style={styles.badge}><Text style={styles.badgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text></View> : null}
    </View>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  root: { height: TelegramSizes.chatRowHeight, flexDirection: 'row', alignItems: 'center', paddingLeft: 16, paddingRight: 16 },
  center: { flex: 1, marginLeft: 12 },
  right: { alignItems: 'flex-end' },
  title: { fontSize: TelegramFonts.sizes.name, fontWeight: TelegramFonts.weights.semiBold, color: TelegramColors.light.primaryText },
  message: { fontSize: TelegramFonts.sizes.message, color: TelegramColors.light.secondaryText, marginTop: 2 },
  time: { fontSize: TelegramFonts.sizes.time, color: TelegramColors.light.secondaryText },
  badge: { minWidth: TelegramSizes.unreadBadgeSize, height: TelegramSizes.unreadBadgeSize, borderRadius: TelegramSizes.unreadBadgeSize / 2, backgroundColor: TelegramColors.light.unreadBadge, justifyContent: 'center', alignItems: 'center', marginTop: 6, paddingHorizontal: 6 },
  badgeText: { color: '#fff', fontWeight: TelegramFonts.weights.semiBold, fontSize: 12 },
});
