import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Avatar } from './Avatar';
import { TelegramColors, TelegramSizes, TelegramFonts } from '../theme/telegramTheme';

interface ChatHeaderProps {
  title: string;
  avatar?: string;
  status?: string;
  onBack: () => void;
  onSearch?: () => void;
  onMenu?: () => void;
}

export const ChatHeader = ({ title, avatar, status = 'online', onBack, onSearch, onMenu }: ChatHeaderProps) => (
  <View style={styles.root}>
    <TouchableOpacity onPress={onBack} style={styles.backButton}><Text style={styles.backIcon}>←</Text></TouchableOpacity>
    <Avatar size={TelegramSizes.avatar.chat} image={avatar} title={title} />
    <View style={styles.center}>
      <Text numberOfLines={1} style={styles.title}>{title}</Text>
      <Text numberOfLines={1} style={styles.status}>{status}</Text>
    </View>
    {onSearch && <TouchableOpacity onPress={onSearch} style={styles.iconButton}><Text style={styles.icon}>🔍</Text></TouchableOpacity>}
    {onMenu && <TouchableOpacity onPress={onMenu} style={styles.iconButton}><Text style={styles.icon}>⋮</Text></TouchableOpacity>}
  </View>
);

const styles = StyleSheet.create({
  root: { height: TelegramSizes.headerHeight, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, backgroundColor: TelegramColors.light.background, borderBottomWidth: 1, borderBottomColor: TelegramColors.light.divider },
  backButton: { padding: 8 },
  backIcon: { fontSize: 24, color: TelegramColors.light.accent },
  center: { flex: 1, marginLeft: 10 },
  title: { fontSize: TelegramFonts.sizes.name, fontWeight: TelegramFonts.weights.semiBold, color: TelegramColors.light.primaryText },
  status: { fontSize: TelegramFonts.sizes.status, color: TelegramColors.light.secondaryText },
  iconButton: { padding: 8 },
  icon: { fontSize: 24, color: TelegramColors.light.accent },
});
