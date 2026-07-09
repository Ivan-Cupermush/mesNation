import React from 'react';
import { View, Text, StyleSheet, SafeAreaView, StatusBar, ScrollView } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { Card } from '../../components/ui/Card';

export default function TasksScreen() {
  const { colors, isDark } = useTheme();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <Text style={{ fontSize: 32, fontWeight: '700', color: colors.textPrimary, marginBottom: 8 }}>Tasks</Text>
        <Text style={{ fontSize: 15, color: colors.textSecondary, marginBottom: 24 }}>В разработке</Text>

        <Card padding="lg">
          <Text style={{ fontSize: 48, textAlign: 'center', marginBottom: 12 }}>📋</Text>
          <Text style={{ fontSize: 18, fontWeight: '600', color: colors.textPrimary, textAlign: 'center', marginBottom: 8 }}>Иерархический задачник ЧУМ</Text>
          <Text style={{ fontSize: 14, color: colors.textSecondary, textAlign: 'center' }}>Скоро здесь появится полноценный функционал</Text>
        </Card>

        <Text style={{ fontSize: 16, fontWeight: '600', color: colors.textPrimary, marginTop: 24, marginBottom: 12 }}>Что будет:</Text>
              <Text style={{ fontSize: 15, color: colors.textSecondary, marginVertical: 3 }}>• Дерево прав (директор → отделы → сотрудники)</Text>
              <Text style={{ fontSize: 15, color: colors.textSecondary, marginVertical: 3 }}>• Задачи с приоритетами и дедлайнами</Text>
              <Text style={{ fontSize: 15, color: colors.textSecondary, marginVertical: 3 }}>• Контрольные точки и проверяющие</Text>
              <Text style={{ fontSize: 15, color: colors.textSecondary, marginVertical: 3 }}>• Shared Canvas для командных заметок</Text>
              <Text style={{ fontSize: 15, color: colors.textSecondary, marginVertical: 3 }}>• Календарь с визуализацией задач</Text>
              <Text style={{ fontSize: 15, color: colors.textSecondary, marginVertical: 3 }}>• Уведомления в реальном времени</Text>
      </ScrollView>
    </SafeAreaView>
  );
}
