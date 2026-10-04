import React from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Отступ под системную навигацию (кнопки или полоска жестов).
 * Приложение рисуется «от края до края» на всех телефонах, поэтому
 * нижние шторки и панели сами отступают ровно на высоту системной панели:
 * на Samsung с кнопками — на высоту кнопок, на телефонах с жестами — на
 * тонкую полоску, без лишнего пустого места.
 */
export default function SafeBottom({ min = 0, extra = 0 }: { min?: number; extra?: number }) {
  const { bottom } = useSafeAreaInsets();
  return <View style={{ height: Math.max(bottom, min) + extra }} />;
}
