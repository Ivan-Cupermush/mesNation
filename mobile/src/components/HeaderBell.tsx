import React, { useEffect, useRef } from 'react';
import { Animated, Text, TouchableOpacity, StyleProp, ViewStyle, Easing } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Bell } from 'lucide-react-native';
import { useUnreadNotifications } from '../notifications/inbox';
import { T, themed } from '../theme/runtime';

/**
 * Колокольчик рядом с кнопкой профиля: новые задачи и запросы заметок.
 * Пришло новое — колокольчик качнётся, на нём счётчик.
 */
export default function HeaderBell({ style, color }: { style?: StyleProp<ViewStyle>; color?: string }) {
  const navigation = useNavigation<any>();
  const count = useUnreadNotifications();
  const swing = useRef(new Animated.Value(0)).current;
  const prev = useRef(count);

  useEffect(() => {
    if (count > prev.current) {
      swing.setValue(0);
      Animated.timing(swing, { toValue: 1, duration: 700, easing: Easing.linear, useNativeDriver: true }).start();
    }
    prev.current = count;
  }, [count, swing]);

  const rotate = swing.interpolate({
    inputRange: [0, 0.15, 0.3, 0.45, 0.6, 0.75, 1],
    outputRange: ['0deg', '18deg', '-16deg', '11deg', '-7deg', '3deg', '0deg'],
  });

  return (
    <TouchableOpacity
      style={[styles.btn, style]}
      onPress={() => navigation.navigate('Notifications')}
      activeOpacity={0.7}
      accessibilityLabel={count ? `Уведомления, новых: ${count}` : 'Уведомления'}
    >
      <Animated.View style={{ transform: [{ rotate }] }}>
        <Bell size={20} color={color || T.accent} strokeWidth={2} />
      </Animated.View>
      {count > 0 && (
        <Animated.View style={styles.badge}>
          <Text style={styles.badgeText}>{count > 99 ? '99+' : count}</Text>
        </Animated.View>
      )}
    </TouchableOpacity>
  );
}

const styles = themed(() => ({
  btn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute',
    top: -2,
    right: -3,
    minWidth: 19,
    height: 19,
    paddingHorizontal: 5,
    borderRadius: 10,
    backgroundColor: T.danger,
    borderWidth: 2,
    borderColor: T.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#FFFFFF', fontSize: 10.5, fontWeight: '800' },
}));
