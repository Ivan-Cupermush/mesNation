import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, StatusBar, Alert, TextInput, Modal,
  RefreshControl, KeyboardAvoidingView, Platform, Keyboard, Linking,
} from 'react-native';
import { useRoute, RouteProp } from '@react-navigation/native';
import { useTheme } from '../../theme/ThemeContext';
import { api, Task, TaskHistoryItem, TaskCanvasPost } from '../../services/api';
import { SERVER_URL } from '../../utils';
import { pick, types, isCancel } from '@react-native-documents/picker';

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
  const [comments, setComments] = useState<TaskCanvasPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [transitioning, setTransitioning] = useState(false);

  const [newComment, setNewComment] = useState('');
  const [sendingComment, setSendingComment] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [editingText, setEditingText] = useState('');
  const [uploadingFile, setUploadingFile] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);

  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectComment, setRejectComment] = useState('');

  const loadData = async () => {
    try {
      const taskData = await api.getTask(taskId);
      setTask(taskData);

      try {
        const historyData = await api.getTaskHistory(taskId);
        setHistory(historyData);
      } catch (e) {
        console.warn('⚠️ Не удалось загрузить историю:', e);
        setHistory([]);
      }

      try {
        const commentsData = await api.getTaskComments(taskId);
        setComments(commentsData);
      } catch (e) {
        console.warn('⚠️ Не удалось загрузить комментарии:', e);
        setComments([]);
      }

      try {
        const user = await api.getCurrentUser();
        setCurrentUser(user);
      } catch (e) {
        console.warn('⚠️ Не удалось загрузить пользователя:', e);
        setCurrentUser(null);
      }
    } catch (e: any) {
      Alert.alert('Ошибка загрузки задачи', e.message || 'Не удалось загрузить задачу');
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

  const isCreator = task?.creator_id === currentUser?.id;
  const isAssignee = task?.assignees?.some((a: any) => a.id === currentUser?.id) || false;

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
    Alert.alert('Взять в работу?', 'Задача будет переведена в статус "В работе"', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Взять', onPress: () => handleTransition('in_progress') },
    ]);
  };

  const handleSendToReview = () => {
    Alert.alert('Отправить на проверку?', 'Создатель получит уведомление для проверки результата', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Отправить', onPress: () => handleTransition('on_review') },
    ]);
  };

  const handleAccept = () => {
    Alert.alert('Принять задачу?', 'Задача будет помечена как выполненная', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Принять', onPress: () => handleTransition('done') },
    ]);
  };

  const handleReject = () => setShowRejectModal(true);

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
    Alert.alert('Вернуть на доработку?', 'Задача будет возвращена в статус "В работе"', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Вернуть', onPress: () => handleTransition('in_progress') },
    ]);
  };

  const handleArchive = () => {
    Alert.alert('Архивировать задачу?', 'Задача будет перемещена в архив', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Архивировать', onPress: () => handleTransition('archived') },
    ]);
  };

  const handleSendComment = async () => {
    if (!newComment.trim()) return;
    setSendingComment(true);
    try {
      await api.addCanvasPost(taskId, newComment.trim());
      setNewComment('');
      Keyboard.dismiss();
      loadData();
    } catch (e: any) {
      Alert.alert('Ошибка', e.message || 'Не удалось отправить комментарий');
    } finally {
      setSendingComment(false);
    }
  };

  const handleEditComment = (comment: TaskCanvasPost) => {
    setEditingCommentId(comment.id);
    setEditingText(comment.content);
  };

  const handleSaveEdit = async () => {
    if (!editingText.trim() || editingCommentId === null) return;
    try {
      await api.updateTaskComment(taskId, editingCommentId, editingText.trim());
      setEditingCommentId(null);
      setEditingText('');
      loadData();
    } catch (e: any) {
      Alert.alert('Ошибка', e.message || 'Не удалось обновить комментарий');
    }
  };

  const handleDeleteComment = (commentId: number) => {
    Alert.alert('Удалить комментарий?', 'Это действие нельзя отменить', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.deleteTaskComment(taskId, commentId);
            loadData();
          } catch (e: any) {
            Alert.alert('Ошибка', e.message || 'Не удалось удалить комментарий');
          }
        },
      },
    ]);
  };

  const handlePickFile = async () => {
    try {
      const result = await pick({
        type: [types.allFiles],
        allowMultiSelection: false,
        copyTo: 'cachesDirectory',
      });
      const file = result[0];
      if (!file || !file.uri) return;
      
      setUploadingFile(true);
      try {
        await api.uploadTaskFile(taskId, file.uri, file.name || 'file', file.type || 'application/octet-stream', file.size || 0);
        loadData();
      } catch (e: any) {
        Alert.alert('Ошибка', e.message || 'Не удалось загрузить файл');
      } finally {
        setUploadingFile(false);
      }
    } catch (e: any) {
      if (!isCancel(e)) {
        Alert.alert('Ошибка', 'Не удалось выбрать файл');
      }
    }
  };

  const handleDeleteFile = (fileId: number, fileName: string) => {
    Alert.alert('Удалить файл?', `"${fileName}" будет удалён без возможности восстановления`, [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.deleteTaskFile(taskId, fileId);
            loadData();
          } catch (e: any) {
            Alert.alert('Ошибка', e.message || 'Не удалось удалить файл');
          }
        },
      },
    ]);
  };

  const handleOpenFile = (fileUrl: string) => {
    const fullUrl = `${SERVER_URL}${fileUrl}`;
    Linking.openURL(fullUrl).catch(() => {
      Alert.alert('Ошибка', 'Не удалось открыть файл');
    });
  };

  const getFileIcon = (mimeType: string, fileName: string): string => {
    if (!mimeType) return '📄';
    if (mimeType.startsWith('image/')) return '🖼';
    if (mimeType.startsWith('video/')) return '🎥';
    if (mimeType.startsWith('audio/')) return '🎵';
    if (mimeType.includes('pdf')) return '📕';
    if (mimeType.includes('word') || fileName.endsWith('.docx') || fileName.endsWith('.doc')) return '📘';
    if (mimeType.includes('sheet') || fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) return '📗';
    if (mimeType.includes('presentation') || fileName.endsWith('.pptx')) return '📙';
    if (mimeType.includes('zip') || mimeType.includes('rar') || mimeType.includes('archive')) return '🗜';
    return '📄';
  };

  const formatFileSize = (bytes: number | null): string => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} Б`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
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
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <StatusBar
        barStyle={colors.background === '#fff' ? 'dark-content' : 'light-content'}
        backgroundColor={colors.background}
      />

      <ScrollView
        ref={scrollViewRef}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
        }
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.badgesRow}>
          <View style={[styles.badge, { backgroundColor: statusConf.color }]}>
            <Text style={styles.badgeText}>{statusConf.emoji} {statusConf.label}</Text>
          </View>
          <View style={[styles.badge, { backgroundColor: importanceConf.color }]}>
            <Text style={styles.badgeText}>{importanceConf.emoji} {importanceConf.label}</Text>
          </View>
        </View>

        <Text style={[styles.title, { color: colors.textPrimary }]}>{task.title}</Text>

        {task.description ? (
          <Text style={[styles.description, { color: colors.textSecondary }]}>
            {task.description}
          </Text>
        ) : (
          <Text style={[styles.description, { color: colors.textMuted, fontStyle: 'italic' }]}>
            Без описания
          </Text>
        )}

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
          {(task.executor_deadline || task.hard_deadline) && (
            <View style={styles.metaRow}>
              <Text style={[styles.metaLabel, { color: colors.textSecondary }]}>🔨 Дедлайн выполнения:</Text>
              <Text style={[styles.metaValue, { color: colors.textPrimary }]}>
                {new Date(task.executor_deadline || task.hard_deadline!).toLocaleDateString('ru-RU', {
                  day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
                })}
              </Text>
            </View>
          )}
          {task.reviewer_deadline && (
            <View style={styles.metaRow}>
              <Text style={[styles.metaLabel, { color: colors.textSecondary }]}>👁 Дедлайн проверки:</Text>
              <Text style={[styles.metaValue, { color: '#F59E0B' }]}>
                {new Date(task.reviewer_deadline).toLocaleDateString('ru-RU', {
                  day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
                })}
              </Text>
            </View>
          )}
        </View>

        {task.status_new !== 'archived' && task.status_new !== 'done' && (
          <View style={styles.actionsBlock}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>⚡ Действия</Text>

            {isAssignee && task.status_new === 'new' && (
              <TouchableOpacity
                onPress={handleTake}
                disabled={transitioning}
                style={[styles.actionBtn, { backgroundColor: '#3B82F6' }]}
              >
                <Text style={styles.actionBtnText}>🚀 Взять в работу</Text>
              </TouchableOpacity>
            )}

            {isAssignee && task.status_new === 'in_progress' && (
              <TouchableOpacity
                onPress={handleSendToReview}
                disabled={transitioning}
                style={[styles.actionBtn, { backgroundColor: '#F59E0B' }]}
              >
                <Text style={styles.actionBtnText}>📤 Отправить на проверку</Text>
              </TouchableOpacity>
            )}

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

            {isAssignee && task.status_new === 'rejected' && (
              <TouchableOpacity
                onPress={handleReturnToWork}
                disabled={transitioning}
                style={[styles.actionBtn, { backgroundColor: '#3B82F6' }]}
              >
                <Text style={styles.actionBtnText}>🔄 Вернуть на доработку</Text>
              </TouchableOpacity>
            )}

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

        {isCreator && task.status_new === 'done' && (
          <TouchableOpacity
            onPress={handleArchive}
            disabled={transitioning}
            style={[styles.actionBtn, { backgroundColor: '#6B7280', marginTop: 16 }]}
          >
            <Text style={styles.actionBtnText}>🗄 Архивировать</Text>
          </TouchableOpacity>
        )}

        <View style={styles.historyBlock}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
            📜 История переходов ({history.length})
          </Text>
          {history.map((item) => {
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

        <View style={styles.commentsBlock}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
            💬 Комментарии ({comments.length})
          </Text>
          
          {comments.length === 0 ? (
            <View style={[styles.emptyComments, { backgroundColor: colors.surface }]}>
              <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center' }}>
                Пока нет комментариев. Напишите первый!
              </Text>
            </View>
          ) : (
            comments.map((comment) => {
              const isOwn = comment.author_id === currentUser?.id;
              const isCommentCreator = comment.author_id === task.creator_id;
              const isCommentAssignee = task.assignees?.some((a: any) => a.id === comment.author_id);
              
              let roleColor = '#94A3B8';
              let roleLabel = '';
              if (isCommentCreator) {
                roleColor = '#6366F1';
                roleLabel = 'Создатель';
              } else if (isCommentAssignee) {
                roleColor = '#3B82F6';
                roleLabel = 'Исполнитель';
              }

              return (
                <View
                  key={comment.id}
                  style={[
                    styles.commentItem,
                    { backgroundColor: colors.surface, borderLeftColor: roleColor },
                  ]}
                >
                  <View style={styles.commentHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.commentAuthor, { color: colors.textPrimary }]}>
                        {comment.display_name}
                      </Text>
                      {roleLabel && (
                        <View style={[styles.roleBadge, { backgroundColor: roleColor }]}>
                          <Text style={styles.roleBadgeText}>{roleLabel}</Text>
                        </View>
                      )}
                    </View>
                    <Text style={[styles.commentDate, { color: colors.textMuted }]}>
                      {new Date(comment.created_at).toLocaleString('ru-RU', {
                        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                      })}
                    </Text>
                  </View>

                  {editingCommentId === comment.id ? (
                    <View>
                      <TextInput
                        style={[
                          styles.editInput,
                          { backgroundColor: colors.background, color: colors.textPrimary, borderColor: colors.border },
                        ]}
                        value={editingText}
                        onChangeText={setEditingText}
                        multiline
                        autoFocus
                      />
                      <View style={styles.editButtons}>
                        <TouchableOpacity
                          onPress={() => { setEditingCommentId(null); setEditingText(''); }}
                          style={[styles.editBtn, { backgroundColor: colors.surface }]}
                        >
                          <Text style={{ color: colors.textPrimary }}>Отмена</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={handleSaveEdit}
                          style={[styles.editBtn, { backgroundColor: colors.accent }]}
                        >
                          <Text style={{ color: colors.onAccent }}>Сохранить</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    <Text style={[styles.commentText, { color: colors.textPrimary }]}>
                      {comment.content}
                    </Text>
                  )}

                  {isOwn && editingCommentId !== comment.id && (
                    <View style={styles.commentActions}>
                      <TouchableOpacity onPress={() => handleEditComment(comment)}>
                        <Text style={{ color: colors.accent, fontSize: 12 }}>✏️ Редактировать</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => handleDeleteComment(comment.id)}>
                        <Text style={{ color: '#EF4444', fontSize: 12 }}>🗑 Удалить</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })
          )}
        </View>

        <View style={styles.filesBlock}>
          <View style={styles.filesHeader}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
              📎 Файлы ({(task.files || []).length})
            </Text>
            <TouchableOpacity
              onPress={handlePickFile}
              disabled={uploadingFile}
              style={[styles.attachBtn, { backgroundColor: colors.accent }]}
            >
              <Text style={{ color: colors.onAccent, fontSize: 13, fontWeight: '600' }}>
                {uploadingFile ? '⏳' : '📎 Прикрепить'}
              </Text>
            </TouchableOpacity>
          </View>

          {(task.files || []).length === 0 ? (
            <View style={[styles.emptyFiles, { backgroundColor: colors.surface }]}>
              <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center' }}>
                Файлы не прикреплены
              </Text>
            </View>
          ) : (
            (task.files || []).map((file: any) => {
              const isOwnFile = file.uploaded_by === currentUser?.id;
              const isTaskCreator = task.creator_id === currentUser?.id;
              return (
                <TouchableOpacity
                  key={file.id}
                  onPress={() => handleOpenFile(file.file_url)}
                  activeOpacity={0.7}
                  style={[styles.fileItem, { backgroundColor: colors.surface, borderColor: colors.border }]}
                >
                  <View style={styles.fileIcon}>
                    <Text style={{ fontSize: 28 }}>
                      {getFileIcon(file.mime_type, file.file_name)}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.fileName, { color: colors.textPrimary }]} numberOfLines={1}>
                      {file.file_name || 'Без имени'}
                    </Text>
                    <Text style={[styles.fileMeta, { color: colors.textSecondary }]}>
                      {formatFileSize(file.file_size)} · {new Date(file.uploaded_at).toLocaleDateString('ru-RU', {
                        day: '2-digit', month: '2-digit', year: 'numeric',
                      })}
                    </Text>
                  </View>
                  {(isOwnFile || isTaskCreator) && (
                    <TouchableOpacity
                      onPress={() => handleDeleteFile(file.id, file.file_name)}
                      style={styles.fileDeleteBtn}
                    >
                      <Text style={{ color: '#EF4444', fontSize: 18 }}>🗑</Text>
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>
              );
            })
          )}
        </View>
      </ScrollView>

      <View style={[styles.inputBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
        <TextInput
          style={[
            styles.commentInput,
            { backgroundColor: colors.background, color: colors.textPrimary, borderColor: colors.border },
          ]}
          value={newComment}
          onChangeText={setNewComment}
          placeholder="Напишите комментарий..."
          placeholderTextColor={colors.textMuted}
          multiline
          maxLength={1000}
        />
        <TouchableOpacity
          onPress={handleSendComment}
          disabled={!newComment.trim() || sendingComment}
          style={[
            styles.sendBtn,
            { backgroundColor: newComment.trim() ? colors.accent : '#CBD5E1' },
          ]}
        >
          <Text style={{ color: '#fff', fontSize: 20 }}>{sendingComment ? '⏳' : '📤'}</Text>
        </TouchableOpacity>
      </View>

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
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scrollContent: {
    padding: 16,
    paddingTop: (StatusBar.currentHeight || 24) + 16,
    paddingBottom: 100,
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
  historyBlock: { marginTop: 8, marginBottom: 16 },
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
  commentsBlock: { marginTop: 8 },
  emptyComments: {
    padding: 20,
    borderRadius: 12,
  },
  commentItem: {
    padding: 12,
    borderRadius: 10,
    borderLeftWidth: 4,
    marginBottom: 8,
  },
  commentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  commentAuthor: { fontSize: 13, fontWeight: '600' },
  roleBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  roleBadgeText: { color: '#fff', fontSize: 10, fontWeight: '600' },
  commentDate: { fontSize: 11 },
  commentText: { fontSize: 14, lineHeight: 20 },
  commentActions: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 8,
  },
  editInput: {
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 14,
    minHeight: 60,
    textAlignVertical: 'top',
  },
  editButtons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  editBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 12,
    borderTopWidth: 1,
    gap: 8,
  },
  commentInput: {
    flex: 1,
    padding: 10,
    borderRadius: 20,
    borderWidth: 1,
    fontSize: 14,
    maxHeight: 100,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
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
  filesBlock: { marginTop: 16 },
  filesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  attachBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
  },
  emptyFiles: {
    padding: 20,
    borderRadius: 12,
  },
  fileItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  fileIcon: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  fileName: { fontSize: 14, fontWeight: '600', marginBottom: 2 },
  fileMeta: { fontSize: 12 },
  fileDeleteBtn: {
    padding: 8,
    marginLeft: 8,
  },
});
