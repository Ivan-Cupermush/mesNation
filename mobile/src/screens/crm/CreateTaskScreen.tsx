import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Alert, ActivityIndicator,
  SafeAreaView, TouchableOpacity,
} from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { Avatar } from '../../components/ui/Avatar';
import { DatePickerField } from '../../components/ui/DatePickerField';
import { api, UserInSubtree } from '../../services/api';
import { SERVER_URL, getToken } from '../../utils';

type Importance = 'green' | 'yellow' | 'red';

interface Checkpoint {
  title: string;
  deadline: string;
}

export default function CreateTaskScreen({ navigation }: any) {
  const { colors } = useTheme();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [importance, setImportance] = useState<Importance>('yellow');
  const [deadline, setDeadline] = useState<Date | null>(null);
  const [assignees, setAssignees] = useState<UserInSubtree[]>([]);
  const [selectedAssigneeIds, setSelectedAssigneeIds] = useState<number[]>([]);
  const [selectedWatcherIds, setSelectedWatcherIds] = useState<number[]>([]);
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [newCpTitle, setNewCpTitle] = useState('');
  const [newCpDeadline, setNewCpDeadline] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);

  useEffect(() => {
    loadAvailableUsers();
  }, []);

  const loadAvailableUsers = async () => {
    try {
      const token = await getToken();
      if (!token) throw new Error('Нет токена');
      const meRes = await fetch(`${SERVER_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const me = await meRes.json();
      if (!me.role_id) {
        Alert.alert('Ошибка', 'У вас не назначена роль');
        return;
      }
      setCurrentUserId(me.id);
      const users = await api.getUsersInSubtree(me.role_id);
      setAssignees(users.filter((u) => u.id !== me.id));
      // По умолчанию создатель — наблюдатель
      setSelectedWatcherIds([me.id]);
    } catch (e: any) {
      Alert.alert('Ошибка', e.message || 'Не удалось загрузить пользователей');
    } finally {
      setLoadingUsers(false);
    }
  };

  const toggleAssignee = (id: number) => {
    setSelectedAssigneeIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const toggleWatcher = (id: number) => {
    setSelectedWatcherIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const addCheckpoint = () => {
    if (!newCpTitle.trim()) {
      Alert.alert('Ошибка', 'Введите название контрольной точки');
      return;
    }
    if (!newCpDeadline) {
      Alert.alert('Ошибка', 'Выберите дату контрольной точки');
      return;
    }
    setCheckpoints([
      ...checkpoints,
      { title: newCpTitle.trim(), deadline: newCpDeadline.toISOString() },
    ]);
    setNewCpTitle('');
    setNewCpDeadline(null);
  };

  const removeCheckpoint = (index: number) => {
    setCheckpoints(checkpoints.filter((_, i) => i !== index));
  };

  const handleCreate = async () => {
    if (!title.trim()) {
      Alert.alert('Ошибка', 'Введите название задачи');
      return;
    }
    if (selectedAssigneeIds.length === 0) {
      Alert.alert('Ошибка', 'Выберите хотя бы одного исполнителя');
      return;
    }
    setLoading(true);
    try {
      const data: any = {
        title: title.trim(),
        description: description.trim() || undefined,
        importance,
        assignee_ids: selectedAssigneeIds,
        watcher_ids: selectedWatcherIds.length > 0 ? selectedWatcherIds : undefined,
      };
      if (deadline) {
        data.hard_deadline = deadline.toISOString();
      }
      if (checkpoints.length > 0) {
        data.checkpoints = checkpoints;
      }
      await api.createTask(data);
      Alert.alert('Успех', 'Задача создана', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (e: any) {
      Alert.alert('Ошибка', e.message || 'Не удалось создать задачу');
    } finally {
      setLoading(false);
    }
  };

  // Находим текущего пользователя для отображения в "Я (создатель)"
  const currentUser = assignees.find((u) => u.id === currentUserId);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
          Основная информация
        </Text>

        <Input
          label="Название задачи *"
          placeholder="Например: Подготовить квартальный отчёт"
          value={title}
          onChangeText={setTitle}
        />

        <Input
          label="Описание"
          placeholder="Детали задачи, ожидаемый результат..."
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={4}
          style={{ minHeight: 100, textAlignVertical: 'top' }}
        />

        <Text style={[styles.sectionTitle, { color: colors.textPrimary, marginTop: 16 }]}>
          Приоритет
        </Text>
        <View style={styles.importanceRow}>
          {(['green', 'yellow', 'red'] as Importance[]).map((i) => {
            const active = importance === i;
            const emoji = i === 'green' ? '🟢' : i === 'yellow' ? '🟡' : '🔴';
            const label = i === 'green' ? 'Низкий' : i === 'yellow' ? 'Средний' : 'Срочный';
            return (
              <TouchableOpacity
                key={i}
                onPress={() => setImportance(i)}
                style={[
                  styles.importanceOption,
                  {
                    backgroundColor: active ? colors.accentMuted : colors.surface,
                    borderColor: active ? colors.accent : colors.border,
                  },
                ]}
              >
                <Text style={{ fontSize: 20 }}>{emoji}</Text>
                <Text
                  style={{
                    color: active ? colors.accent : colors.textPrimary,
                    fontWeight: active ? '600' : '400',
                    fontSize: 13,
                    marginTop: 4,
                  }}
                >
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ===== ТВЁРДЫЙ ДЕДЛАЙН (через календарик) ===== */}
        <Text style={[styles.sectionTitle, { color: colors.textPrimary, marginTop: 16 }]}>
          Твёрдый дедлайн
        </Text>
        <DatePickerField
          label="Дата и время завершения"
          value={deadline}
          onChange={setDeadline}
          mode="datetime"
          placeholder="Выберите дедлайн"
          minimumDate={new Date()}
          icon="📅"
        />

        {/* ===== КОНТРОЛЬНЫЕ ТОЧКИ ===== */}
        <Text style={[styles.sectionTitle, { color: colors.textPrimary, marginTop: 24 }]}>
          🎯 Контрольные точки ({checkpoints.length})
        </Text>
        <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 12 }}>
          Промежуточные проверки до финального дедлайна
        </Text>

        {checkpoints.length > 0 && (
          <View style={{ gap: 8, marginBottom: 12 }}>
            {checkpoints.map((cp, idx) => (
              <View
                key={idx}
                style={[
                  styles.checkpointRow,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.textPrimary, fontWeight: '500' }}>
                    📍 {cp.title}
                  </Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
                    {new Date(cp.deadline).toLocaleString('ru-RU')}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => removeCheckpoint(idx)}
                  style={{ padding: 8 }}
                >
                  <Text style={{ color: colors.danger, fontSize: 18 }}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        <Card padding="md" style={{ marginBottom: 12 }}>
          <Input
            placeholder="Название точки (например: Сбор данных)"
            value={newCpTitle}
            onChangeText={setNewCpTitle}
          />
          {/* ДАТА контрольной точки через календарик */}
          <DatePickerField
            label="Дата и время контрольной точки"
            value={newCpDeadline}
            onChange={setNewCpDeadline}
            mode="datetime"
            placeholder="Выберите дату"
            minimumDate={new Date()}
            icon="📅"
          />
          <Button
            title="+ Добавить контрольную точку"
            onPress={addCheckpoint}
            variant="secondary"
            fullWidth
          />
        </Card>

        {/* ===== ИСПОЛНИТЕЛИ ===== */}
        <Text style={[styles.sectionTitle, { color: colors.textPrimary, marginTop: 24 }]}>
          👥 Исполнители * ({selectedAssigneeIds.length} выбрано)
        </Text>

        {loadingUsers ? (
          <ActivityIndicator color={colors.accent} style={{ marginVertical: 20 }} />
        ) : assignees.length === 0 ? (
          <Card padding="md">
            <Text style={{ color: colors.textSecondary, textAlign: 'center' }}>
              В вашем поддереве нет других пользователей
            </Text>
          </Card>
        ) : (
          <View style={{ gap: 8 }}>
            {assignees.map((u) => {
              const selected = selectedAssigneeIds.includes(u.id);
              return (
                <TouchableOpacity
                  key={u.id}
                  onPress={() => toggleAssignee(u.id)}
                  style={[
                    styles.userRow,
                    {
                      backgroundColor: selected ? colors.accentMuted : colors.surface,
                      borderColor: selected ? colors.accent : colors.border,
                    },
                  ]}
                >
                  <Avatar
                    size="sm"
                    title={u.display_name || u.username}
                    imageUrl={u.avatar_url}
                  />
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={{ color: colors.textPrimary, fontWeight: '500' }}>
                      {u.display_name || u.username}
                    </Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                      @{u.username} · {u.role_name}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.checkbox,
                      {
                        backgroundColor: selected ? colors.accent : 'transparent',
                        borderColor: selected ? colors.accent : colors.border,
                      },
                    ]}
                  >
                    {selected && (
                      <Text style={{ color: colors.onAccent, fontWeight: '700' }}>✓</Text>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* ===== НАБЛЮДАТЕЛИ ===== */}
        <Text style={[styles.sectionTitle, { color: colors.textPrimary, marginTop: 24 }]}>
          👁️ Наблюдатели ({selectedWatcherIds.length} выбрано)
        </Text>
        <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 12 }}>
          Будут получать уведомления о изменениях задачи
        </Text>

        {!loadingUsers && (
          <View style={{ gap: 8 }}>
            {/* Сам создатель (всегда доступен) */}
            {currentUserId && (
              <TouchableOpacity
                onPress={() => toggleWatcher(currentUserId)}
                style={[
                  styles.userRow,
                  {
                    backgroundColor: selectedWatcherIds.includes(currentUserId)
                      ? colors.accentMuted
                      : colors.surface,
                    borderColor: selectedWatcherIds.includes(currentUserId)
                      ? colors.accent
                      : colors.border,
                  },
                ]}
              >
                <Avatar size="sm" title="Я" />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={{ color: colors.textPrimary, fontWeight: '500' }}>
                    Я (создатель)
                  </Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                    Наблюдатель по умолчанию
                  </Text>
                </View>
                <View
                  style={[
                    styles.checkbox,
                    {
                      backgroundColor: selectedWatcherIds.includes(currentUserId)
                        ? colors.accent
                        : 'transparent',
                      borderColor: selectedWatcherIds.includes(currentUserId)
                        ? colors.accent
                        : colors.border,
                    },
                  ]}
                >
                  {selectedWatcherIds.includes(currentUserId) && (
                    <Text style={{ color: colors.onAccent, fontWeight: '700' }}>✓</Text>
                  )}
                </View>
              </TouchableOpacity>
            )}

            {assignees.map((u) => {
              const selected = selectedWatcherIds.includes(u.id);
              return (
                <TouchableOpacity
                  key={`watcher-${u.id}`}
                  onPress={() => toggleWatcher(u.id)}
                  style={[
                    styles.userRow,
                    {
                      backgroundColor: selected ? colors.accentMuted : colors.surface,
                      borderColor: selected ? colors.accent : colors.border,
                    },
                  ]}
                >
                  <Avatar
                    size="sm"
                    title={u.display_name || u.username}
                    imageUrl={u.avatar_url}
                  />
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={{ color: colors.textPrimary, fontWeight: '500' }}>
                      {u.display_name || u.username}
                    </Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                      @{u.username} · {u.role_name}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.checkbox,
                      {
                        backgroundColor: selected ? colors.accent : 'transparent',
                        borderColor: selected ? colors.accent : colors.border,
                      },
                    ]}
                  >
                    {selected && (
                      <Text style={{ color: colors.onAccent, fontWeight: '700' }}>✓</Text>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        <View style={{ marginTop: 24 }}>
          <Button
            title={loading ? 'Создаём...' : 'Создать задачу'}
            onPress={handleCreate}
            loading={loading}
            disabled={loading || selectedAssigneeIds.length === 0}
            fullWidth
            size="lg"
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 8,
  },
  importanceRow: {
    flexDirection: 'row',
    gap: 8,
  },
  importanceOption: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkpointRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
});