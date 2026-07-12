import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator, StatusBar,
} from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { api, MetricType } from '../../services/api';

const METRIC_OPTIONS: { id: MetricType; label: string; unit: string }[] = [
  { id: 'quantity', label: 'Количество (шт)', unit: 'шт' },
  { id: 'amount', label: 'Сумма (рублей)', unit: '₽' },
  { id: 'contracts', label: 'Контракты', unit: 'контр.' },
];

export default function AddProductKpiScreen({ navigation }: any) {
  const { colors } = useTheme();
  const [productName, setProductName] = useState('');
  const [metricType, setMetricType] = useState<MetricType>('quantity');
  const [targetValue, setTargetValue] = useState('');
  const [currentValue, setCurrentValue] = useState('0');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!productName.trim()) {
      Alert.alert('Ошибка', 'Введите название товара');
      return;
    }
    const target = parseFloat(targetValue);
    if (!target || target <= 0) {
      Alert.alert('Ошибка', 'Цель должна быть больше 0');
      return;
    }

    setSaving(true);
    try {
      await api.createSalesTarget({
        product_name: productName.trim(),
        metric_type: metricType,
        target_value: target,
        current_value: parseFloat(currentValue) || 0,
        description: description.trim() || undefined,
      });
      navigation.goBack();
    } catch (e: any) {
      Alert.alert('Ошибка', e.message || 'Не удалось создать KPI');
    } finally {
      setSaving(false);
    }
  };

  const currentUnit = METRIC_OPTIONS.find(m => m.id === metricType)?.unit || '';

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar 
        barStyle={colors.background === '#fff' ? 'dark-content' : 'light-content'} 
        backgroundColor={colors.background}
      />
      
      {/* Header */}
      <View style={[styles.header, { 
        borderBottomColor: colors.border,
        paddingTop: (StatusBar.currentHeight || 24) + 8,
      }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBtn}>
          <Text style={{ color: colors.accent, fontSize: 16 }}>Отмена</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Новый KPI</Text>
        <TouchableOpacity 
          onPress={handleCreate} 
          disabled={saving}
          style={styles.headerBtn}
        >
          <Text style={{ color: colors.accent, fontSize: 16, fontWeight: '600' }}>
            {saving ? '...' : 'Создать'}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Название товара */}
        <Text style={[styles.label, { color: colors.textSecondary }]}>Название товара / услуги</Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: colors.border }]}
          value={productName}
          onChangeText={setProductName}
          placeholder="Например: Премиум пакет"
          placeholderTextColor={colors.textMuted}
        />

        {/* Тип метрики */}
        <Text style={[styles.label, { color: colors.textSecondary }]}>Тип метрики</Text>
        <View style={styles.metricRow}>
          {METRIC_OPTIONS.map(opt => {
            const active = metricType === opt.id;
            return (
              <TouchableOpacity
                key={opt.id}
                onPress={() => setMetricType(opt.id)}
                style={[
                  styles.metricChip,
                  {
                    backgroundColor: active ? colors.accent : colors.surface,
                    borderColor: active ? colors.accent : colors.border,
                  },
                ]}
              >
                <Text style={{ 
                  color: active ? colors.onAccent : colors.textPrimary,
                  fontWeight: active ? '600' : '400',
                  fontSize: 13,
                }}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Целевое значение */}
        <Text style={[styles.label, { color: colors.textSecondary }]}>
          Цель ({currentUnit})
        </Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: colors.border }]}
          value={targetValue}
          onChangeText={setTargetValue}
          placeholder="50"
          placeholderTextColor={colors.textMuted}
          keyboardType="numeric"
        />

        {/* Текущее значение */}
        <Text style={[styles.label, { color: colors.textSecondary }]}>
          Уже достигнуто ({currentUnit}, опционально)
        </Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: colors.border }]}
          value={currentValue}
          onChangeText={setCurrentValue}
          placeholder="0"
          placeholderTextColor={colors.textMuted}
          keyboardType="numeric"
        />

        {/* Описание */}
        <Text style={[styles.label, { color: colors.textSecondary }]}>Описание (опционально)</Text>
        <TextInput
          style={[styles.input, styles.multilineInput, { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: colors.border }]}
          value={description}
          onChangeText={setDescription}
          placeholder="Дополнительная информация о цели"
          placeholderTextColor={colors.textMuted}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
        />

        {/* Кнопка Создать (дублирующая внизу) */}
        <TouchableOpacity
          onPress={handleCreate}
          disabled={saving}
          style={[
            styles.createBtn,
            { backgroundColor: saving ? colors.surface : colors.accent },
          ]}
        >
          {saving ? (
            <ActivityIndicator color={colors.onAccent} />
          ) : (
            <Text style={[styles.createBtnText, { color: colors.onAccent }]}>
              Создать KPI
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerBtn: { padding: 8, minWidth: 70 },
  headerTitle: { fontSize: 17, fontWeight: '600' },
  scrollContent: { padding: 20, paddingBottom: 60 },
  label: { fontSize: 13, fontWeight: '600', marginBottom: 6, marginTop: 14 },
  input: {
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    fontSize: 16,
  },
  multilineInput: { minHeight: 80 },
  metricRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  metricChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
  },
  createBtn: {
    marginTop: 30,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  createBtnText: { fontSize: 16, fontWeight: '600' },
});
