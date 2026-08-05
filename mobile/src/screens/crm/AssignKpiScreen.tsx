import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator, StatusBar,
} from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { api, MetricType } from '../../services/api';

const METRIC_OPTIONS: { id: MetricType; label: string; unit: string }[] = [
  { id: 'quantity', label: 'Штуки', unit: 'шт' },
  { id: 'amount', label: 'Рубли', unit: '₽' },
  { id: 'contracts', label: 'Контракты', unit: 'контр.' },
];

export default function AssignKpiScreen({ navigation }: any) {
  const { colors } = useTheme();
  const [subordinates, setSubordinates] = useState<any[]>([]);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [productName, setProductName] = useState('');
  const [metricType, setMetricType] = useState<MetricType>('quantity');
  const [targetValue, setTargetValue] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadSubordinates();
  }, []);

  const loadSubordinates = async () => {
    setLoading(true);
    try {
      const data = await api.getSubordinates();
      setSubordinates(data);
    } catch (e) {
      Alert.alert('Ошибка', 'Не удалось загрузить список подчинённых');
    } finally {
      setLoading(false);
    }
  };

  const handleAssign = async () => {
    if (!selectedUser) {
      Alert.alert('Ошибка', 'Выберите сотрудника');
      return;
    }
    if (!productName.trim()) {
      Alert.alert('Ошибка', 'Введите название товара/услуги');
      return;
    }
    const target = parseFloat(targetValue);
    if (!target || target <= 0) {
      Alert.alert('Ошибка', 'Цель должна быть больше 0');
      return;
    }

    setSaving(true);
    try {
      await api.assignTarget({
        user_id: selectedUser.user_id,
        product_name: productName.trim(),
        metric_type: metricType,
        target_value: target,
        description: description.trim() || undefined,
      });
      Alert.alert('✅ Успех', `KPI назначен ${selectedUser.display_name}`);
      navigation.goBack();
    } catch (e: any) {
      Alert.alert('Ошибка', e.message || 'Не удалось назначить KPI');
    } finally {
      setSaving(false);
    }
  };

  const currentUnit = METRIC_OPTIONS.find(m => m.id === metricType)?.unit || '';

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={colors.background === '#fff' ? 'dark-content' : 'light-content'} backgroundColor={colors.background} />
      
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border, paddingTop: (StatusBar.currentHeight || 24) + 8 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBtn}>
          <Text style={{ color: colors.accent, fontSize: 16 }}>Отмена</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Назначить KPI</Text>
        <TouchableOpacity onPress={handleAssign} disabled={saving} style={styles.headerBtn}>
          <Text style={{ color: colors.accent, fontSize: 16, fontWeight: '600' }}>
            {saving ? '...' : 'Назначить'}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        
        {/* Выбор сотрудника */}
        <Text style={[styles.label, { color: colors.textSecondary }]}>Сотрудник</Text>
        {loading ? (
          <ActivityIndicator color={colors.accent} style={{ marginVertical: 20 }} />
        ) : subordinates.length === 0 ? (
          <Text style={[styles.empty, { color: colors.textMuted }]}>Нет подчинённых</Text>
        ) : (
          <View style={styles.userList}>
            {subordinates.map(user => {
              const selected = selectedUser?.user_id === user.user_id;
              return (
                <TouchableOpacity
                  key={user.user_id}
                  onPress={() => setSelectedUser(user)}
                  style={[
                    styles.userCard,
                    {
                      backgroundColor: selected ? colors.accentMuted : colors.surface,
                      borderColor: selected ? colors.accent : colors.border,
                    },
                  ]}
                >
                  <Text style={[styles.userName, { color: colors.textPrimary }]}>{user.display_name}</Text>
                  <Text style={[styles.userKpis, { color: colors.textSecondary }]}>
                    {user.kpis?.length || 0} активных KPI
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Название товара */}
        <Text style={[styles.label, { color: colors.textSecondary }]}>Товар / Услуга</Text>
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

        {/* Описание */}
        <Text style={[styles.label, { color: colors.textSecondary }]}>Описание (опционально)</Text>
        <TextInput
          style={[styles.input, styles.multilineInput, { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: colors.border }]}
          value={description}
          onChangeText={setDescription}
          placeholder="Дополнительная информация"
          placeholderTextColor={colors.textMuted}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
        />

        {/* Кнопка */}
        <TouchableOpacity
          onPress={handleAssign}
          disabled={saving}
          style={[styles.createBtn, { backgroundColor: saving ? colors.surface : colors.accent }]}
        >
          {saving ? (
            <ActivityIndicator color={colors.onAccent} />
          ) : (
            <Text style={[styles.createBtnText, { color: colors.onAccent }]}>
              Назначить KPI
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
  empty: { textAlign: 'center', fontSize: 14, marginVertical: 20 },
  userList: { gap: 8 },
  userCard: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  userName: { fontSize: 15, fontWeight: '600', marginBottom: 2 },
  userKpis: { fontSize: 12 },
});
