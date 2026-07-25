import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, StatusBar, Alert, TextInput, Modal,
  RefreshControl,
} from 'react-native';
import { useRoute, RouteProp } from '@react-navigation/native';
import { useTheme } from '../../theme/ThemeContext';
import { api, Task, TaskHistoryItem } from '../../services/api';
// getCurrentUser теперь берётся из api

type TaskDetailRouteProp = RouteProp<{ params: { taskId: number } }, 'params'>;

const STATUS_CONFIG: Record<string, { label: string; color: string; emoji: string }> = {
  new:         { label: 'Новая',        color: '#94A3B8', emoji: '🆕' },
  in_progress: { label: 'В работе',     color: '#3B82F6', emoji: '🔨' },
  on_review:   { label: 'На проверке',  color: '#F59E0B', emoji: '👁' },
  done:        { label: 'Выполнена',    color: '#10B981', emoji: '✅' },
  rejected:    { label: 'Отклонена',    color: '#EF4444', emoji: '❌' },
  archived:    { label: 'В архиве',     color: '#6B7280', emoji: '🗄' },
  overdue:     { label: 'Просрочена',   color: '#DC2626', emoji: '⏰' },
};

export default function TaskDetailScreen({ navigation }: any) {
  const { colors } = useTheme();
  const route = useRoute<TaskDetailRouteProp>();
  const taskId = route.params.taskId;

  const [task, setTask] = useState<Task | null>(null);
  const [history, setHistory] = useState<TaskHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [transitioning, setTransitioning] = useState(false);

  // Модалка отклонения
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectComment, setRejectComment] = useState('');

  const loadData = async () => {
    try {
      const [taskData, historyData, user] = await Promise.all([
        api.getTask(taskId),
        api.getTaskHistory(taskId),
        api.getCurrentUser(),
      ]);
      setTask(taskData);
      setHistory(historyData);
      setCurrentUser(user);
    } catch (e: any) {
      Alert.alert('Ошибка', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { loadData(); }, [taskId]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  // === Определение ролей текущего пользователя ===
  const isCreator = task?.creator_id === currentUser?.id;
  const isAssignee = task?.assignees?.some((a: any) => a.id === currentUser?.id) || false;

  // === Обработчики переходов ===
  const handleTransition = async (toStatus: string) => {
    setTransitioning(true);
    try {
      await api.transitionTask(taskId, toStatus);
      loadData();
    } catch (e: any) {
      Alert.alert('Ошибка', e.message || 'Не удалось изменить статус');
    } finally {
      setTransitioning(false);
    }
  };

  const handleTake = () => {
    Alert.alert(
      'Взять в работу?',
      'Задача будет переведена в статус "В работе"',
      [
        { text: 'Отмена', style: 'cancel' },
        { text: 'Взять', onPress: () => handleTransition('in_progress') },
      ]
    );
  };

  const handleSendToReview = () => {
    Alert.alert(
      'Отправить на проверку?',
      'Создатель получит уведомление для проверки результата',
      [
        { text: 'Отмена', style: 'cancel' },
        { text: 'Отправить', onPress: () => handleTransition('on_review') },
      ]
    );
  };

  const handleAccept = () => {
    Alert.alert(
      'Принять задачу?',
      'Задача будет помечена как выполненная',
      [
        { text: 'Отмена', style: 'cancel' },
        { text: 'Принять', onPress: () => handleTransition('done') },
      ]
    );
  };

  const handleReject = () => {
    setShowRejectModal(true);
  };

  const submitReject = async () => {
    if (!rejectComment.trim()) {
      Alert.alert('Ошибка', 'Укажите причину отклонения');
      return;
    }
    setTransitioning(true);
    try {
      await api.transitionTask(taskId, 'rejected', rejectComment.trim());
      setShowRejectModal(false);
      setRejectComment('');
      loadData();
    } catch (e: any) {
      Alert.alert('Ошибка', e.message || 'Не удалось отклонить задачу');
    } finally {
      setTransitioning(false);
    }
  };

  const handleReturnToWork = () => {
    Alert.alert(
      'Вернуть на доработку?',
      'Задача будет возвращена в статус "В работе"',
      [
        { text: 'Отмена', style: 'cancel' },
        { text: 'Вернуть', onPress: () => handleTransition('in_progress') },
      ]
    );
  };

  const handleArchive = () => {
    Alert.alert(
      'Архивировать задачу?',
      'Задача будет перемещена в архив',
      [
        { text: 'Отмена', style: 'cancel' },
        { text: 'Архивировать', onPress: () => handleTransition('archived') },
      ]
    );
  };

  if (loading || !task) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  const statusConf = STATUS_CONFIG[task.status_new] || STATUS_CONFIG.new;
  const importanceConf = {
    green:  { label: 'Низкий',  color: '#10B981', emoji: '🟢' },
    yellow: { label: 'Средний', color: '#F59E0B', emoji: '🟡' },
    red:    { label: 'Высокий', color: '#EF4444', emoji: '🔴' },
  }[task.importance || 'yellow'];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar
        barStyle={colors.background === '#fff' ? 'dark-content' : 'light-content'}
        backgroundColor={colors.background}
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
        }
      >
        {/* Статус + важность */}
        <View style={styles.badgesRow}>
          <View style={[styles.badge, { backgroundColor: statusConf.color }]}>
            <Text style={styles.badgeText}>{statusConf.emoji} {statusConf.label}</Text>
          </View>
          <View style={[styles.badge, { backgroundColor: importanceConf.color }]}>
            <Text style={styles.badgeText}>{importanceConf.emoji} {importanceConf.label}</Text>
          </View>
        </View>

        {/* Заголовок */}
        <Text style={[styles.title, { color: colors.textPrimary }]}>{task.title}</Text>

        {/* Описание */}
        {task.description ? (
          <Text style={[styles.description, { color: colors.textSecondary }]}>
            {task.description}
          </Text>
        ) : (
          <Text style={[styles.description, { color: colors.textMuted, fontStyle: 'italic' }]}>
            Без описания
          </Text>
        )}

        {/* Метаданные */}
        <View style={[styles.metaBlock, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.metaRow}>
            <Text style={[styles.metaLabel, { color: colors.textSecondary }]}>👤 Создатель:</Text>
            <Text style={[styles.metaValue, { color: colors.textPrimary }]}>
              {task.creator?.display_name || 'Неизвестно'}
            </Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={[styles.metaLabel, { color: colors.textSecondary }]}>🔨 Исполнитель:</Text>
            <Text style={[styles.metaValue, { color: colors.textPrimary }]}>
              {task.assignees?.map((a: any) => a.display_name).join(', ') || '—'}
            </Text>
          </View>
          {task.hard_deadline && (
            <View style={styles.metaRow}>
              <Text style={[styles.metaLabel, { color: colors.textSecondary }]}>⏰ Дедлайн:</Text>
              <Text style={[styles.metaValue, { color: colors.textPrimary }]}>
                {new Date(task.hard_deadline).toLocaleDateString('ru-RU', {
                  day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
                })}
              </Text>
            </View>
          )}
        </View>

        {/* ===== ДИНАМИЧЕСКИЕ КНОПКИ ПЕРЕХОДОВ ===== */}
        {task.status_new !== 'archived' && task.status_new !== 'done' && (
          <View style={styles.actionsBlock}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
              ⚡ Действия
            </Text>

            {/* Исполнитель + новая задача → "Взять в работу" */}
            {isAssignee && task.status_new === 'new' && (
              <TouchableOpacity
                onPress={handleTake}
                disabled={transitioning}
                style={[styles.actionBtn, { backgroundColor: '#3B82F6' }]}
              >
                <Text style={styles.actionBtnText}>
                  🚀 Взять в работу
                </Text>
              </TouchableOpacity>
            )}

            {/* Исполнитель + в работе → "Отправить на проверку" */}
            {isAssignee && task.status_new === 'in_progress' && (
              <TouchableOpacity
                onPress={handleSendToReview}
                disabled={transitioning}
                style={[styles.actionBtn, { backgroundColor: '#F59E0B' }]}
              >
                <Text style={styles.actionBtnText}>
                  📤 Отправить на проверку
                </Text>
              </TouchableOpacity>
            )}

            {/* Создатель + на проверке → "Принять" + "Отклонить" */}
            {isCreator && task.status_new === 'on_review' && (
              <View style={styles.dualButtons}>
                <TouchableOpacity
                  onPress={handleAccept}
                  disabled={transitioning}
                  style={[styles.actionBtnHalf, { backgroundColor: '#10B981' }]}
                >
                  <Text style={styles.actionBtnText}>✅ Принять</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleReject}
                  disabled={transitioning}
                  style={[styles.actionBtnHalf, { backgroundColor: '#EF4444' }]}
                >
                  <Text style={styles.actionBtnText}>❌ Отклонить</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Исполнитель + отклонена → "Вернуть на доработку" */}
            {isAssignee && task.status_new === 'rejected' && (
              <TouchableOpacity
                onPress={handleReturnToWork}
                disabled={transitioning}
                style={[styles.actionBtn, { backgroundColor: '#3B82F6' }]}
              >
                <Text style={styles.actionBtnText}>
                  🔄 Вернуть на доработку
                </Text>
              </TouchableOpacity>
            )}

            {/* Если не показывается ни одной кнопки — подсказка */}
            {!(isAssignee && task.status_new === 'new') &&
             !(isAssignee && task.status_new === 'in_progress') &&
             !(isCreator && task.status_new === 'on_review') &&
             !(isAssignee && task.status_new === 'rejected') && (
              <View style={[styles.noActionsBox, { backgroundColor: colors.surface }]}>
                <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center' }}>
                  {isCreator 
                    ? '⏳ Ожидается действие исполнителя' 
                    : isAssignee 
                      ? '⏳ Ожидается действие создателя' 
                      : '🔒 У вас нет прав на действия с этой задачей'}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Кнопка "Архивировать" для выполненной задачи */}
        {isCreator && task.status_new === 'done' && (
          <TouchableOpacity
            onPress={handleArchive}
            disabled={transitioning}
            style={[styles.actionBtn, { backgroundColor: '#6B7280', marginTop: 16 }]}
          >
            <Text style={styles.actionBtnText}>🗄 Архивировать</Text>
          </TouchableOpacity>
        )}

        {/* ===== ИСТОРИЯ ПЕРЕХОДОВ ===== */}
        <View style={styles.historyBlock}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
            📜 История переходов ({history.length})
          </Text>
          {history.map((item, idx) => {
            const fromConf = item.from_status ? STATUS_CONFIG[item.from_status] : null;
            const toConf = STATUS_CONFIG[item.to_status];
            return (
              <View
                key={item.id}
                style={[
                  styles.historyItem,
                  { 
                    backgroundColor: colors.surface, 
                    borderColor: colors.border,
                    borderLeftColor: toConf.color,
                  },
                ]}
              >
                <View style={styles.historyHeader}>
                  <Text style={[styles.historyUser, { color: colors.textPrimary }]}>
                    {item.changed_by_name}
                  </Text>
                  <Text style={[styles.historyDate, { color: colors.textMuted }]}>
                    {new Date(item.created_at).toLocaleString('ru-RU', {
                      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                    })}
                  </Text>
                </View>
                <View style={styles.historyTransition}>
                  {fromConf ? (
                    <View style={[styles.historyStatus, { backgroundColor: fromConf.color }]}>
                      <Text style={styles.historyStatusText}>{fromConf.emoji} {fromConf.label}</Text>
                    </View>
                  ) : (
                    <View style={[styles.historyStatus, { backgroundColor: '#6B7280' }]}>
                      <Text style={styles.historyStatusText}>✨ Создана</Text>
                    </View>
                  )}
                  <Text style={{ color: colors.textSecondary, marginHorizontal: 8 }}>→</Text>
                  <View style={[styles.historyStatus, { backgroundColor: toConf.color }]}>
                    <Text style={styles.historyStatusText}>{toConf.emoji} {toConf.label}</Text>
                  </View>
                </View>
                {item.comment && (
                  <View style={[styles.historyComment, { backgroundColor: colors.background }]}>
                    <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                      💬 {item.comment}
                    </Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      </ScrollView>

      {/* ===== МОДАЛКА ОТКЛОНЕНИЯ ===== */}
      <Modal visible={showRejectModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.background }]}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
              ❌ Отклонить задачу
            </Text>
            <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>
              Укажите причину отклонения. Исполнитель увидит этот комментарий.
            </Text>
            <TextInput
              style={[
                styles.rejectInput,
                { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: colors.border },
              ]}
              value={rejectComment}
              onChangeText={setRejectComment}
              placeholder="Например: Не соответствует ТЗ, нужно переделать..."
              placeholderTextColor={colors.textMuted}
              multiline
              numberOfLines={4}
              autoFocus
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                onPress={() => { setShowRejectModal(false); setRejectComment(''); }}
                style={[styles.modalBtn, { backgroundColor: colors.surface }]}
              >
                <Text style={{ color: colors.textPrimary, fontWeight: '600' }}>Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={submitReject}
                disabled={transitioning || !rejectComment.trim()}
                style={[
                  styles.modalBtn,
                  { backgroundColor: rejectComment.trim() ? '#EF4444' : '#CBD5E1' },
                ]}
              >
                <Text style={{ color: '#fff', fontWeight: '600' }}>
                  {transitioning ? 'Отклоняем...' : 'Отклонить'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scrollContent: {
    padding: 16,
    paddingTop: (StatusBar.currentHeight || 24) + 16,
    paddingBottom: 40,
  },
  badgesRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
    flexWrap: 'wrap',
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  badgeText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 8 },
  description: { fontSize: 15, lineHeight: 22, marginBottom: 16 },
  metaBlock: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  metaLabel: { fontSize: 13 },
  metaValue: { fontSize: 13, fontWeight: '600', maxWidth: '60%', textAlign: 'right' },
  actionsBlock: { marginBottom: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 10 },
  actionBtn: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 8,
  },
  actionBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  dualButtons: { flexDirection: 'row', gap: 8 },
  actionBtnHalf: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  noActionsBox: {
    padding: 14,
    borderRadius: 12,
  },
  historyBlock: { marginTop: 8 },
  historyItem: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderLeftWidth: 4,
    marginBottom: 8,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  historyUser: { fontSize: 13, fontWeight: '600' },
  historyDate: { fontSize: 11 },
  historyTransition: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  historyStatus: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  historyStatusText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  historyComment: {
    padding: 8,
    borderRadius: 6,
    marginTop: 6,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    padding: 24,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  modalTitle: { fontSize: 20, fontWeight: '700', marginBottom: 8 },
  modalSubtitle: { fontSize: 13, marginBottom: 16 },
  rejectInput: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    fontSize: 15,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  modalBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
});