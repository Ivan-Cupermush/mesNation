import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
  Modal,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  Linking,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, RouteProp } from '@react-navigation/native';
import {
  ChevronLeft,
  Flag,
  CalendarDays,
  Clock,
  User,
  Users,
  Paperclip,
  MessageCircle,
  FileText,
  Trash2,
  Pencil,
  History,
  CheckCircle2,
  XCircle,
  Archive,
  ArrowRight,
  Image as ImageIcon,
  FileVideo,
  FileAudio,
  FileSpreadsheet,
  FileArchive,
  File,
  MoreHorizontal,
  SendHorizonal,
  Eye,
  AlertCircle,
  ChevronRight,
  Plus,
  Sparkles,
} from 'lucide-react-native';
import { api, Task, TaskHistoryItem, TaskCanvasPost } from '../../services/api';
import { pick, types, isErrorWithCode, errorCodes } from '@react-native-documents/picker';
import { signedFileUrl } from '../../services/http';
import DateTimePickerModal from '../../components/DateTimePickerModal';
import { StatusPill, StatusTrack, TASK_STATUS, nextStepHint, statusMeta } from '../../components/tasks/taskStatus';

type TaskDetailRouteProp = RouteProp<{ params: { taskId: number } }, 'params'>;

// Цвета и подписи статусов — общие для всех экранов (см. taskStatus.tsx).
const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; icon: any }> = Object.fromEntries(
  Object.entries(TASK_STATUS).map(([k, m]) => [k, { label: m.label, bg: m.soft, text: m.color, icon: m.icon }]),
);

const IMPORTANCE_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  green: { label: 'Низкий приоритет', color: '#065F46', bg: '#D1FAE5' },
  yellow: { label: 'Средний приоритет', color: '#92400E', bg: '#FEF3C7' },
  red: { label: 'Высокий приоритет', color: '#B91C1C', bg: '#FEE2E2' },
};

export default function TaskDetailScreen({ navigation }: any) {
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
  // Переход, для которого вводится комментарий (обязательный — например, отклонение).
  const [commentTarget, setCommentTarget] = useState<{ to: string; action: string; required: boolean } | null>(null);
  const [peopleModal, setPeopleModal] = useState<null | 'assignees' | 'watchers'>(null);
  const [showMenu, setShowMenu] = useState(false);
  const [roleCommentField, setRoleCommentField] = useState<null | 'executor_comment' | 'watcher_comment'>(null);
  const [roleCommentText, setRoleCommentText] = useState('');
  const [newCheckpointTitle, setNewCheckpointTitle] = useState('');
  const [newCheckpointDate, setNewCheckpointDate] = useState<Date | null>(null);
  const [showCheckpointPicker, setShowCheckpointPicker] = useState(false);
  const [rejectComment, setRejectComment] = useState('');

  const loadData = useCallback(async () => {
    try {
      // Четыре запроса параллельно (раньше шли по очереди).
      const [taskData, historyData, commentsData, user] = await Promise.all([
        api.getTask(taskId),
        api.getTaskHistory(taskId).catch(() => []),
        api.getTaskComments(taskId).catch(() => []),
        api.getCurrentUser().catch(() => null),
      ]);
      setTask(taskData);
      setHistory(historyData);
      setComments(commentsData);
      setCurrentUser(user);
    } catch (e: any) {
      Alert.alert('Ошибка загрузки', e.message || 'Не удалось загрузить задачу');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [taskId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const isCreator = task?.is_creator ?? task?.creator_id === currentUser?.id;
  const isAssignee = task?.is_assignee ?? (task?.assignees?.some((a: any) => a.id === currentUser?.id) || false);
  const isWatcher = task?.is_watcher ?? (task?.watchers?.some((w: any) => w.id === currentUser?.id) || false);

  const handleTransition = async (toStatus: string, comment?: string) => {
    setTransitioning(true);
    try {
      await api.transitionTask(taskId, toStatus, comment);
      loadData();
    } catch (e: any) {
      Alert.alert('Ошибка', e.message || 'Не удалось изменить статус');
    } finally {
      setTransitioning(false);
    }
  };

  const submitReject = async () => {
    const target = commentTarget || { to: 'rejected', action: 'Отклонить', required: true };
    if (target.required && !rejectComment.trim()) {
      Alert.alert('Комментарий', target.to === 'rejected' ? 'Укажите причину отклонения' : 'Добавьте комментарий');
      return;
    }
    setTransitioning(true);
    try {
      await api.transitionTask(taskId, target.to, rejectComment.trim() || undefined);
      setShowRejectModal(false);
      setRejectComment('');
      setCommentTarget(null);
      loadData();
    } catch (e: any) {
      Alert.alert('Ошибка', e.message || 'Не удалось изменить статус');
    } finally {
      setTransitioning(false);
    }
  };

  /** Кнопка действия со статусом (список приходит с сервера — всегда совпадает с правами). */
  const runTransition = (t: { to: string; action: string; comment: string | null }) => {
    if (t.comment === 'required') {
      setCommentTarget({ to: t.to, action: t.action, required: true });
      setShowRejectModal(true);
      return;
    }
    const hint: Record<string, string> = {
      in_progress: 'Задача перейдёт в статус «В работе».',
      on_review: 'Создатель получит задачу на проверку.',
      done: 'Задача будет отмечена как выполненная.',
      archived: 'Задача переместится в архив. Её можно будет вернуть.',
    };
    Alert.alert(`${t.action}?`, hint[t.to] || '', [
      { text: 'Отмена', style: 'cancel' },
      ...(t.comment === 'optional'
        ? [
            {
              text: 'С комментарием',
              onPress: () => {
                setCommentTarget({ to: t.to, action: t.action, required: false });
                setShowRejectModal(true);
              },
            },
          ]
        : []),
      { text: t.action, onPress: () => handleTransition(t.to) },
    ]);
  };

  // ===== Разархивация (п. 13): задача возвращается в статус, где была до архива =====
  const handleUnarchive = () => {
    Alert.alert('Вернуть задачу из архива?', 'Задача вернётся в статус, в котором была до архивации.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Разархивировать',
        onPress: async () => {
          setTransitioning(true);
          try {
            await api.unarchiveTask(taskId);
            loadData();
          } catch (e: any) {
            Alert.alert('Ошибка', e.message || 'Не удалось разархивировать');
          } finally {
            setTransitioning(false);
          }
        },
      },
    ]);
  };

  // ===== Удаление (по ТЗ — в архив с пометкой «удалена», можно вернуть) =====
  const handleDelete = () => {
    setShowMenu(false);
    Alert.alert('Удалить задачу?', 'Задача уйдёт в архив с пометкой «удалена». Её можно будет вернуть.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.deleteTask(taskId);
            loadData();
          } catch (e: any) {
            Alert.alert('Ошибка', e.message || 'Не удалось удалить задачу');
          }
        },
      },
    ]);
  };

  const handleEdit = () => {
    setShowMenu(false);
    navigation.navigate('CreateTask', { taskId });
  };

  // ===== Комментарии исполнителя / наблюдателя =====
  const startRoleComment = (field: 'executor_comment' | 'watcher_comment') => {
    setRoleCommentField(field);
    setRoleCommentText((task as any)?.[field] || '');
  };

  const saveRoleComment = async () => {
    if (!roleCommentField) return;
    try {
      await api.updateTask(taskId, { [roleCommentField]: roleCommentText.trim() || null } as any);
      setRoleCommentField(null);
      loadData();
    } catch (e: any) {
      Alert.alert('Ошибка', e.message || 'Не удалось сохранить');
    }
  };

  // ===== Контрольные точки =====
  const addCheckpoint = async () => {
    if (!newCheckpointTitle.trim() || !newCheckpointDate) {
      Alert.alert('Контрольная точка', 'Укажите название и дату');
      return;
    }
    try {
      await api.addCheckpoint(taskId, newCheckpointTitle.trim(), newCheckpointDate.toISOString());
      setNewCheckpointTitle('');
      setNewCheckpointDate(null);
      loadData();
    } catch (e: any) {
      Alert.alert('Ошибка', e.message || 'Не удалось добавить');
    }
  };

  const setCheckpointStatus = async (cpId: number, status: 'pending' | 'completed' | 'missed') => {
    try {
      await api.updateCheckpoint(taskId, cpId, { status });
      loadData();
    } catch (e: any) {
      Alert.alert('Ошибка', e.message || 'Не удалось изменить');
    }
  };

  const removeCheckpoint = (cpId: number) => {
    Alert.alert('Удалить контрольную точку?', '', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.deleteCheckpoint(taskId, cpId);
            loadData();
          } catch (e: any) {
            Alert.alert('Ошибка', e.message || 'Не удалось удалить');
          }
        },
      },
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
      const result = await pick({ type: [types.allFiles], allowMultiSelection: false });
      const file = result[0];
      if (!file || !file.uri) return;

      setUploadingFile(true);
      try {
        await api.uploadTaskFile(
          taskId,
          file.uri,
          file.name || 'file',
          file.type || 'application/octet-stream',
          file.size || 0,
        );
        loadData();
      } catch (e: any) {
        Alert.alert('Ошибка', e.message || 'Не удалось загрузить файл');
      } finally {
        setUploadingFile(false);
      }
    } catch (e: any) {
      if (!(isErrorWithCode(e) && e.code === errorCodes.OPERATION_CANCELED)) {
        Alert.alert('Ошибка', 'Не удалось выбрать файл');
      }
    }
  };

  const handleDeleteFile = (fileId: number, fileName: string) => {
    Alert.alert(
      'Удалить файл?',
      `«${fileName}» будет удалён без возможности восстановления`,
      [
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
      ],
    );
  };

  const handleOpenFile = async (fileUrl: string) => {
    try {
      // Файлы задач доступны только участникам: открываем по подписанной ссылке.
      await Linking.openURL(await signedFileUrl(fileUrl));
    } catch (e: any) {
      Alert.alert('Не удалось открыть файл', e?.message || '');
    }
  };

  const getFileIconData = (
    mimeType: string,
    fileName: string,
  ): { icon: any; color: string; bg: string } => {
    if (!mimeType) return { icon: File, color: '#6B7280', bg: '#F3F4F6' };
    if (mimeType.startsWith('image/'))
      return { icon: ImageIcon, color: '#8B5CF6', bg: '#EDE9FE' };
    if (mimeType.startsWith('video/'))
      return { icon: FileVideo, color: '#EC4899', bg: '#FCE7F3' };
    if (mimeType.startsWith('audio/'))
      return { icon: FileAudio, color: '#0EA5E9', bg: '#E0F2FE' };
    if (mimeType.includes('pdf'))
      return { icon: FileText, color: '#DC2626', bg: '#FEE2E2' };
    if (
      mimeType.includes('word') ||
      fileName.endsWith('.docx') ||
      fileName.endsWith('.doc')
    )
      return { icon: FileText, color: '#2563EB', bg: '#DBEAFE' };
    if (
      mimeType.includes('sheet') ||
      fileName.endsWith('.xlsx') ||
      fileName.endsWith('.xls')
    )
      return { icon: FileSpreadsheet, color: '#16A34A', bg: '#DCFCE7' };
    if (
      mimeType.includes('zip') ||
      mimeType.includes('rar') ||
      mimeType.includes('archive')
    )
      return { icon: FileArchive, color: '#F59E0B', bg: '#FEF3C7' };
    return { icon: File, color: '#6B7280', bg: '#F3F4F6' };
  };

  const formatFileSize = (bytes: number | null): string => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} Б`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
  };

  const formatDate = (iso: string, withTime = true): string => {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString('ru-RU', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
      });
    } catch {
      return iso;
    }
  };

  /** Короткая дата для истории: «4 окт., 18:20» — помещается на узком экране. */
  const formatShortDate = (iso: string): string => {
    const d = new Date(iso);
    const sameYear = d.getFullYear() === new Date().getFullYear();
    return d.toLocaleString('ru-RU', {
      day: 'numeric',
      month: 'short',
      ...(sameYear ? {} : { year: '2-digit' }),
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getInitials = (name: string): string => {
    if (!name) return '?';
    return name
      .split(' ')
      .map((w) => w[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
  };

  const getAvatarColor = (id: number): string => {
    const colors = [
      '#1F7A52',
      '#3B82F6',
      '#8B5CF6',
      '#EC4899',
      '#F59E0B',
      '#0EA5E9',
      '#14B8A6',
      '#EF4444',
    ];
    return colors[id % colors.length];
  };

  if (loading || !task) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color="#1F7A52" />
          <Text style={styles.loadingText}>Загрузка задачи...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const importanceConf = IMPORTANCE_CONFIG[task.importance || 'yellow'];
  const deadline = task.executor_deadline || task.hard_deadline;


  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor="#FAFAF8" />

      {/* ===== HEADER ===== */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.headerBackBtn}
          activeOpacity={0.7}
        >
          <ChevronLeft size={24} color="#141414" strokeWidth={2} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerLabel}>ДЕТАЛИ ЗАДАЧИ</Text>
        </View>
        {isCreator && task.status_new !== 'archived' ? (
          <TouchableOpacity onPress={() => setShowMenu(true)} style={styles.headerBackBtn} activeOpacity={0.7} accessibilityLabel="Действия с задачей">
            <MoreHorizontal size={22} color="#141414" strokeWidth={2} />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <ScrollView
          ref={scrollViewRef}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#1F7A52"
            />
          }
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ===== ГЛАВНЫЙ БЛОК: ЗАГОЛОВОК + СТАТУС ===== */}
          <View style={styles.heroCard}>
            {/* Приоритет + статус */}
            <View style={styles.heroBadges}>
              <StatusPill status={task.status_new} overdue={task.is_overdue} />
              <View
                style={[styles.importanceBadge, { backgroundColor: importanceConf.bg }]}
              >
                <Flag size={14} color={importanceConf.color} strokeWidth={2} />
                <Text
                  style={[styles.importanceBadgeText, { color: importanceConf.color }]}
                >
                  {importanceConf.label}
                </Text>
              </View>
            </View>

            {task.is_overdue && (
              <View style={styles.overdueBanner}>
                <AlertCircle size={14} color="#B91C1C" strokeWidth={2.4} />
                <Text style={styles.overdueText}>Просрочена</Text>
              </View>
            )}

            {/* Большой заголовок */}
            <Text style={styles.heroTitle}>{task.title}</Text>

            {(isCreator || isAssignee || isWatcher || task.is_supervisor) && (
              <View style={styles.myRolesRow}>
                <Text style={styles.myRolesLabel}>Вы:</Text>
                {isCreator && <View style={styles.myRoleChip}><Text style={styles.myRoleText}>💻 создатель</Text></View>}
                {isAssignee && <View style={styles.myRoleChip}><Text style={styles.myRoleText}>🔧 исполнитель</Text></View>}
                {isWatcher && <View style={styles.myRoleChip}><Text style={styles.myRoleText}>👁 наблюдатель</Text></View>}
                {task.is_supervisor && <View style={styles.myRoleChip}><Text style={styles.myRoleText}>руководитель участника</Text></View>}
              </View>
            )}

            {/* Описание */}
            {task.description ? (
              <Text style={styles.heroDescription}>{task.description}</Text>
            ) : (
              <Text style={styles.heroDescriptionMuted}>Описание отсутствует</Text>
            )}
          </View>

          {/* ===== ИНФОРМАЦИЯ — СЕТКА 2×2 ===== */}
          <View style={styles.infoGrid}>
            {/* Создатель */}
            <View style={styles.infoCard}>
              <View style={styles.infoIconWrap}>
                <User size={18} color="#1F7A52" strokeWidth={2} />
              </View>
              <Text style={styles.infoLabel}>Создатель</Text>
              <Text style={styles.infoValue} numberOfLines={1}>
                {task.creator?.display_name || 'Неизвестно'}
              </Text>
            </View>

            {/* Дедлайн */}
            <View style={styles.infoCard}>
              <View style={styles.infoIconWrap}>
                <CalendarDays size={18} color="#1F7A52" strokeWidth={2} />
              </View>
              <Text style={styles.infoLabel}>Дедлайн</Text>
              <Text style={styles.infoValue} numberOfLines={1}>
                {deadline ? formatDate(deadline, false) : 'Не указан'}
              </Text>
            </View>

            {/* Исполнители — клик открывает список */}
            <TouchableOpacity
              style={styles.infoCard}
              onPress={() => setPeopleModal('assignees')}
              activeOpacity={0.7}
            >
              <View style={styles.infoIconWrap}>
                <Users size={18} color="#1F7A52" strokeWidth={2} />
              </View>
              <Text style={styles.infoLabel}>Исполнители</Text>
              <View style={styles.infoValueRow}>
                {task.assignees && task.assignees.length > 0 ? (
                  <View style={styles.assigneesAvatars}>
                    {task.assignees.slice(0, 3).map((a: any, idx: number) => (
                      <View
                        key={a.id}
                        style={[
                          styles.miniAvatar,
                          {
                            backgroundColor: getAvatarColor(a.id),
                            marginLeft: idx > 0 ? -8 : 0,
                            zIndex: 10 - idx,
                          },
                        ]}
                      >
                        <Text style={styles.miniAvatarText}>
                          {getInitials(a.display_name)}
                        </Text>
                      </View>
                    ))}
                    {task.assignees.length > 3 && (
                      <View
                        style={[
                          styles.miniAvatar,
                          styles.miniAvatarMore,
                          { marginLeft: -8, zIndex: 0 },
                        ]}
                      >
                        <Text style={styles.miniAvatarMoreText}>
                          +{task.assignees.length - 3}
                        </Text>
                      </View>
                    )}
                  </View>
                ) : (
                  <Text style={styles.infoValueMuted}>—</Text>
                )}
                <ChevronRight size={16} color="#BDBDBD" strokeWidth={2} />
              </View>
            </TouchableOpacity>

            {/* Наблюдатели (п. 12): по тапу — кто именно наблюдает */}
            <TouchableOpacity style={styles.infoCard} onPress={() => setPeopleModal('watchers')} activeOpacity={0.7}>
              <View style={styles.infoIconWrap}>
                <Eye size={18} color="#1F7A52" strokeWidth={2} />
              </View>
              <Text style={styles.infoLabel}>Наблюдатели</Text>
              <View style={styles.infoValueRow}>
                <Text style={styles.infoValue} numberOfLines={1}>
                  {task.watchers?.length
                    ? task.watchers.length === 1
                      ? task.watchers[0].display_name || task.watchers[0].username
                      : `${task.watchers.length} чел.`
                    : 'Создатель'}
                </Text>
                <ChevronRight size={16} color="#BDBDBD" strokeWidth={2} />
              </View>
            </TouchableOpacity>
          </View>

          {/* Дедлайн проверки (если есть) */}
          {task.reviewer_deadline && (
            <View style={styles.reviewDeadlineCard}>
              <Clock size={16} color="#92400E" strokeWidth={2} />
              <View style={{ flex: 1 }}>
                <Text style={styles.reviewDeadlineLabel}>Дедлайн проверки</Text>
                <Text style={styles.reviewDeadlineValue}>
                  {formatDate(task.reviewer_deadline)}
                </Text>
              </View>
            </View>
          )}

          {/* ===== СТАТУС: этапы, подсказка и доступные действия ===== */}
          {task.status_new !== 'archived' && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>СТАТУС</Text>
              <View style={styles.statusCard}>
                <StatusTrack status={task.status_new} />
                <View style={[styles.hintBox, { backgroundColor: statusMeta(task.status_new).soft }]}>
                  <Text style={[styles.hintText, { color: statusMeta(task.status_new).color }]}>
                    {nextStepHint(task.status_new, { creator: isCreator, assignee: isAssignee })}
                  </Text>
                </View>
                {(task.available_transitions || []).length > 0 ? (
                  <View style={styles.transitionList}>
                    {(task.available_transitions || []).map((t) => {
                      const tone =
                        t.style === 'success' ? '#16A34A' : t.style === 'danger' ? '#DC2626' : t.style === 'primary' ? '#1F7A52' : null;
                      return (
                        <TouchableOpacity
                          key={t.to}
                          onPress={() => runTransition(t)}
                          disabled={transitioning}
                          style={[styles.transitionBtn, tone ? { backgroundColor: tone, borderColor: tone } : styles.transitionBtnNeutral]}
                          activeOpacity={0.85}
                        >
                          <Text style={[styles.transitionText, { color: tone ? '#FFFFFF' : '#141414' }]}>{t.action}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ) : (
                  !isCreator &&
                  !isAssignee && <Text style={styles.noActionsText}>Вы наблюдаете за задачей — менять статус могут создатель и исполнители.</Text>
                )}
              </View>
            </View>
          )}

          {/* ===== В АРХИВЕ: пометка и разархивация ===== */}
          {task.status_new === 'archived' && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>АРХИВ</Text>
              <View style={styles.archiveCard}>
                <View style={styles.archiveIconWrap}>
                  <Archive size={20} color="#6F6F73" strokeWidth={2} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.archiveTitle}>
                    {task.archived_as === 'deleted' ? 'Задача удалена' : 'Задача в архиве'}
                  </Text>
                  <Text style={styles.archiveSubtitle}>
                    {task.archived_at ? formatDate(task.archived_at) : ''}
                  </Text>
                </View>
              </View>
              {isCreator && (
                <TouchableOpacity onPress={handleUnarchive} disabled={transitioning} style={styles.actionBtnPrimary} activeOpacity={0.85}>
                  <Archive size={20} color="#FFFFFF" strokeWidth={2} />
                  <Text style={styles.actionBtnPrimaryText}>Разархивировать</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* ===== КОНТРОЛЬНЫЕ ТОЧКИ ===== */}
          {((task.checkpoints || []).length > 0 || (isCreator && task.status_new !== 'archived')) && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>КОНТРОЛЬНЫЕ ТОЧКИ</Text>
                <View style={styles.sectionBadge}>
                  <Text style={styles.sectionBadgeText}>{(task.checkpoints || []).length}</Text>
                </View>
              </View>
              {(task.checkpoints || []).map((cp) => {
                const done = cp.status === 'completed';
                const missed = cp.status === 'missed';
                const late = !done && !missed && new Date(cp.deadline) < new Date();
                const canMark = (isCreator || isWatcher) && task.status_new !== 'archived';
                return (
                  <View key={cp.id} style={styles.checkpointRow}>
                    <TouchableOpacity
                      disabled={!canMark}
                      onPress={() => setCheckpointStatus(cp.id, done ? 'pending' : 'completed')}
                      style={[styles.checkpointBox, done && styles.checkpointBoxDone, missed && styles.checkpointBoxMissed]}
                      accessibilityLabel={done ? 'Отметить как невыполненную' : 'Отметить выполненной'}
                    >
                      {done && <CheckCircle2 size={16} color="#FFFFFF" strokeWidth={2.5} />}
                      {missed && <XCircle size={16} color="#FFFFFF" strokeWidth={2.5} />}
                    </TouchableOpacity>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.checkpointTitle, done && styles.checkpointTitleDone]}>{cp.title}</Text>
                      <Text style={[styles.checkpointDate, late && { color: '#B91C1C' }]}>
                        {formatShortDate(cp.deadline)}
                        {done && cp.completed_by_name ? ` · отметил ${cp.completed_by_name}` : ''}
                        {missed ? ' · не выполнена' : late ? ' · срок прошёл' : ''}
                      </Text>
                    </View>
                    {canMark && !done && !missed && (
                      <TouchableOpacity onPress={() => setCheckpointStatus(cp.id, 'missed')} style={styles.checkpointAction}>
                        <Text style={styles.checkpointActionText}>Не выполнена</Text>
                      </TouchableOpacity>
                    )}
                    {isCreator && task.status_new !== 'archived' && (
                      <TouchableOpacity onPress={() => removeCheckpoint(cp.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Trash2 size={16} color="#BDBDBD" strokeWidth={2} />
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
              {isCreator && task.status_new !== 'archived' && (
                <View style={styles.checkpointAdd}>
                  <TextInput
                    style={styles.checkpointInput}
                    value={newCheckpointTitle}
                    onChangeText={setNewCheckpointTitle}
                    placeholder="Новая контрольная точка"
                    placeholderTextColor="#BDBDBD"
                  />
                  <TouchableOpacity onPress={() => setShowCheckpointPicker(true)} style={styles.checkpointDateBtn}>
                    <CalendarDays size={16} color="#1F7A52" strokeWidth={2} />
                    <Text style={styles.checkpointDateBtnText}>
                      {newCheckpointDate ? formatShortDate(newCheckpointDate.toISOString()) : 'Дата'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={addCheckpoint} style={styles.checkpointAddBtn} accessibilityLabel="Добавить контрольную точку">
                    <Plus size={18} color="#FFFFFF" strokeWidth={2.5} />
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          {/* ===== КОММЕНТАРИИ ИСПОЛНИТЕЛЯ И НАБЛЮДАТЕЛЯ ===== */}
          {(['executor_comment', 'watcher_comment'] as const).map((field) => {
            const canEdit =
              task.status_new !== 'archived' &&
              (isCreator || (field === 'executor_comment' ? isAssignee : isWatcher));
            const value = (task as any)[field] as string | null;
            if (!value && !canEdit) return null;
            const title = field === 'executor_comment' ? 'КОММЕНТАРИЙ ИСПОЛНИТЕЛЯ' : 'КОММЕНТАРИЙ НАБЛЮДАТЕЛЯ';
            return (
              <View key={field} style={styles.section}>
                <Text style={styles.sectionTitle}>{title}</Text>
                {roleCommentField === field ? (
                  <View style={styles.roleCommentCard}>
                    <TextInput
                      style={styles.roleCommentInput}
                      value={roleCommentText}
                      onChangeText={setRoleCommentText}
                      placeholder={field === 'executor_comment' ? 'Что сделано, результат, проблемы…' : 'Замечания по выполнению…'}
                      placeholderTextColor="#BDBDBD"
                      multiline
                      autoFocus
                    />
                    <View style={styles.dualActions}>
                      <TouchableOpacity onPress={() => setRoleCommentField(null)} style={styles.roleCommentCancel}>
                        <Text style={styles.roleCommentCancelText}>Отмена</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={saveRoleComment} style={styles.roleCommentSave}>
                        <Text style={styles.actionBtnHalfText}>Сохранить</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.roleCommentCard}
                    disabled={!canEdit}
                    onPress={() => startRoleComment(field)}
                    activeOpacity={0.7}
                  >
                    <Text style={value ? styles.roleCommentText : styles.roleCommentPlaceholder}>
                      {value || 'Нажмите, чтобы написать'}
                    </Text>
                    {canEdit && <Pencil size={14} color="#BDBDBD" strokeWidth={2} />}
                  </TouchableOpacity>
                )}
              </View>
            );
          })}

          {/* ===== ФАЙЛЫ ===== */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>ВЛОЖЕНИЯ</Text>
              <View style={styles.sectionBadge}>
                <Text style={styles.sectionBadgeText}>
                  {(task.files || []).length}
                </Text>
              </View>
            </View>

            {(task.files || []).length === 0 ? (
              <View style={styles.emptyCard}>
                <Paperclip size={28} color="#BDBDBD" strokeWidth={1.5} />
                <Text style={styles.emptyTitle}>Файлы не прикреплены</Text>
                <Text style={styles.emptySubtitle}>
                  Добавьте документы, изображения или отчёты
                </Text>
              </View>
            ) : (
              (task.files || []).map((file: any) => {
                const isOwnFile = file.uploaded_by === currentUser?.id;
                const isTaskCreator = task.creator_id === currentUser?.id;
                const fileIconData = getFileIconData(file.mime_type, file.file_name);
                const FileIcon = fileIconData.icon;
                return (
                  <TouchableOpacity
                    key={file.id}
                    onPress={() => handleOpenFile(file.file_url)}
                    activeOpacity={0.7}
                    style={styles.fileCard}
                  >
                    <View
                      style={[
                        styles.fileIconWrap,
                        { backgroundColor: fileIconData.bg },
                      ]}
                    >
                      <FileIcon size={24} color={fileIconData.color} strokeWidth={2} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.fileName} numberOfLines={1}>
                        {file.file_name || 'Без имени'}
                      </Text>
                      <Text style={styles.fileMeta}>
                        {formatFileSize(file.file_size)} · {formatDate(file.uploaded_at, false)}
                      </Text>
                    </View>
                    {(isOwnFile || isTaskCreator) && (
                      <TouchableOpacity
                        onPress={() => handleDeleteFile(file.id, file.file_name)}
                        style={styles.fileDeleteBtn}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      >
                        <Trash2 size={16} color="#DC2626" strokeWidth={2} />
                      </TouchableOpacity>
                    )}
                  </TouchableOpacity>
                );
              })
            )}

            <TouchableOpacity
              onPress={handlePickFile}
              disabled={uploadingFile}
              style={styles.attachBtn}
              activeOpacity={0.7}
            >
              {uploadingFile ? (
                <ActivityIndicator size="small" color="#1F7A52" />
              ) : (
                <Plus size={18} color="#1F7A52" strokeWidth={2.5} />
              )}
              <Text style={styles.attachBtnText}>
                {uploadingFile ? 'Загрузка...' : 'Прикрепить файл'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* ===== ИСТОРИЯ ПЕРЕХОДОВ ===== */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>ИСТОРИЯ</Text>
              <View style={styles.sectionBadge}>
                <Text style={styles.sectionBadgeText}>{history.length}</Text>
              </View>
            </View>

            {history.length === 0 ? (
              <View style={styles.emptyCard}>
                <History size={28} color="#BDBDBD" strokeWidth={1.5} />
                <Text style={styles.emptyTitle}>История пуста</Text>
              </View>
            ) : (
              <View style={styles.timeline}>
                {history.map((item, idx) => {
                  const fromConf = item.from_status
                    ? STATUS_CONFIG[item.from_status]
                    : null;
                  const FromIcon = fromConf?.icon;
                  const toConf = STATUS_CONFIG[item.to_status];
                  const ToIcon = toConf.icon;
                  const isLast = idx === history.length - 1;
                  return (
                    <View key={item.id} style={styles.timelineItem}>
                      {/* Вертикальная линия */}
                      <View style={styles.timelineLeft}>
                        <View
                          style={[
                            styles.timelineDot,
                            { backgroundColor: toConf.bg },
                          ]}
                        >
                          <ToIcon size={12} color={toConf.text} strokeWidth={2.5} />
                        </View>
                        {!isLast && <View style={styles.timelineLine} />}
                      </View>

                      <View style={styles.timelineContent}>
                        <View style={styles.timelineHeader}>
                          <View style={styles.timelineAvatarWrap}>
                            <View
                              style={[
                                styles.timelineAvatar,
                                { backgroundColor: getAvatarColor(item.changed_by) },
                              ]}
                            >
                              <Text style={styles.timelineAvatarText}>
                                {getInitials(item.changed_by_name)}
                              </Text>
                            </View>
                            <Text style={styles.timelineUser} numberOfLines={1}>
                              {item.changed_by_name}
                            </Text>
                          </View>
                          <Text style={styles.timelineDate} numberOfLines={1}>
                            {formatShortDate(item.created_at)}
                          </Text>
                        </View>

                        {item.from_status === item.to_status ? null : (
                        <View style={styles.timelineTransition}>
                          {fromConf ? (
                            <View
                              style={[
                                styles.timelineStatusPill,
                                { backgroundColor: fromConf.bg },
                              ]}
                            >
                              {FromIcon && (
                                <FromIcon
                                  size={12}
                                  color={fromConf.text}
                                  strokeWidth={2}
                                />
                              )}
                              <Text
                                style={[
                                  styles.timelineStatusText,
                                  { color: fromConf.text },
                                ]}
                              >
                                {fromConf.label}
                              </Text>
                            </View>
                          ) : (
                            <View
                              style={[
                                styles.timelineStatusPill,
                                { backgroundColor: '#ECFDF5' },
                              ]}
                            >
                              <Sparkles size={12} color="#1F7A52" strokeWidth={2} />
                              <Text style={[styles.timelineStatusText, { color: '#1F7A52' }]}>
                                Создана
                              </Text>
                            </View>
                          )}
                          <ArrowRight size={14} color="#BDBDBD" strokeWidth={2} />
                          <View
                            style={[
                              styles.timelineStatusPill,
                              { backgroundColor: toConf.bg },
                            ]}
                          >
                            <ToIcon size={12} color={toConf.text} strokeWidth={2} />
                            <Text
                              style={[styles.timelineStatusText, { color: toConf.text }]}
                            >
                              {toConf.label}
                            </Text>
                          </View>
                        </View>
                        )}

                        {item.comment && (
                          <View style={styles.timelineComment}>
                            <MessageCircle
                              size={12}
                              color="#6F6F73"
                              strokeWidth={2}
                            />
                            <Text style={styles.timelineCommentText}>
                              {item.comment}
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </View>

          {/* ===== КОММЕНТАРИИ ===== */}
          <View style={[styles.section, { marginBottom: 20 }]}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>ОБСУЖДЕНИЕ</Text>
              <View style={styles.sectionBadge}>
                <Text style={styles.sectionBadgeText}>{comments.length}</Text>
              </View>
            </View>

            {comments.length === 0 ? (
              <View style={styles.emptyCard}>
                <MessageCircle size={28} color="#BDBDBD" strokeWidth={1.5} />
                <Text style={styles.emptyTitle}>Пока нет комментариев</Text>
                <Text style={styles.emptySubtitle}>
                  Начните обсуждение задачи
                </Text>
              </View>
            ) : (
              comments.map((comment) => {
                const isOwn = comment.author_id === currentUser?.id;
                const isCommentCreator = comment.author_id === task.creator_id;
                const isCommentAssignee = task.assignees?.some(
                  (a: any) => a.id === comment.author_id,
                );

                let roleColor = '#6B7280';
                let roleLabel = '';
                let roleBg = '#F3F4F6';
                if (isCommentCreator) {
                  roleColor = '#1F7A52';
                  roleLabel = 'Создатель';
                  roleBg = '#ECFDF5';
                } else if (isCommentAssignee) {
                  roleColor = '#3B82F6';
                  roleLabel = 'Исполнитель';
                  roleBg = '#DBEAFE';
                }

                return (
                  <View key={comment.id} style={styles.commentCard}>
                    <View style={styles.commentHeader}>
                      <View
                        style={[
                          styles.commentAvatar,
                          { backgroundColor: getAvatarColor(comment.author_id) },
                        ]}
                      >
                        <Text style={styles.commentAvatarText}>
                          {getInitials(comment.display_name)}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={styles.commentNameRow}>
                          <Text style={styles.commentAuthor}>
                            {comment.display_name}
                          </Text>
                          {roleLabel && (
                            <View
                              style={[styles.roleBadge, { backgroundColor: roleBg }]}
                            >
                              <Text style={[styles.roleBadgeText, { color: roleColor }]}>
                                {roleLabel}
                              </Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.commentDate}>
                          {formatDate(comment.created_at)}
                        </Text>
                      </View>
                      {isOwn && editingCommentId !== comment.id && (
                        <View style={styles.commentMenu}>
                          <TouchableOpacity
                            onPress={() => handleEditComment(comment)}
                            style={styles.commentMenuBtn}
                          >
                            <Pencil size={14} color="#6F6F73" strokeWidth={2} />
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => handleDeleteComment(comment.id)}
                            style={styles.commentMenuBtn}
                          >
                            <Trash2 size={14} color="#DC2626" strokeWidth={2} />
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>

                    {editingCommentId === comment.id ? (
                      <View style={styles.editWrap}>
                        <TextInput
                          style={styles.editInput}
                          value={editingText}
                          onChangeText={setEditingText}
                          multiline
                          autoFocus
                        />
                        <View style={styles.editButtons}>
                          <TouchableOpacity
                            onPress={() => {
                              setEditingCommentId(null);
                              setEditingText('');
                            }}
                            style={styles.editBtnCancel}
                          >
                            <Text style={styles.editBtnCancelText}>Отмена</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={handleSaveEdit}
                            style={styles.editBtnSave}
                          >
                            <Text style={styles.editBtnSaveText}>Сохранить</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    ) : (
                      <Text style={styles.commentText}>{comment.content}</Text>
                    )}
                  </View>
                );
              })
            )}
          </View>

          <View style={{ height: 20 }} />
        </ScrollView>

        {/* ===== INPUT BAR (комментарии) ===== */}
        <View style={styles.inputBar}>
          <TextInput
            style={styles.commentInput}
            value={newComment}
            onChangeText={setNewComment}
            placeholder="Напишите комментарий..."
            placeholderTextColor="#BDBDBD"
            multiline
            maxLength={2000}
          />
          <TouchableOpacity
            onPress={handleSendComment}
            disabled={!newComment.trim() || sendingComment}
            style={[
              styles.sendBtn,
              {
                backgroundColor: newComment.trim() ? '#1F7A52' : '#ECECE8',
              },
            ]}
            activeOpacity={0.85}
          >
            {sendingComment ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <SendHorizonal size={18} color="#FFFFFF" strokeWidth={2.5} />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* ===== СПИСОК ИСПОЛНИТЕЛЕЙ (bottom-sheet) ===== */}
      <Modal visible={!!peopleModal} transparent animationType="slide" onRequestClose={() => setPeopleModal(null)}>
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setPeopleModal(null)}
          style={assigneeStyles.overlay}
        >
          <View style={assigneeStyles.sheet}>
            <View style={assigneeStyles.handle} />
            <Text style={assigneeStyles.title}>{peopleModal === 'watchers' ? 'НАБЛЮДАТЕЛИ' : 'ИСПОЛНИТЕЛИ'}</Text>
            <ScrollView style={{ maxHeight: 420 }}>
              {peopleModal === 'watchers' && !(task.watchers || []).length && (
                <Text style={assigneeStyles.username}>Отдельных наблюдателей нет — за задачей следит создатель.</Text>
              )}
              {((peopleModal === 'watchers' ? task.watchers : task.assignees) || []).map((a: any) => (
                <TouchableOpacity
                  key={a.id}
                  style={assigneeStyles.row}
                  activeOpacity={0.7}
                  onPress={() => {
                    setPeopleModal(null);
                    navigation.navigate('UserProfile', { userId: a.id });
                  }}
                >
                  <View style={[assigneeStyles.avatar, { backgroundColor: getAvatarColor(a.id) }]}>
                    <Text style={assigneeStyles.avatarText}>{getInitials(a.display_name)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={assigneeStyles.name}>{a.display_name || a.username}</Text>
                    <Text style={assigneeStyles.username}>@{a.username}</Text>
                  </View>
                  <ChevronRight size={18} color="#BDBDBD" strokeWidth={2} />
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ===== МЕНЮ СОЗДАТЕЛЯ ===== */}
      <Modal visible={showMenu} transparent animationType="fade" onRequestClose={() => setShowMenu(false)}>
        <TouchableOpacity activeOpacity={1} onPress={() => setShowMenu(false)} style={assigneeStyles.overlay}>
          <View style={assigneeStyles.sheet}>
            <View style={assigneeStyles.handle} />
            <TouchableOpacity style={assigneeStyles.row} onPress={handleEdit} activeOpacity={0.7}>
              <Pencil size={20} color="#1F7A52" strokeWidth={2} />
              <Text style={assigneeStyles.name}>Редактировать задачу</Text>
            </TouchableOpacity>
            <TouchableOpacity style={assigneeStyles.row} onPress={handleDelete} activeOpacity={0.7}>
              <Trash2 size={20} color="#DC2626" strokeWidth={2} />
              <Text style={[assigneeStyles.name, { color: '#DC2626' }]}>Удалить (в архив)</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <DateTimePickerModal
        visible={showCheckpointPicker}
        initialDate={newCheckpointDate}
        minDate={new Date()}
        title="Срок контрольной точки"
        onClose={() => setShowCheckpointPicker(false)}
        onSave={(d: Date) => {
          setNewCheckpointDate(d);
          setShowCheckpointPicker(false);
        }}
      />

      {/* ===== МОДАЛКА ОТКЛОНЕНИЯ ===== */}
      <Modal visible={showRejectModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <XCircle size={24} color="#DC2626" strokeWidth={2} />
              <Text style={styles.modalTitle}>{commentTarget?.action || 'Отклонить задачу'}</Text>
            </View>
            <Text style={styles.modalSubtitle}>
              {commentTarget?.to === 'rejected' || !commentTarget
                ? 'Укажите причину отклонения. Исполнитель увидит этот комментарий.'
                : commentTarget.required
                  ? 'Напишите, что нужно доработать. Комментарий попадёт в историю задачи.'
                  : 'Комментарий необязателен и попадёт в историю задачи.'}
            </Text>
            <TextInput
              style={styles.rejectInput}
              value={rejectComment}
              onChangeText={setRejectComment}
              placeholder="Например: Не соответствует ТЗ, нужно переделать..."
              placeholderTextColor="#BDBDBD"
              multiline
              numberOfLines={4}
              autoFocus
              textAlignVertical="top"
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                onPress={() => {
                  setShowRejectModal(false);
                  setRejectComment('');
                  setCommentTarget(null);
                }}
                style={styles.modalBtnCancel}
                activeOpacity={0.7}
              >
                <Text style={styles.modalBtnCancelText}>Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={submitReject}
                disabled={transitioning || (commentTarget?.required !== false && !rejectComment.trim())}
                style={[
                  styles.modalBtnReject,
                  {
                    backgroundColor:
                      commentTarget?.required === false || rejectComment.trim()
                        ? commentTarget && commentTarget.to !== 'rejected'
                          ? '#1F7A52'
                          : '#7F1D1D'
                        : '#ECECE8',
                  },
                ]}
                activeOpacity={0.85}
              >
                <Text style={styles.modalBtnRejectText}>
                  {transitioning ? 'Сохраняем…' : commentTarget?.action || 'Отклонить'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  statusCard: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 16, gap: 14 },
  hintBox: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  hintText: { fontSize: 14, fontWeight: '600', lineHeight: 19 },
  transitionList: { gap: 8 },
  transitionBtn: { height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  transitionBtnNeutral: { backgroundColor: '#FFFFFF', borderColor: '#E5E7EB' },
  transitionText: { fontSize: 15, fontWeight: '700' },
  overdueBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: 10, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: '#FEE2E2' },
  overdueText: { fontSize: 12, fontWeight: '700', color: '#B91C1C' },
  myRolesRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 10 },
  myRolesLabel: { fontSize: 12, color: '#6F6F73', fontWeight: '600' },
  myRoleChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: '#F3F4F6' },
  myRoleText: { fontSize: 12, fontWeight: '600', color: '#141414' },
  checkpointRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FFFFFF', borderRadius: 14, padding: 12, marginBottom: 8 },
  checkpointBox: { width: 26, height: 26, borderRadius: 8, borderWidth: 2, borderColor: '#D1D5DB', alignItems: 'center', justifyContent: 'center' },
  checkpointBoxDone: { backgroundColor: '#1F7A52', borderColor: '#1F7A52' },
  checkpointBoxMissed: { backgroundColor: '#B91C1C', borderColor: '#B91C1C' },
  checkpointTitle: { fontSize: 14, fontWeight: '600', color: '#141414' },
  checkpointTitleDone: { textDecorationLine: 'line-through', color: '#6F6F73' },
  checkpointDate: { fontSize: 12, color: '#6F6F73', marginTop: 2 },
  checkpointAction: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: '#FEF2F2' },
  checkpointActionText: { fontSize: 11, fontWeight: '700', color: '#B91C1C' },
  checkpointAdd: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  checkpointInput: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#141414' },
  checkpointDateBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 10, borderRadius: 12, backgroundColor: '#ECFDF5' },
  checkpointDateBtnText: { fontSize: 12, fontWeight: '600', color: '#1F7A52' },
  checkpointAddBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#1F7A52', alignItems: 'center', justifyContent: 'center' },
  roleCommentCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: '#FFFFFF', borderRadius: 14, padding: 14, flexWrap: 'wrap' },
  roleCommentText: { flex: 1, fontSize: 14, color: '#141414', lineHeight: 20 },
  roleCommentPlaceholder: { flex: 1, fontSize: 14, color: '#BDBDBD', fontStyle: 'italic' },
  roleCommentInput: { width: '100%', minHeight: 80, fontSize: 14, color: '#141414', textAlignVertical: 'top' },
  roleCommentCancel: { flex: 1, paddingVertical: 10, borderRadius: 12, backgroundColor: '#F3F4F6', alignItems: 'center' },
  roleCommentCancelText: { fontSize: 14, fontWeight: '600', color: '#6F6F73' },
  roleCommentSave: { flex: 1, paddingVertical: 10, borderRadius: 12, backgroundColor: '#1F7A52', alignItems: 'center' },
  container: { flex: 1, backgroundColor: '#FAFAF8' },

  // ===== LOADING =====
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 14,
    color: '#6F6F73',
    marginTop: 12,
    fontWeight: '500',
  },

  // ===== HEADER =====
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#FAFAF8',
    borderBottomWidth: 1,
    borderBottomColor: '#ECECE8',
  },
  headerBackBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  headerCenter: {
    alignItems: 'center',
  },
  headerLabel: {
    fontFamily: Platform.OS === 'ios' ? 'Bebas Neue' : 'sans-serif-condensed',
    fontSize: 20,
    fontWeight: '900',
    color: '#141414',
    letterSpacing: 1.5,
  },

  // ===== SCROLL =====
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
    gap: 20,
  },

  // ===== HERO CARD =====
  heroCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 16,
    elevation: 3,
    gap: 16,
  },
  heroBadges: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  importanceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  importanceBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  heroTitle: {
    fontFamily: Platform.OS === 'ios' ? 'Bebas Neue' : 'sans-serif-condensed',
    fontSize: 40,
    fontWeight: '900',
    color: '#141414',
    letterSpacing: -0.5,
    lineHeight: 44,
  },
  heroDescription: {
    fontSize: 15,
    color: '#141414',
    lineHeight: 22,
    fontWeight: '500',
  },
  heroDescriptionMuted: {
    fontSize: 14,
    color: '#BDBDBD',
    fontStyle: 'italic',
  },

  // ===== INFO GRID 2×2 =====
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  infoCard: {
    flex: 1,
    minWidth: '46%',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 12,
    elevation: 2,
    gap: 10,
  },
  infoIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6F6F73',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#141414',
  },
  infoValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  infoValueMuted: {
    fontSize: 14,
    color: '#BDBDBD',
    fontWeight: '600',
  },
  assigneesAvatars: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  miniAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  miniAvatarText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  miniAvatarMore: {
    backgroundColor: '#ECECE8',
  },
  miniAvatarMoreText: {
    fontSize: 9,
    fontWeight: '600',
    color: '#6F6F73',
  },

  // ===== REVIEW DEADLINE =====
  reviewDeadlineCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    backgroundColor: '#FEF3C7',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  reviewDeadlineLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#92400E',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  reviewDeadlineValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#92400E',
    marginTop: 2,
  },

  // ===== SECTIONS =====
  section: {
    gap: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    fontFamily: Platform.OS === 'ios' ? 'Bebas Neue' : 'sans-serif-condensed',
    fontSize: 22,
    fontWeight: '900',
    color: '#141414',
    letterSpacing: 1,
  },
  sectionBadge: {
    backgroundColor: '#ECECE8',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  sectionBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6F6F73',
  },

  // ===== EMPTY CARD =====
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 32,
    alignItems: 'center',
    gap: 8,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#141414',
    marginTop: 4,
  },
  emptySubtitle: {
    fontSize: 12,
    color: '#6F6F73',
    textAlign: 'center',
  },

  // ===== ACTIONS =====
  actionBtnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#1F7A52',
    paddingVertical: 16,
    borderRadius: 18,
    shadowColor: '#1F7A52',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 4,
  },
  actionBtnPrimaryText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  dualActions: {
    flexDirection: 'row',
    gap: 10,
  },
  actionBtnHalfAccept: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#1F7A52',
    paddingVertical: 16,
    borderRadius: 18,
  },
  actionBtnHalfReject: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#7F1D1D',
    paddingVertical: 16,
    borderRadius: 18,
  },
  actionBtnHalfText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  actionBtnGhost: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#FFFFFF',
    paddingVertical: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#ECECE8',
  },
  actionBtnGhostText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#6F6F73',
  },
  noActionsBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#FFFFFF',
    padding: 20,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#ECECE8',
  },
  noActionsText: {
    fontSize: 13,
    color: '#BDBDBD',
    fontWeight: '500',
    textAlign: 'center',
    flex: 1,
  },

  // ===== ARCHIVE CARD =====
  archiveCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#FFFFFF',
    padding: 18,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#ECECE8',
  },
  archiveIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  archiveTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#141414',
    marginBottom: 2,
  },
  archiveSubtitle: {
    fontSize: 12,
    color: '#6F6F73',
    fontWeight: '500',
  },

  // ===== FILES =====
  fileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 12,
    elevation: 2,
  },
  fileIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#141414',
    marginBottom: 2,
  },
  fileMeta: {
    fontSize: 12,
    color: '#6F6F73',
    fontWeight: '500',
  },
  fileDeleteBtn: {
    padding: 8,
  },
  attachBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: '#ECFDF5',
    borderWidth: 1.5,
    borderColor: '#D1FAE5',
    borderStyle: 'dashed',
  },
  attachBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F7A52',
  },

  // ===== TIMELINE =====
  timeline: {
    gap: 0,
  },
  timelineItem: {
    flexDirection: 'row',
    gap: 12,
  },
  timelineLeft: {
    width: 32,
    alignItems: 'center',
  },
  timelineDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineLine: {
    width: 2,
    flex: 1,
    backgroundColor: '#ECECE8',
    marginVertical: 4,
    minHeight: 20,
  },
  timelineContent: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  timelineHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  timelineAvatarWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  timelineAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineAvatarText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  timelineUser: {
    fontSize: 13,
    fontWeight: '600',
    color: '#141414',
    flexShrink: 1,
  },
  timelineDate: {
    fontSize: 11,
    color: '#6F6F73',
    fontWeight: '500',
    flexShrink: 0,
  },
  timelineTransition: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  timelineStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  timelineStatusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  timelineComment: {
    flexDirection: 'row',
    gap: 8,
    padding: 10,
    backgroundColor: '#FAFAF8',
    borderRadius: 10,
    alignItems: 'flex-start',
  },
  timelineCommentText: {
    fontSize: 13,
    color: '#141414',
    lineHeight: 18,
    flex: 1,
    fontWeight: '500',
  },

  // ===== COMMENTS =====
  commentCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 12,
    elevation: 2,
    marginBottom: 10,
  },
  commentHeader: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  commentAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  commentAvatarText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  commentNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  commentAuthor: {
    fontSize: 14,
    fontWeight: '700',
    color: '#141414',
  },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  roleBadgeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  commentDate: {
    fontSize: 11,
    color: '#6F6F73',
    marginTop: 2,
    fontWeight: '500',
  },
  commentMenu: {
    flexDirection: 'row',
    gap: 4,
  },
  commentMenuBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  commentText: {
    fontSize: 14,
    color: '#141414',
    lineHeight: 20,
    fontWeight: '500',
    paddingLeft: 46,
  },
  editWrap: {
    gap: 8,
  },
  editInput: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#FAFAF8',
    borderWidth: 1,
    borderColor: '#ECECE8',
    fontSize: 14,
    minHeight: 80,
    color: '#141414',
    textAlignVertical: 'top',
  },
  editButtons: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'flex-end',
  },
  editBtnCancel: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
  },
  editBtnCancelText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6F6F73',
  },
  editBtnSave: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#1F7A52',
  },
  editBtnSaveText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },

  // ===== INPUT BAR =====
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    padding: 12,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#ECECE8',
  },
  commentInput: {
    flex: 1,
    backgroundColor: '#FAFAF8',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    color: '#141414',
    maxHeight: 100,
    borderWidth: 1,
    borderColor: '#ECECE8',
    fontWeight: '500',
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ===== REJECT MODAL =====
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    paddingBottom: 32,
    gap: 16,
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#ECECE8',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 4,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  modalTitle: {
    fontFamily: Platform.OS === 'ios' ? 'Bebas Neue' : 'sans-serif-condensed',
    fontSize: 26,
    fontWeight: '900',
    color: '#141414',
    letterSpacing: 0.5,
  },
  modalSubtitle: {
    fontSize: 13,
    color: '#6F6F73',
    lineHeight: 18,
    fontWeight: '500',
  },
  rejectInput: {
    padding: 14,
    borderRadius: 14,
    backgroundColor: '#FAFAF8',
    borderWidth: 1,
    borderColor: '#ECECE8',
    fontSize: 14,
    minHeight: 100,
    color: '#141414',
    fontWeight: '500',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  modalBtnCancel: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
  },
  modalBtnCancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#141414',
  },
  modalBtnReject: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
  },
  modalBtnRejectText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});

const assigneeStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 20,
    paddingBottom: 32,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: '#ECECE8',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 12,
  },
  title: {
    fontFamily: Platform.OS === 'ios' ? 'Bebas Neue' : 'sans-serif-condensed',
    fontSize: 22,
    fontWeight: '900',
    color: '#141414',
    letterSpacing: 1,
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F4F4F5',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  name: { fontSize: 15, fontWeight: '700', color: '#141414' },
  username: { fontSize: 12, color: '#6F6F73', marginTop: 1 },
});