import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

interface MenuAction {
  label: string;
  icon: string;
  onPress: () => void;
}

interface FloatingActionMenuProps {
  actions: MenuAction[];
}

export default function FloatingActionMenu({ actions }: FloatingActionMenuProps) {
  const { colors } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [fadeAnim] = useState(new Animated.Value(0));
  const [rotateAnim] = useState(new Animated.Value(0));

  const toggle = () => {
    const toValue = isOpen ? 0 : 1;
    setIsOpen(!isOpen);
    Animated.parallel([
      Animated.spring(fadeAnim, { toValue, useNativeDriver: true, tension: 60 }),
      Animated.spring(rotateAnim, { toValue, useNativeDriver: true, tension: 60 }),
    ]).start();
  };

  const handleAction = (action: MenuAction) => {
    toggle();
    setTimeout(() => action.onPress(), 200);
  };

  const rotate = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '45deg'],
  });

  return (
    <View style={styles.container} pointerEvents="box-none">
      {/* Затемнение фона */}
      {isOpen && (
        <TouchableOpacity
          activeOpacity={1}
          style={[styles.overlay, { backgroundColor: 'rgba(0,0,0,0.3)' }]}
          onPress={toggle}
        />
      )}

      {/* Меню действий */}
      <Animated.View
        style={[
          styles.menuContainer,
          {
            opacity: fadeAnim,
            transform: [{ scale: fadeAnim }],
          },
        ]}
      >
        {actions.map((action, index) => (
          <TouchableOpacity
            key={index}
            onPress={() => handleAction(action)}
            style={[styles.menuItem, { backgroundColor: colors.surface }]}
            activeOpacity={0.7}
          >
            <View style={[styles.menuIcon, { backgroundColor: colors.accent }]}>
              <Text style={{ fontSize: 20, color: colors.onAccent }}>{action.icon}</Text>
            </View>
            <View style={[styles.menuLabel, { backgroundColor: colors.surface }]}>
              <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: '600' }}>
                {action.label}
              </Text>
            </View>
          </TouchableOpacity>
        ))}
      </Animated.View>

      {/* Главная кнопка */}
      <TouchableOpacity
        onPress={toggle}
        activeOpacity={0.8}
        style={[styles.fab, { backgroundColor: colors.accent }]}
      >
        <Animated.View style={{ transform: [{ rotate }] }}>
          <Text style={{ color: colors.onAccent, fontSize: 32, fontWeight: '300', lineHeight: 34 }}>
            +
          </Text>
        </Animated.View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    zIndex: 999,
    alignItems: 'flex-end',
  },
  overlay: {
    position: 'absolute',
    top: -1000,
    left: -1000,
    right: -1000,
    bottom: -1000,
  },
  menuContainer: {
    marginBottom: 12,
    alignItems: 'flex-end',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    borderRadius: 28,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 5,
  },
  menuIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuLabel: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginRight: -8,
    borderRadius: 24,
  },
  fab: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
});