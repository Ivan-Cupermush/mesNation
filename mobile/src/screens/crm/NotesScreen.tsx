import React from 'react';
import { View, Text, StyleSheet, SafeAreaView, StatusBar, ScrollView } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { Card } from '../../components/ui/Card';

export default function NotesScreen() {
  const { colors, isDark } = useTheme();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <Text style={{ fontSize: 32, fontWeight: '700', color: colors.textPrimary, marginBottom: 8 }}>Notes</Text>
        <Text style={{ fontSize: 15, color: colors.textSecondary, marginBottom: 24 }}>В разработке</Text>

        <Card padding="lg">
          <Text style={{ fontSize: 48, textAlign: 'center', marginBottom: 12 }}>📝</Text>
          <Text style={{ fontSize: 18, fontWeight: '600', color: colors.textPrimary, textAlign: 'center', marginBottom: 8 }}>Личные заметки</Text>
          <Text style={{ fontSize: 14, color: colors.textSecondary, textAlign: 'center' }}>Скоро здесь появится полноценный функционал</Text>
        </Card>

        <Text style={{ fontSize: 16, fontWeight: '600', color: colors.textPrimary, marginTop: 24, marginBottom: 12 }}>Что будет:</Text>
              <Text style={{ fontSize: 15, color: colors.textSecondary, marginVertical: 3 }}>• Текст, чеклисты, изображения, файлы</Text>
              <Text style={{ fontSize: 15, color: colors.textSecondary, marginVertical: 3 }}>• Цветные теги и папки</Text>
              <Text style={{ fontSize: 15, color: colors.textSecondary, marginVertical: 3 }}>• Полнотекстовый поиск</Text>
              <Text style={{ fontSize: 15, color: colors.textSecondary, marginVertical: 3 }}>• Шеринг в мессенджер (кнопка "Принять")</Text>
              <Text style={{ fontSize: 15, color: colors.textSecondary, marginVertical: 3 }}>• Офлайн-режим</Text>
      </ScrollView>
    </SafeAreaView>
  );
}
