import React, { ReactNode } from 'react';
import { View, StatusBar, ScrollView } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { themed } from '../../theme/runtime';
interface Props {
  children: ReactNode;
  scroll?: boolean;
  padding?: number;
}

export const ScreenWrapper = ({ children, scroll = false, padding = 0 }: Props) => {
  const { colors, isDark } = useTheme();
  
  // Отступ сверху — реальная высота статус-бара/выреза камеры этого телефона.
  const statusBarHeight = useSafeAreaInsets().top;
  
  const content = (
    <View style={[styles.inner, { padding, paddingTop: padding + statusBarHeight }]}>
      {children}
    </View>
  );
  
  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor="transparent" translucent />
      {scroll ? (
        <ScrollView 
          style={{ flex: 1 }} 
          contentContainerStyle={{ flexGrow: 1, paddingBottom: 24 }} 
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {content}
        </ScrollView>
      ) : content}
    </View>
  );
};

const styles = themed(() => ({
  root: { flex: 1 },
  inner: { flex: 1 }
}));
