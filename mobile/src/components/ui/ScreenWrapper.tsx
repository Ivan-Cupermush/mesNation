import React, { ReactNode } from 'react';
import { View, StyleSheet, StatusBar, ScrollView, Platform } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';

interface Props {
  children: ReactNode;
  scroll?: boolean;
  padding?: number;
}

export const ScreenWrapper = ({ children, scroll = false, padding = 0 }: Props) => {
  const { colors, isDark } = useTheme();
  
  // Простой фиксированный отступ для Android
  const statusBarHeight = Platform.OS === 'android' ? 24 : 0;
  
  const content = (
    <View style={[styles.inner, { padding, paddingTop: padding + statusBarHeight }]}>
      {children}
    </View>
  );
  
  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <StatusBar 
        barStyle={isDark ? 'light-content' : 'dark-content'} 
        backgroundColor={colors.background}
        translucent={Platform.OS === 'android'}
      />
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

const styles = StyleSheet.create({
  root: { flex: 1 },
  inner: { flex: 1 },
});
