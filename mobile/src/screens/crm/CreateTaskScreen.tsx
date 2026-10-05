import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
  FlatList
} from 'react-native';
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
  ChevronRight
} from 'lucide-react-native';
import { api } from '../../services/api';
import { pick, types, isErrorWithCode, errorCodes } from '@react-native-documents/picker';

import { T, themed } from '../../theme/runtime';
import SafeBottom from '../../components/ui/SafeBottom';
interface User {
  id: number;
  username: string;
  display_name: string;
  avatar_url?: string | null;
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
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
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
  useEffect(() => {
    if (!prefilling) initialRef.current = snapshotRef.current;
  }, [prefilling]);
  useEffect(
    () =>
      navigation.addListener('beforeRemove', (e: any) => {
        if (savedRef.current || prefilling || snapshotRef.current === initialRef.current) return;
        e.preventDefault();
        Alert.alert(isEdit ? 'Отменить изменения?' : 'Отменить создание задачи?', 'Введённые данные не сохранятся.', [
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
    } catch (e: any) {
      Alert.alert('Не удалось загрузить сотрудников', e?.message || '');
    }
  };

  const prefill = async (id: number) => {
    try {
      const task = await api.getTask(id);
      setTitle(task.title);
      setDescription(task.description || '');
      setImportance(task.importance);
      const ex = task.executor_deadline || task.hard_deadline;
      setExecutorDeadline(ex ? new Date(ex) : null);
      setReviewerDeadline(task.reviewer_deadline ? new Date(task.reviewer_deadline) : null);
      setSelectedAssignees((task.assignees || []) as User[]);
      setSelectedWatchers((task.watchers || []) as User[]);
    } catch (e: any) {
      Alert.alert('Не удалось загрузить задачу', e?.message || '');
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
        Alert.alert('Ошибка', 'Не удалось выбрать файл');
      }
    }
  };

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

  const handleCreate = async () => {
    if (!title.trim()) {
      Alert.alert('Ошибка', 'Введите название задачи');
      return;
    }
    if (selectedAssignees.length === 0) {
      Alert.alert('Ошибка', 'Выберите хотя бы одного исполнителя');
      return;
    }
    if (executorDeadline && reviewerDeadline && reviewerDeadline < executorDeadline) {
      Alert.alert('Ошибка', 'Дедлайн проверки не может быть раньше дедлайна выполнения');
      return;
    }

    setLoading(true);
    try {
      if (isEdit) {
        await api.updateTask(editTaskId!, {
          title: title.trim(),
          description: description.trim() || null,
          importance,
          executor_deadline: executorDeadline ? executorDeadline.toISOString() : null,
          reviewer_deadline: reviewerDeadline ? reviewerDeadline.toISOString() : null,
          assignee_ids: selectedAssignees.map((u) => u.id),
          watcher_ids: selectedWatchers.map((u) => u.id),
        });
        savedRef.current = true;
        navigation.goBack();
        return;
      }
      const task = await api.createTask({
        title: title.trim(),
        description: description.trim() || undefined,
        importance,
        assignee_ids: selectedAssignees.map((u) => u.id),
        watcher_ids: selectedWatchers.length ? selectedWatchers.map((u) => u.id) : undefined,
        executor_deadline: executorDeadline?.toISOString(),
        reviewer_deadline: reviewerDeadline?.toISOString(),
        checkpoints: checkpoints.map((c) => ({ title: c.title, deadline: c.deadline.toISOString() })),
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
        Alert.alert('Задача создана', `Не удалось прикрепить: ${failed.join(', ')}. Добавьте их в карточке задачи.`, [
          { text: 'OK', onPress: () => navigation.replace('TaskDetail', { taskId: task.id }) },
        ]);
      } else {
        navigation.replace('TaskDetail', { taskId: task.id });
      }
    } catch (e: any) {
      Alert.alert('Ошибка', e.message || 'Не удалось сохранить задачу');
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
    <Modal visible={visible} animationType="slide" transparent>
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
                    <Text style={styles.userName}>
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
          <Text style={styles.headerTitle}>{isEdit ? 'РЕДАКТИРОВАТЬ' : 'СОЗДАТЬ ЗАДАЧУ'}</Text>
        </View>
        <TouchableOpacity
          onPress={handleCreate}
          disabled={loading || !title.trim()}
          style={[
            styles.headerCreateBtn,
            (loading || !title.trim()) && styles.headerCreateBtnDisabled,
          ]}
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
        {/* ===== КАРТОЧКА 1: Основная информация ===== */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardIconWrap}>
              <Type size={18} color={T.accent} strokeWidth={2} />
            </View>
            <Text style={styles.cardTitle}>Основная информация</Text>
          </View>

          <Text style={styles.fieldLabel}>Название</Text>
          <TextInput
            style={styles.textInput}
            placeholder="Например: Подготовить квартальный отчёт"
            placeholderTextColor={T.textMuted}
            value={title}
            onChangeText={setTitle}
          />

          <View style={styles.divider} />

          <Text style={styles.fieldLabel}>Описание</Text>
          <TextInput
            style={[styles.textInput, styles.textArea]}
            placeholder="Детали задачи, ожидаемый результат..."
            placeholderTextColor={T.textMuted}
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        </View>

        {/* ===== КАРТОЧКА 2: Приоритет ===== */}
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

        {/* ===== КАРТОЧКА 3: Дедлайны ===== */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardIconWrap}>
              <Clock size={18} color={T.accent} strokeWidth={2} />
            </View>
            <Text style={styles.cardTitle}>Сроки</Text>
          </View>

          <Text style={styles.fieldLabel}>Дедлайн выполнения</Text>
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

          <View style={styles.divider} />

          <Text style={styles.fieldLabel}>Дедлайн проверки</Text>
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
          <Text style={styles.fieldHint}>
            Если не указан — будет рассчитан автоматически при переходе на проверку
          </Text>
        </View>

        {/* ===== КАРТОЧКА 4: Участники ===== */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardIconWrap}>
              <Users size={18} color={T.accent} strokeWidth={2} />
            </View>
            <Text style={styles.cardTitle}>Участники</Text>
          </View>

          <TouchableOpacity
            onPress={() => setShowAssigneesModal(true)}
            style={styles.participantsRow}
            activeOpacity={0.7}
          >
            <Text style={styles.participantsLabel}>
              Исполнители <Text style={styles.required}>*</Text>
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
            onPress={() => (newCpTitle.trim() ? setShowCpPicker(true) : Alert.alert('Контрольная точка', 'Сначала введите название'))}
          >
            <Plus size={18} color={T.accent} strokeWidth={2.5} />
            <Text style={styles.addBtnText}>Выбрать дату и добавить</Text>
          </TouchableOpacity>
          <Text style={styles.fieldHint}>Промежуточные сроки: наблюдатель отмечает, выполнены ли они</Text>
        </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
      </KeyboardAvoidingView>
      )}

      {/* ===== МОДАЛКИ ===== */}
      {renderUsersModal(
        showAssigneesModal,
        () => setShowAssigneesModal(false),
        selectedAssignees,
        setSelectedAssignees,
        'Исполнители',
        availableUsers,
      )}
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
        title="Дедлайн выполнения"
        onClose={() => setShowExecutorDatePicker(false)}
        onSave={(d: Date) => { setExecutorDeadline(d); setShowExecutorDatePicker(false); }}
      />
      {/* Кастомный пикер: дедлайн проверки */}
      <DateTimePickerModal
        visible={showReviewerDatePicker}
        initialDate={reviewerDeadline}
        minDate={new Date()}
        title="Дедлайн проверки"
        onClose={() => setShowReviewerDatePicker(false)}
        onSave={(d: Date) => { setReviewerDeadline(d); setShowReviewerDatePicker(false); }}
      />
    </SafeAreaView>
  );
}

const styles = themed(() => ({
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
    fontStyle: 'italic',
  },
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