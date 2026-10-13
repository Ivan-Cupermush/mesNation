import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TextInput,
  Alert,
  ActivityIndicator,
  FlatList,
} from 'react-native';
import Modal from '../../components/ui/AppModal';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePickerModal from '../../components/DateTimePickerModal';
import {
  ChevronLeft,
  Check,
  Type,
  Flag,
  CalendarDays,
  Clock,
  Users,
  Eye,
  Paperclip,
  Plus,
  X,
  ChevronRight,
  HandHeart,
  ListTodo
} from 'lucide-react-native';
import AssigneeSheet from '../../components/tasks/AssigneeSheet';
import type { TaskKind } from '../../components/tasks/kind';
import { showToast, showError } from '../../components/ui/toast';
import { withAlpha } from '../../theme/palettes';
import { api } from '../../services/api';
import { pick, types, isErrorWithCode, errorCodes } from '@react-native-documents/picker';

import { T, themed } from '../../theme/runtime';
import SafeBottom from '../../components/ui/SafeBottom';
interface User {
  id: number;
  username: string;
  display_name: string;
  avatar_url?: string | null;
  role_name?: string;
  relation?: 'self' | 'subordinate' | 'colleague';
  same_role?: boolean;
  can_task?: boolean;
  can_request?: boolean;
}

interface DraftCheckpoint {
  id?: number;
  title: string;
  deadline: Date;
}

interface PickedFile {
  uri: string;
  name: string;
  type: string | null;
  size: number | null;
}

export default function CreateTaskScreen({ navigation, route }: any) {
  // Если передан taskId — экран работает как редактор существующей задачи.
  const editTaskId: number | undefined = route?.params?.taskId;
  const isEdit = !!editTaskId;
  // «Создать задачу» из сообщения чата: название и описание уже заполнены.
  const prefillFrom: { title?: string; description?: string } | undefined = route?.params?.prefill;
  // Задача или запрос: выбрали по «+»; у сохранённой — её тип (подставится при загрузке).
  const [kind, setKindState] = useState<TaskKind>(route?.params?.kind === 'request' ? 'request' : 'task');
  const request = kind === 'request';
  const [myRole, setMyRole] = useState<string | null>(null);
  const [title, setTitle] = useState(prefillFrom?.title || '');
  const [description, setDescription] = useState(prefillFrom?.description || '');
  const [importance, setImportance] = useState<'green' | 'yellow' | 'red'>('yellow');
  const [executorDeadline, setExecutorDeadline] = useState<Date | null>(null);
  const [reviewerDeadline, setReviewerDeadline] = useState<Date | null>(null);
  const [selectedAssignees, setSelectedAssignees] = useState<User[]>([]);
  const [selectedWatchers, setSelectedWatchers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);

  const [showAssigneesModal, setShowAssigneesModal] = useState(false);
  const [showWatchersModal, setShowWatchersModal] = useState(false);
  const [showExecutorDatePicker, setShowExecutorDatePicker] = useState(false);
  const [showReviewerDatePicker, setShowReviewerDatePicker] = useState(false);

  const [availableUsers, setAvailableUsers] = useState<User[]>([]);
  const [watcherCandidates, setWatcherCandidates] = useState<User[]>([]);
  const [meId, setMeId] = useState<number | null>(null);
  const [checkpoints, setCheckpoints] = useState<DraftCheckpoint[]>([]);
  const [newCpTitle, setNewCpTitle] = useState('');
  const [showCpPicker, setShowCpPicker] = useState(false);
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [prefilling, setPrefilling] = useState(isEdit);
  // Уход с экрана с несохранёнными данными — спрашиваем (раньше форма терялась молча).
  const savedRef = React.useRef(false);
  const initialRef = React.useRef('');
  const snapshot = JSON.stringify([title, description, importance, executorDeadline, reviewerDeadline, selectedAssignees.map((u) => u.id), selectedWatchers.map((u) => u.id), checkpoints.length, files.length]);
  const snapshotRef = React.useRef(snapshot);
  snapshotRef.current = snapshot;
  const kindRef = React.useRef(kind);
  kindRef.current = kind;
  useEffect(() => {
    if (!prefilling) initialRef.current = snapshotRef.current;
  }, [prefilling]);
  useEffect(
    () =>
      navigation.addListener('beforeRemove', (e: any) => {
        if (savedRef.current || prefilling || snapshotRef.current === initialRef.current) return;
        e.preventDefault();
        Alert.alert(isEdit ? 'Отменить изменения?' : kindRef.current === 'request' ? 'Не отправлять запрос?' : 'Отменить создание задачи?', 'Введённые данные не сохранятся.', [
          { text: 'Остаться', style: 'cancel' },
          { text: 'Выйти', style: 'destructive', onPress: () => navigation.dispatch(e.data.action) },
        ]);
      }),
    [navigation, isEdit, prefilling],
  );

  useEffect(() => {
    loadUsers();
    if (editTaskId) prefill(editTaskId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadUsers = async () => {
    try {
      // Сервер сам считает, кому можно ставить задачи: себе, вниз по дереву
      // и коллегам своего уровня. Раньше список брался по устаревшему полю
      // и без самого пользователя, поэтому подчинённые иногда не отображались.
      const [assignable, all, me] = await Promise.all([api.getAssignableUsers(), api.getUsers(), api.getCurrentUser()]);
      setAvailableUsers(assignable);
      // Наблюдателем можно назначить любого активного сотрудника.
      setWatcherCandidates(all.map((u) => ({ id: u.id, username: u.username, display_name: u.display_name || u.username, avatar_url: u.avatar_url })));
      setMeId(me.id);
      setMyRole(me.role_name || null);
    } catch (e: any) {
      showError(e?.message || '', 'Не удалось загрузить сотрудников');
    }
  };

  const prefill = async (id: number) => {
    try {
      const task = await api.getTask(id);
      setKindState(task.kind === 'request' ? 'request' : 'task');
      setTitle(task.title);
      setDescription(task.description || '');
      setImportance(task.importance || 'yellow');
      const ex = task.executor_deadline || task.hard_deadline;
      setExecutorDeadline(ex ? new Date(ex) : null);
      setReviewerDeadline(task.reviewer_deadline ? new Date(task.reviewer_deadline) : null);
      setSelectedAssignees((task.assignees || []) as User[]);
      setSelectedWatchers((task.watchers || []) as User[]);
    } catch (e: any) {
      showError(e?.message || '', 'Не удалось загрузить задачу');
      navigation.goBack();
    } finally {
      setPrefilling(false);
    }
  };

  const pickFiles = async () => {
    try {
      const picked = await pick({ type: [types.allFiles], allowMultiSelection: true });
      setFiles((prev) => [
        ...prev,
        ...picked.filter((f) => f.uri).map((f) => ({ uri: f.uri, name: f.name || 'file', type: f.type ?? null, size: f.size ?? null })),
      ]);
    } catch (e: any) {
      if (!(isErrorWithCode(e) && e.code === errorCodes.OPERATION_CANCELED)) {
        showError('Не удалось выбрать файл', 'Ошибка');
      }
    }
  };

  const shortDate = (d: Date) =>
    d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) +
    ' ' +
    d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

  const formatDate = (d: Date | null) => {
    if (!d) return 'Не выбран';
    return d.toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  /** Сменить тип при создании: задачу коллегам поставить нельзя — их убираем. */
  const setKind = (next: TaskKind) => {
    if (next === kind || isEdit) return;
    if (next === 'task') {
      const removed = selectedAssignees.filter((u) => availableUsers.find((a) => a.id === u.id)?.can_task === false);
      if (removed.length) {
        setSelectedAssignees((prev) => prev.filter((u) => !removed.some((r) => r.id === u.id)));
        showToast(`Коллегам задачу поставить нельзя — убрали: ${removed.map((u) => u.display_name || u.username).join(', ')}`);
      }
    }
    setKindState(next);
  };

  const handleCreate = async () => {
    if (!title.trim()) {
      Alert.alert(request ? 'О чём просите?' : 'Ошибка', request ? 'Напишите, о чём просите коллегу' : 'Введите название задачи');
      return;
    }
    if (selectedAssignees.length === 0) {
      Alert.alert(request ? 'Кого попросить?' : 'Ошибка', request ? 'Выберите, кого попросить' : 'Выберите хотя бы одного исполнителя');
      return;
    }
    if (!request && executorDeadline && reviewerDeadline && reviewerDeadline > executorDeadline) {
      showError('Дедлайн проверки должен быть не позже дедлайна выполнения: к общему сроку задача уже проверена и закрыта.', 'Проверьте сроки');
      return;
    }

    setLoading(true);
    try {
      if (isEdit) {
        await api.updateTask(editTaskId!, {
          title: title.trim(),
          description: description.trim() || null,
          executor_deadline: executorDeadline ? executorDeadline.toISOString() : null,
          assignee_ids: selectedAssignees.map((u) => u.id),
          ...(request
            ? {}
            : {
                importance,
                reviewer_deadline: reviewerDeadline ? reviewerDeadline.toISOString() : null,
                watcher_ids: selectedWatchers.map((u) => u.id),
              }),
        });
        savedRef.current = true;
        navigation.goBack();
        return;
      }
      const task = await api.createTask({
        kind,
        title: title.trim(),
        description: description.trim() || undefined,
        assignee_ids: selectedAssignees.map((u) => u.id),
        executor_deadline: executorDeadline?.toISOString(),
        checkpoints: checkpoints.map((c) => ({ title: c.title, deadline: c.deadline.toISOString() })),
        ...(request
          ? {}
          : {
              importance,
              watcher_ids: selectedWatchers.length ? selectedWatchers.map((u) => u.id) : undefined,
              reviewer_deadline: reviewerDeadline?.toISOString(),
            }),
      });
      savedRef.current = true;
      // Файлы загружаем после создания задачи; ошибка одного файла не теряет задачу.
      const failed: string[] = [];
      for (const f of files) {
        try {
          await api.uploadTaskFile(task.id, f.uri, f.name, f.type || 'application/octet-stream');
        } catch {
          failed.push(f.name);
        }
      }
      if (failed.length) {
        Alert.alert(request ? 'Запрос отправлен' : 'Задача создана', `Не удалось прикрепить: ${failed.join(', ')}. Добавьте их в карточке.`, [
          { text: 'OK', onPress: () => navigation.replace('TaskDetail', { taskId: task.id }) },
        ]);
      } else {
        if (request) {
          const one = selectedAssignees.length === 1 && selectedAssignees[0].id !== meId ? selectedAssignees[0] : null;
          showToast(one ? `Запрос отправлен — ${one.display_name || one.username} получит уведомление` : 'Запрос отправлен');
        }
        navigation.replace('TaskDetail', { taskId: task.id });
      }
    } catch (e: any) {
      showError(e.message || (request ? 'Не удалось отправить запрос' : 'Не удалось сохранить задачу'), 'Ошибка');
    } finally {
      setLoading(false);
    }
  };

  const toggleUser = (
    user: User,
    list: User[],
    setList: React.Dispatch<React.SetStateAction<User[]>>,
  ) => {
    if (list.find((u) => u.id === user.id)) {
      setList(list.filter((u) => u.id !== user.id));
    } else {
      setList([...list, user]);
    }
  };

  const renderUsersModal = (
    visible: boolean,
    onClose: () => void,
    selected: User[],
    setSelected: React.Dispatch<React.SetStateAction<User[]>>,
    title: string,
    source: User[],
  ) => (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{title}</Text>
            <TouchableOpacity onPress={onClose} style={styles.modalCloseBtn}>
              <X size={22} color={T.textPrimary} strokeWidth={2} />
            </TouchableOpacity>
          </View>
          <FlatList
            data={source}
            ListEmptyComponent={<Text style={styles.fieldHint}>Нет доступных сотрудников</Text>}
            keyExtractor={(item) => String(item.id)}
            contentContainerStyle={{ padding: 16, gap: 8 }}
            renderItem={({ item }) => {
              const isSelected = selected.some((u) => u.id === item.id);
              return (
                <TouchableOpacity
                  onPress={() => toggleUser(item, selected, setSelected)}
                  style={[styles.userRow, isSelected && styles.userRowSelected]}
                  activeOpacity={0.7}
                >
                  <View
                    style={[
                      styles.userAvatar,
                      { backgroundColor: `hsl(${(item.id * 47) % 360}, 60%, 65%)` },
                    ]}
                  >
                    <Text style={styles.userAvatarText}>
                      {(item.display_name || item.username).slice(0, 2).toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.userName} numberOfLines={1}>
                      {item.display_name || item.username}
                      {item.id === meId ? ' (я)' : ''}
                    </Text>
                    {(item as any).role_name ? <Text style={styles.fieldHint}>{(item as any).role_name}</Text> : null}
                  </View>
                  {isSelected && (
                    <View style={styles.checkCircle}>
                      <Check size={16} color={T.onAccent} strokeWidth={2.5} />
                    </View>
                  )}
                </TouchableOpacity>
              );
            }}
          />
          <View style={styles.modalFooter}>
            <TouchableOpacity onPress={onClose} style={styles.modalDoneBtn}>
              <Text style={styles.modalDoneBtnText}>
                Готово ({selected.length})
              </Text>
            </TouchableOpacity>
          </View>
          <SafeBottom />
        </View>
      </View>
    </Modal>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* ===== HEADER ===== */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.headerBackBtn}
        >
          <ChevronLeft size={24} color={T.textPrimary} strokeWidth={2} />
        </TouchableOpacity>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerTitle}>{isEdit ? 'РЕДАКТИРОВАТЬ' : request ? 'НОВЫЙ ЗАПРОС' : 'СОЗДАТЬ ЗАДАЧУ'}</Text>
        </View>
        <TouchableOpacity
          onPress={handleCreate}
          disabled={loading || !title.trim()}
          style={[
            styles.headerCreateBtn,
            request && { backgroundColor: T.violet },
            (loading || !title.trim()) && styles.headerCreateBtnDisabled,
          ]}
          accessibilityLabel={isEdit ? 'Сохранить' : request ? 'Попросить' : 'Создать задачу'}
        >
          {loading ? (
            <ActivityIndicator color={T.onAccent} size="small" />
          ) : (
            <Check size={20} color={T.onAccent} strokeWidth={2.5} />
          )}
        </TouchableOpacity>
      </View>

      {prefilling ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={T.accent} />
        </View>
      ) : (
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ===== Задача или запрос ===== */}
        {!isEdit && (
          <View style={styles.kindSwitch}>
            {(['task', 'request'] as const).map((k) => {
              const on = kind === k;
              const color = on ? (k === 'request' ? T.violet : T.accent) : T.textSecondary;
              return (
                <TouchableOpacity key={k} onPress={() => setKind(k)} activeOpacity={0.8} style={[styles.kindTab, on && styles.kindTabOn]}>
                  {k === 'request' ? <HandHeart size={17} color={color} strokeWidth={2.2} /> : <ListTodo size={17} color={color} strokeWidth={2.2} />}
                  <Text style={[styles.kindTabText, { color }]}>{k === 'request' ? 'Запрос' : 'Задача'}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
        {request && (
          <View style={styles.requestIntro}>
            <View style={styles.requestIntroIcon}>
              <HandHeart size={20} color={T.violet} strokeWidth={2.2} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.requestIntroTitle}>Попросите коллегу помочь</Text>
              <Text style={styles.requestIntroText}>Без важности и проверки: коллега сделает и отметит «Готово», а вы сможете сказать спасибо.</Text>
            </View>
          </View>
        )}

        {/* ===== КАРТОЧКА 1: Основная информация ===== */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardIconWrap}>
              <Type size={18} color={T.accent} strokeWidth={2} />
            </View>
            <Text style={styles.cardTitle}>Основная информация</Text>
          </View>

          <Text style={styles.fieldLabel}>{request ? 'О чём просите' : 'Название'}</Text>
          <TextInput
            style={styles.textInput}
            placeholder={request ? 'Например: подменить меня на звонке в 15:00' : 'Например: Подготовить квартальный отчёт'}
            placeholderTextColor={T.textMuted}
            value={title}
            onChangeText={setTitle}
          />

          <View style={styles.divider} />

          <Text style={styles.fieldLabel}>Описание</Text>
          <TextInput
            style={[styles.textInput, styles.textArea]}
            placeholder={request ? 'Подробности, чтобы коллеге было проще помочь…' : 'Детали задачи, ожидаемый результат...'}
            placeholderTextColor={T.textMuted}
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        </View>

        {/* ===== КАРТОЧКА 2: Приоритет (у запроса нет) ===== */}
        {!request && (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardIconWrap}>
              <Flag size={18} color={T.accent} strokeWidth={2} />
            </View>
            <Text style={styles.cardTitle}>Приоритет</Text>
          </View>

          <View style={styles.priorityRow}>
            {([
              { key: 'green', label: 'Низкий', color: T.accent, bg: T.successSoft },
              { key: 'yellow', label: 'Средний', color: T.warning, bg: T.warningSoft },
              { key: 'red', label: 'Высокий', color: T.danger, bg: T.dangerSoft },
            ] as const).map((p) => {
              const active = importance === p.key;
              return (
                <TouchableOpacity
                  key={p.key}
                  onPress={() => setImportance(p.key)}
                  style={[
                    styles.priorityBtn,
                    { backgroundColor: active ? p.bg : T.card },
                    active && { borderColor: p.color },
                  ]}
                  activeOpacity={0.7}
                >
                  <View
                    style={[
                      styles.priorityDot,
                      { backgroundColor: p.color, opacity: active ? 1 : 0.4 },
                    ]}
                  />
                  <Text
                    style={[
                      styles.priorityLabel,
                      { color: active ? p.color : T.textSecondary },
                    ]}
                  >
                    {p.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
        )}

        {/* ===== КАРТОЧКА 3: Дедлайны ===== */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardIconWrap}>
              <Clock size={18} color={T.accent} strokeWidth={2} />
            </View>
            <Text style={styles.cardTitle}>Сроки</Text>
          </View>

          <Text style={styles.fieldLabel}>{request ? 'Когда нужно' : 'Дедлайн выполнения'}</Text>
          <Text style={styles.fieldHintTop}>
            {request ? 'Необязательно — без срока коллега поможет, когда сможет' : 'Общий срок задачи — к нему она должна быть полностью завершена'}
          </Text>
          <TouchableOpacity
            onPress={() => setShowExecutorDatePicker(true)}
            style={styles.dateRow}
            activeOpacity={0.7}
          >
            <CalendarDays size={18} color={T.textSecondary} strokeWidth={2} />
            <Text
              style={[
                styles.dateText,
                !executorDeadline && styles.dateTextPlaceholder,
              ]}
            >
              {formatDate(executorDeadline)}
            </Text>
            {executorDeadline && (
              <TouchableOpacity
                onPress={() => setExecutorDeadline(null)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <X size={16} color={T.textMuted} strokeWidth={2} />
              </TouchableOpacity>
            )}
          </TouchableOpacity>

          {!request && (
          <>
          <View style={styles.divider} />

          <Text style={styles.fieldLabel}>Дедлайн проверки</Text>
          <Text style={styles.fieldHintTop}>
            Необязательно. К этому сроку исполнители сдают работу, а наблюдатели её проверяют. Не позже дедлайна выполнения.
          </Text>
          <TouchableOpacity
            onPress={() => setShowReviewerDatePicker(true)}
            style={styles.dateRow}
            activeOpacity={0.7}
          >
            <CalendarDays size={18} color={T.textSecondary} strokeWidth={2} />
            <Text
              style={[
                styles.dateText,
                !reviewerDeadline && styles.dateTextPlaceholder,
              ]}
            >
              {formatDate(reviewerDeadline)}
            </Text>
            {reviewerDeadline && (
              <TouchableOpacity
                onPress={() => setReviewerDeadline(null)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <X size={16} color={T.textMuted} strokeWidth={2} />
              </TouchableOpacity>
            )}
          </TouchableOpacity>
          {reviewerDeadline && executorDeadline && reviewerDeadline > executorDeadline && (
            <Text style={[styles.fieldHint, { color: T.danger }]}>Дедлайн проверки позже дедлайна выполнения — так нельзя</Text>
          )}
          {executorDeadline && (
            <View style={styles.timeline}>
              <View style={styles.timelineItem}>
                <View style={[styles.timelineDot, { backgroundColor: reviewerDeadline ? T.warning : T.disabled }]} />
                <Text style={styles.timelineLabel}>Проверка</Text>
                <Text style={styles.timelineDate}>{reviewerDeadline ? shortDate(reviewerDeadline) : '—'}</Text>
              </View>
              <View style={styles.timelineLine} />
              <View style={styles.timelineItem}>
                <View style={[styles.timelineDot, { backgroundColor: T.accent }]} />
                <Text style={styles.timelineLabel}>Завершение</Text>
                <Text style={styles.timelineDate}>{shortDate(executorDeadline)}</Text>
              </View>
            </View>
          )}
          </>
          )}
        </View>

        {/* ===== КАРТОЧКА 4: Участники ===== */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardIconWrap}>
              <Users size={18} color={T.accent} strokeWidth={2} />
            </View>
            <Text style={styles.cardTitle}>{request ? 'Кого попросить' : 'Участники'}</Text>
          </View>

          <TouchableOpacity
            onPress={() => setShowAssigneesModal(true)}
            style={styles.participantsRow}
            activeOpacity={0.7}
          >
            <Text style={styles.participantsLabel}>
              {request ? 'Коллеги' : 'Исполнители'} <Text style={styles.required}>*</Text>
            </Text>
            <View style={styles.participantsRight}>
              {selectedAssignees.length > 0 ? (
                <View style={styles.avatarsStack}>
                  {selectedAssignees.slice(0, 3).map((u, idx) => (
                    <View
                      key={u.id}
                      style={[
                        styles.miniAvatar,
                        {
                          backgroundColor: `hsl(${(u.id * 47) % 360}, 60%, 65%)`,
                          marginLeft: idx > 0 ? -8 : 0,
                          zIndex: 10 - idx,
                        },
                      ]}
                    >
                      <Text style={styles.miniAvatarText}>
                        {(u.display_name || u.username).slice(0, 2).toUpperCase()}
                      </Text>
                    </View>
                  ))}
                  {selectedAssignees.length > 3 && (
                    <View style={[styles.miniAvatar, styles.miniAvatarMore, { marginLeft: -8 }]}>
                      <Text style={styles.miniAvatarMoreText}>
                        +{selectedAssignees.length - 3}
                      </Text>
                    </View>
                  )}
                </View>
              ) : (
                <Text style={styles.participantsEmpty}>Выбрать...</Text>
              )}
              <ChevronRight size={18} color={T.textMuted} strokeWidth={2} />
            </View>
          </TouchableOpacity>

          {request ? (
            <Text style={styles.fieldHint}>
              {selectedAssignees.length === 1 && selectedAssignees[0].id === meId
                ? 'Запрос себе — как напоминание: отметите «Готово», когда сделаете.'
                : 'Коллега получит уведомление и отметит «Готово», когда поможет.'}
            </Text>
          ) : (
          <>
          <View style={styles.divider} />

          <TouchableOpacity
            onPress={() => setShowWatchersModal(true)}
            style={styles.participantsRow}
            activeOpacity={0.7}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Eye size={14} color={T.textSecondary} strokeWidth={2} />
              <Text style={styles.participantsLabel}>Наблюдатели</Text>
            </View>
            <View style={styles.participantsRight}>
              {selectedWatchers.length > 0 ? (
                <Text style={styles.participantsCount}>
                  {selectedWatchers.length}
                </Text>
              ) : (
                <Text style={styles.participantsEmpty}>Добавить...</Text>
              )}
              <ChevronRight size={18} color={T.textMuted} strokeWidth={2} />
            </View>
          </TouchableOpacity>
          </>
          )}
        </View>

        {/* ===== КАРТОЧКА 5: Файлы ===== */}
        {!isEdit && (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardIconWrap}>
              <Paperclip size={18} color={T.accent} strokeWidth={2} />
            </View>
            <Text style={styles.cardTitle}>Файлы</Text>
          </View>

          {files.map((f, i) => (
            <View key={`${f.uri}-${i}`} style={styles.fileRow}>
              <Paperclip size={16} color={T.textSecondary} strokeWidth={2} />
              <Text style={styles.fileName} numberOfLines={1}>{f.name}</Text>
              <TouchableOpacity onPress={() => setFiles((prev) => prev.filter((_, x) => x !== i))} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <X size={16} color={T.textMuted} strokeWidth={2} />
              </TouchableOpacity>
            </View>
          ))}
          <TouchableOpacity style={styles.addBtn} activeOpacity={0.7} onPress={pickFiles}>
            <Plus size={18} color={T.accent} strokeWidth={2.5} />
            <Text style={styles.addBtnText}>Прикрепить документ</Text>
          </TouchableOpacity>
          <Text style={styles.fieldHint}>Любые файлы до 50 МБ</Text>
        </View>
        )}

        {/* ===== КАРТОЧКА 6: Контрольные точки ===== */}
        {!isEdit && (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardIconWrap}>
              <Flag size={18} color={T.accent} strokeWidth={2} />
            </View>
            <Text style={styles.cardTitle}>Контрольные точки</Text>
          </View>
          {checkpoints.map((c, i) => (
            <View key={i} style={styles.fileRow}>
              <CalendarDays size={16} color={T.textSecondary} strokeWidth={2} />
              <Text style={styles.fileName} numberOfLines={1}>
                {c.title} · {c.deadline.toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </Text>
              <TouchableOpacity onPress={() => setCheckpoints((prev) => prev.filter((_, x) => x !== i))} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <X size={16} color={T.textMuted} strokeWidth={2} />
              </TouchableOpacity>
            </View>
          ))}
          <TextInput
            style={styles.textInput}
            placeholder="Например: черновик отчёта"
            placeholderTextColor={T.textMuted}
            value={newCpTitle}
            onChangeText={setNewCpTitle}
          />
          <TouchableOpacity
            style={[styles.addBtn, { marginTop: 10 }]}
            activeOpacity={0.7}
            onPress={() => (newCpTitle.trim() ? setShowCpPicker(true) : showError('Сначала введите название', 'Контрольная точка'))}
          >
            <Plus size={18} color={T.accent} strokeWidth={2.5} />
            <Text style={styles.addBtnText}>Выбрать дату и добавить</Text>
          </TouchableOpacity>
          <Text style={styles.fieldHint}>
            {request ? 'Этапы со своими сроками — их отмечаете вы и тот, кого попросили' : 'Промежуточные сроки: наблюдатель отмечает, выполнены ли они'}
          </Text>
        </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
      </KeyboardAvoidingView>
      )}

      {/* ===== МОДАЛКИ ===== */}
      <AssigneeSheet
        visible={showAssigneesModal}
        onClose={() => setShowAssigneesModal(false)}
        users={availableUsers as any}
        kind={kind}
        meId={meId}
        myRole={myRole}
        selected={selectedAssignees.map((u) => u.id)}
        onToggle={(u) => toggleUser(u as User, selectedAssignees, setSelectedAssignees)}
        onSwitchToRequest={isEdit ? undefined : () => setKind('request')}
      />
      {renderUsersModal(
        showWatchersModal,
        () => setShowWatchersModal(false),
        selectedWatchers,
        setSelectedWatchers,
        'Наблюдатели',
        watcherCandidates,
      )}

      <DateTimePickerModal
        visible={showCpPicker}
        initialDate={executorDeadline}
        minDate={new Date()}
        maxDate={executorDeadline}
        title="Срок контрольной точки"
        onClose={() => setShowCpPicker(false)}
        onSave={(d: Date) => {
          setCheckpoints((prev) => [...prev, { title: newCpTitle.trim(), deadline: d }].sort((a, b) => +a.deadline - +b.deadline));
          setNewCpTitle('');
          setShowCpPicker(false);
        }}
      />

      {/* Кастомный пикер: дедлайн выполнения */}
      <DateTimePickerModal
        visible={showExecutorDatePicker}
        initialDate={executorDeadline}
        minDate={new Date()}
        title={request ? 'Когда нужно' : 'Дедлайн выполнения'}
        onClose={() => setShowExecutorDatePicker(false)}
        onSave={(d: Date) => { setExecutorDeadline(d); setShowExecutorDatePicker(false); }}
      />
      {/* Кастомный пикер: дедлайн проверки */}
      <DateTimePickerModal
        visible={showReviewerDatePicker}
        initialDate={reviewerDeadline || executorDeadline}
        minDate={new Date()}
        maxDate={executorDeadline}
        title="Дедлайн проверки"
        onClose={() => setShowReviewerDatePicker(false)}
        onSave={(d: Date) => { setReviewerDeadline(d); setShowReviewerDatePicker(false); }}
      />
    </SafeAreaView>
  );
}

const styles = themed(() => ({
  kindSwitch: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: 16, backgroundColor: T.inputBg, marginBottom: 12 },
  kindTab: { flex: 1, height: 42, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  kindTabOn: { backgroundColor: T.card, shadowColor: T.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  kindTabText: { fontSize: 15, fontWeight: '800' },
  requestIntro: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 20, marginBottom: 12, backgroundColor: T.violetSoft, borderWidth: 1.5, borderColor: withAlpha(T.violet, 0.22) },
  requestIntroIcon: { width: 40, height: 40, borderRadius: 13, backgroundColor: T.card, alignItems: 'center', justifyContent: 'center' },
  requestIntroTitle: { fontSize: 15, fontWeight: '800', color: T.textPrimary },
  requestIntroText: { fontSize: 13, lineHeight: 18, color: T.textSecondary, marginTop: 2 },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  fileName: { flex: 1, fontSize: 14, color: T.textPrimary },
  container: {
    flex: 1,
    backgroundColor: T.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: T.background,
    borderBottomWidth: 1,
    borderBottomColor: T.border,
  },
  headerBackBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  headerTitleWrap: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontFamily: Platform.OS === 'ios' ? 'Bebas Neue' : 'sans-serif-condensed',
    fontSize: 24,
    fontWeight: '900',
    color: T.textPrimary,
    letterSpacing: 1,
  },
  headerCreateBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: T.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCreateBtnDisabled: {
    backgroundColor: T.surfaceActive,
  },
  scrollContent: {
    padding: 20,
    gap: 20,
  },
  card: {
    backgroundColor: T.card,
    borderRadius: 22,
    padding: 20,
    shadowColor: T.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 16,
    elevation: 3,
    gap: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 4,
  },
  cardIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: T.accentMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: T.textPrimary,
    flex: 1,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: T.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  fieldHint: {
    fontSize: 12,
    color: T.textMuted,
  },
  fieldHintTop: { fontSize: 12, color: T.textMuted, marginTop: -4, lineHeight: 16 },
  timeline: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: T.inputBg,
  },
  timelineItem: { alignItems: 'center', minWidth: 96 },
  timelineDot: { width: 10, height: 10, borderRadius: 5, marginBottom: 4 },
  timelineLabel: { fontSize: 11, fontWeight: '600', color: T.textSecondary },
  timelineDate: { fontSize: 12, fontWeight: '700', color: T.textPrimary, marginTop: 1 },
  timelineLine: { flex: 1, height: 2, backgroundColor: T.border, marginHorizontal: 6, marginBottom: 22 },
  divider: {
    height: 1,
    backgroundColor: T.surfaceActive,
    marginVertical: 4,
  },
  textInput: {
    fontSize: 16,
    color: T.textPrimary,
    fontWeight: '500',
    paddingVertical: 8,
    minHeight: 36,
  },
  textArea: {
    minHeight: 80,
  },
  priorityRow: {
    flexDirection: 'row',
    gap: 10,
  },
  priorityBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: T.border,
  },
  priorityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  priorityLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
  },
  dateText: {
    flex: 1,
    fontSize: 15,
    color: T.textPrimary,
    fontWeight: '500',
  },
  dateTextPlaceholder: {
    color: T.textMuted,
  },
  participantsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  participantsLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: T.textPrimary,
  },
  required: {
    color: T.danger,
  },
  participantsRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  participantsEmpty: {
    fontSize: 14,
    color: T.textMuted,
    fontStyle: 'italic',
  },
  participantsCount: {
    fontSize: 14,
    fontWeight: '600',
    color: T.accent,
  },
  avatarsStack: {
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
    borderColor: T.card,
  },
  miniAvatarText: {
    fontSize: 9,
    fontWeight: '700',
    color: T.onAccent,
  },
  miniAvatarMore: {
    backgroundColor: T.surfaceActive,
  },
  miniAvatarMoreText: {
    fontSize: 9,
    fontWeight: '600',
    color: T.textSecondary,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: T.accentMuted,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: T.successSoft,
    borderStyle: 'dashed',
  },
  addBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: T.accent,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: T.overlay,
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: T.card,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: T.border,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: T.textPrimary,
  },
  modalCloseBtn: {
    padding: 6,
  },
  modalFooter: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: T.border,
  },
  modalDoneBtn: {
    backgroundColor: T.accent,
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
  },
  modalDoneBtnText: {
    color: T.onAccent,
    fontSize: 15,
    fontWeight: '700',
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 14,
    backgroundColor: T.background,
  },
  userRowSelected: {
    backgroundColor: T.accentMuted,
    borderWidth: 1,
    borderColor: T.accent,
  },
  userAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userAvatarText: {
    color: T.onAccent,
    fontWeight: '700',
    fontSize: 13,
  },
  userName: {
    fontSize: 15,
    fontWeight: '600',
    color: T.textPrimary,
  },
  checkCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: T.accent,
    alignItems: 'center',
    justifyContent: 'center',
  }
}));