import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator,
  SafeAreaView, RefreshControl, TextInput, Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../../theme/ThemeContext';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { api } from '../../services/api';

export default function TaskDetailScreen({ route }: any) {
  const { taskId } = route.params;
  const { colors } = useTheme();
  const [task, setTask] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [newCanvasPost, setNewCanvasPost] = useState('');
  const [posting, setPosting] = useState(false);

  const loadTask = useCallback(async () => {
    try {
      const data = await api.getTask(taskId);
      setTask(data);
    } catch (e) {
      console.error('Ошибка загрузки:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [taskId]);

  useFocusEffect(useCallback(() => {
    loadTask();
  }, [loadTask]));

  const onRefresh = () => {
    setRefreshing(true);
    loadTask();
  };

  const handleStatusChange = async (newStatus: string) => {
    try {
      await api.updateTask(taskId, { status_new: newStatus });
      loadTask();
    } catch (e: any) {
      Alert.alert('Ошибка', e.message);
    }
  };

  const handlePostCanvas = async () => {
    if (!newCanvasPost.trim()) return;
    setPosting(true);
    try {
      await api.addCanvasPost(taskId, newCanvasPost.trim());
      setNewCanvasPost('');
      loadTask();
    } catch (e: any) {
      Alert.alert('Ошибка', e.message);
    } finally {
      setPosting(false);
    }
  };

  if (loading || !task) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  const importanceEmoji = task.importance === 'green' ? '🟢' : task.importance === 'yellow' ? '🟡' : '🔴';
  const importanceLabel = task.importance === 'green' ? 'Низкий' : task.importance === 'yellow' ? 'Средний' : 'Срочный';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
      >
        <View style={{ marginBottom: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
            <Text style={{ fontSize: 24, marginRight: 8 }}>{importanceEmoji}</Text>
            <Badge label={importanceLabel} variant={task.importance === 'red' ? 'danger' : task.importance === 'yellow' ? 'warning' : 'success'} />
          </View>
          <Text style={[styles.taskTitle, { color: colors.textPrimary }]}>{task.title}</Text>
          {task.description && (
            <Text style={[styles.taskDesc, { color: colors.textSecondary, marginTop: 8 }]}>
              {task.description}
            </Text>
          )}
        </View>

        <Card padding="md" style={{ marginBottom: 12 }}>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>📅 Дедлайн:</Text>
            <Text style={{ color: colors.textPrimary, fontWeight: '500' }}>
              {task.hard_deadline ? new Date(task.hard_deadline).toLocaleString('ru-RU') : 'Не установлен'}
            </Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>👤 Создатель:</Text>
            <Text style={{ color: colors.textPrimary }}>{task.creator?.display_name || task.creator?.username}</Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>🎯 Статус:</Text>
            <Badge label={task.status_new} variant="info" />
          </View>
        </Card>

        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
          👥 Исполнители ({task.assignees?.length || 0})
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          {task.assignees?.map((a: any) => (
            <View
              key={a.id}
              style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, padding: 8, borderRadius: 20 }}
            >
              <Avatar size="xs" title={a.display_name || a.username} imageUrl={a.avatar_url} />
              <Text style={{ color: colors.textPrimary, marginLeft: 6, fontSize: 13 }}>
                {a.display_name || a.username}
              </Text>
            </View>
          ))}
        </View>

        {task.checkpoints?.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
              🎯 Контрольные точки ({task.checkpoints.length})
            </Text>
            <Card padding="md" style={{ marginBottom: 16 }}>
              {task.checkpoints.map((cp: any) => (
                <View key={cp.id} style={[styles.cpRow, { borderBottomColor: colors.divider }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.textPrimary, fontWeight: '500' }}>{cp.title}</Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                      {new Date(cp.deadline).toLocaleDateString('ru-RU')}
                    </Text>
                  </View>
                  <Badge
                    label={cp.status === 'completed' ? '✅' : cp.status === 'missed' ? '⏰' : '⏳'}
                    variant={cp.status === 'completed' ? 'success' : cp.status === 'missed' ? 'danger' : 'muted'}
                  />
                </View>
              ))}
            </Card>
          </>
        )}

        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
          📝 Общий блокнот команды ({task.canvas?.length || 0})
        </Text>
        <Card padding="md" style={{ marginBottom: 12 }}>
          {task.canvas?.length === 0 ? (
            <Text style={{ color: colors.textMuted, textAlign: 'center', paddingVertical: 12 }}>
              Пока нет записей. Добавьте первую!
            </Text>
          ) : (
            task.canvas.map((post: any) => (
              <View key={post.id} style={[styles.canvasPost, { borderBottomColor: colors.divider }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                  <Avatar size="xs" title={post.display_name || post.username} />
                  <Text style={{ color: colors.textPrimary, fontWeight: '600', marginLeft: 8 }}>
                    {post.display_name || post.username}
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: 11, marginLeft: 'auto' }}>
                    {new Date(post.created_at).toLocaleString('ru-RU')}
                  </Text>
                </View>
                <Text style={{ color: colors.textPrimary, lineHeight: 20 }}>{post.content}</Text>
              </View>
            ))
          )}
        </Card>

        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: 20 }}>
          <TextInput
            placeholder="Ваша мысль..."
            placeholderTextColor={colors.textMuted}
            value={newCanvasPost}
            onChangeText={setNewCanvasPost}
            multiline
            style={[
              styles.canvasInput,
              {
                flex: 1,
                backgroundColor: colors.surface,
                borderColor: colors.border,
                color: colors.textPrimary,
              },
            ]}
          />
          <Button
            title="➤"
            onPress={handlePostCanvas}
            loading={posting}
            disabled={posting || !newCanvasPost.trim()}
            size="md"
            style={{ paddingHorizontal: 16 }}
          />
        </View>

        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Действия</Text>
        <View style={{ gap: 8 }}>
          {task.status_new === 'new' && (
            <Button
              title="▶ Начать работу"
              onPress={() => handleStatusChange('in_progress')}
              variant="primary"
              fullWidth
            />
          )}
          {task.status_new === 'in_progress' && (
            <Button
              title="👀 Отправить на проверку"
              onPress={() => handleStatusChange('on_review')}
              variant="primary"
              fullWidth
            />
          )}
          {task.status_new === 'on_review' && (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button
                title="✅ Выполнено"
                onPress={() => handleStatusChange('done')}
                variant="primary"
                style={{ flex: 1 }}
              />
              <Button
                title="↩️ Отклонить"
                onPress={() => handleStatusChange('rejected')}
                variant="danger"
                style={{ flex: 1 }}
              />
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  taskTitle: { fontSize: 24, fontWeight: '700' },
  taskDesc: { fontSize: 15, lineHeight: 22 },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  metaLabel: { fontSize: 14, color: '#6B7280', fontWeight: '500' },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
  },
  cpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  canvasPost: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  canvasInput: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    minHeight: 44,
    maxHeight: 100,
  },
});