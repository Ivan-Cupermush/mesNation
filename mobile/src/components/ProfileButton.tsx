import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  Pressable,
  Image,
  } from 'react-native';
import { User, LogOut, Settings, ChevronRight } from 'lucide-react-native';
import { api } from '../services/api';
import { SERVER_URL } from '../utils';

import { T, themed } from '../theme/runtime';
interface ProfileButtonProps {
  onLogout: () => void;
  onProfilePress?: () => void;
  user?: {
    display_name?: string;
    username?: string;
    avatar_url?: string | null;
    role_name?: string;
    email?: string;
  } | null;
}

const AVATAR_COLORS = [
  '#1F7A52', '#3B82F6', '#8B5CF6', '#EC4899',
  '#F59E0B', '#0EA5E9', '#14B8A6', '#EF4444',
];

const hashColor = (s: string) => {
  const sum = (s || '?').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return AVATAR_COLORS[sum % AVATAR_COLORS.length];
};

const initials = (name: string) =>
  (name || '?').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

export default function ProfileButton({ onLogout, onProfilePress, user }: ProfileButtonProps) {
  const [menuVisible, setMenuVisible] = useState(false);
  const buttonRef = useRef<View>(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, right: 0 });

  const name = user?.display_name || user?.username || '';
  const roleName = user?.role_name || 'Сотрудник';

  const handlePress = () => {
    if (buttonRef.current) {
      buttonRef.current.measureInWindow((x, y, width, height) => {
        setMenuPosition({ top: y + height + 8, right: 16 });
        setMenuVisible(true);
      });
    } else {
      setMenuVisible(true);
    }
  };

  const handleLogoutPress = () => {
    setMenuVisible(false);
    setTimeout(() => onLogout(), 100);
  };

  const handleProfilePress = () => {
    setMenuVisible(false);
    if (onProfilePress) {
      setTimeout(() => onProfilePress(), 100);
    }
  };

  return (
    <>
      <View ref={buttonRef}>
        <TouchableOpacity
          onPress={handlePress}
          activeOpacity={0.7}
          style={styles.avatarButton}
        >
          {user?.avatar_url ? (
            <Image
              source={{ uri: SERVER_URL + user.avatar_url }}
              style={styles.avatarImage}
            />
          ) : (
            <View style={[styles.avatarFallback, { backgroundColor: hashColor(name) }]}>
              <Text style={styles.avatarText}>{initials(name)}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}
      >
        <Pressable
          style={styles.overlay}
          onPress={() => setMenuVisible(false)}
        >
          <View
            style={[
              styles.menu,
              {
                top: menuPosition.top,
                right: menuPosition.right,
              },
            ]}
          >
            {/* Заголовок с именем */}
            <View style={styles.menuHeader}>
              <View style={styles.menuAvatarWrap}>
                {user?.avatar_url ? (
                  <Image
                    source={{ uri: SERVER_URL + user.avatar_url }}
                    style={styles.menuAvatar}
                  />
                ) : (
                  <View style={[styles.menuAvatarFallback, { backgroundColor: hashColor(name) }]}>
                    <Text style={styles.menuAvatarText}>{initials(name)}</Text>
                  </View>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.menuName} numberOfLines={1}>
                  {name || 'Пользователь'}
                </Text>
                <Text style={styles.menuRole} numberOfLines={1}>
                  {roleName}
                </Text>
                {!!user?.email && (
                  <Text style={styles.menuEmail} numberOfLines={1}>
                    {user.email}
                  </Text>
                )}
              </View>
            </View>

            <View style={styles.menuDivider} />

            {/* Кнопка: Профиль */}
            {onProfilePress && (
              <TouchableOpacity
                style={styles.menuItem}
                onPress={handleProfilePress}
                activeOpacity={0.7}
              >
                <View style={[styles.menuIconWrap, { backgroundColor: T.violetSoft }]}>
                  <User size={16} color={T.violet} strokeWidth={2} />
                </View>
                <Text style={styles.menuItemText}>Мой профиль</Text>
                <ChevronRight size={16} color={T.textMuted} strokeWidth={2} />
              </TouchableOpacity>
            )}

            {/* Кнопка: Выйти */}
            <TouchableOpacity
              style={styles.menuItem}
              onPress={handleLogoutPress}
              activeOpacity={0.7}
            >
              <View style={[styles.menuIconWrap, { backgroundColor: T.dangerSoft }]}>
                <LogOut size={16} color={T.danger} strokeWidth={2} />
              </View>
              <Text style={[styles.menuItemText, { color: T.danger }]}>Выйти</Text>
              <ChevronRight size={16} color={T.textMuted} strokeWidth={2} />
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = themed(() => ({
  avatarButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: T.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  avatarImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  avatarFallback: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: T.onAccent,
    fontWeight: '700',
    fontSize: 14,
  },

  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
  },

  menu: {
    position: 'absolute',
    width: 280,
    backgroundColor: T.card,
    borderRadius: 20,
    padding: 8,
    shadowColor: T.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 8,
  },

  menuHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 14,
  },
  menuAvatarWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
  },
  menuAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  menuAvatarFallback: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuAvatarText: {
    color: T.onAccent,
    fontWeight: '700',
    fontSize: 15,
  },
  menuName: {
    fontSize: 15,
    fontWeight: '700',
    color: T.textPrimary,
    marginBottom: 2,
  },
  menuRole: {
    fontSize: 12,
    color: T.textSecondary,
    fontWeight: '600',
  },
  menuEmail: {
    fontSize: 11,
    color: T.textMuted,
    fontWeight: '500',
    marginTop: 1,
  },

  menuDivider: {
    height: 1,
    backgroundColor: T.inputBg,
    marginVertical: 6,
    marginHorizontal: 8,
  },

  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 14,
  },
  menuIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuItemText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: T.textPrimary,
  }
}));