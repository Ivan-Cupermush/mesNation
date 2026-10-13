import { useSafeAreaInsets } from 'react-native-safe-area-context';
import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, StatusBar, Switch,
} from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { api, MetricType } from '../../services/api';
import { kpiApi } from '../../services/kpi';

import { themed } from '../../theme/runtime';
import { showError, showSuccess } from '../../components/ui/toast';
const METRIC_OPTIONS: { id: MetricType; label: string; unit: string }[] = [
  { id: 'quantity', label: 'Штуки', unit: 'шт' },
  { id: 'amount', label: 'Рубли', unit: '₽' },
  { id: 'contracts', label: 'Контракты', unit: 'контр.' },
];

/**
 * Назначить KPI сотруднику: руководитель — своей команде, директор и тот, кому
 * включено «Назначение KPI вручную», — по своей функции. По умолчанию факт
 * считается по отчёту о продажах (продажи товара или группы с этим названием).
 */
export default function AssignKpiScreen({ navigation, route }: any) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const preset = route?.params?.userId ? { user_id: Number(route.params.userId), display_name: route.params.userName || 'Сотрудник' } : null;
  const [subordinates, setSubordinates] = useState<any[]>([]);
  const [selectedUser, setSelectedUser] = useState<any>(preset);
  const [fromReport, setFromReport] = useState(true);
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
      // Кому можно назначить KPI (руководителю — своя команда).
      setSubordinates(await kpiApi.people('kpi_assign'));
    } catch {
      showError('Не удалось загрузить список сотрудников', 'Ошибка');
    } finally {
      setLoading(false);
    }
  };

  const handleAssign = async () => {
    if (!selectedUser) {
      showError('Выберите сотрудника', 'Ошибка');
      return;
    }
    if (!productName.trim()) {
      showError('Введите название товара/услуги', 'Ошибка');
      return;
    }
    const target = parseFloat(targetValue);
    if (!target || target <= 0) {
      showError('Цель должна быть больше 0', 'Ошибка');
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
        from_report: fromReport,
      });
      showSuccess(selectedUser.display_name || selectedUser.username || '', 'KPI назначен');
      navigation.goBack();
    } catch (e: any) {
      showError(e.message || 'Не удалось назначить KPI', 'Ошибка');
    } finally {
      setSaving(false);
    }
  };

  const currentUnit = METRIC_OPTIONS.find(m => m.id === metricType)?.unit || '';

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingBottom: insets.bottom }]}>
      <StatusBar barStyle={colors.statusBar} backgroundColor="transparent" translucent />
      
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border, paddingTop: insets.top + 8 }]}>
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
        {preset ? (
          <View style={[styles.userCard, { backgroundColor: colors.accentMuted, borderColor: colors.accent }]}>
            <Text style={[styles.userName, { color: colors.textPrimary }]} numberOfLines={1}>{preset.display_name}</Text>
          </View>
        ) : loading ? (
          <ActivityIndicator color={colors.accent} style={{ marginVertical: 20 }} />
        ) : subordinates.length === 0 ? (
          <Text style={[styles.empty, { color: colors.textMuted }]}>Нет сотрудников, которым вы можете назначить KPI</Text>
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
                  <Text style={[styles.userName, { color: colors.textPrimary }]} numberOfLines={1}>{user.display_name || user.username}</Text>
                  <Text style={[styles.userKpis, { color: colors.textSecondary }]}>
                    {user.role_name || 'Сотрудник'}
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

        {/* Как считать факт */}
        <View style={[styles.switchRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.userName, { color: colors.textPrimary }]}>Считать по отчёту о продажах</Text>
            <Text style={[styles.userKpis, { color: colors.textSecondary }]}>
              {fromReport
                ? `Факт — ${metricType === 'amount' ? 'сумма продаж' : metricType === 'contracts' ? 'точки, купившие' : 'проданные штуки'} товара или группы «${productName.trim() || '…'}» из отчёта 1С`
                : 'Выполнение отмечают вручную'}
            </Text>
          </View>
          <Switch
            value={fromReport}
            onValueChange={setFromReport}
            trackColor={{ false: colors.border, true: colors.accent }}
            thumbColor="#FFFFFF"
            accessibilityLabel="Считать по отчёту о продажах"
          />
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

const styles = themed(() => ({
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
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 12, borderWidth: 1, marginTop: 16 },
}));
