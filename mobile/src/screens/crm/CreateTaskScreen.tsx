import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Platform,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import {
  ChevronLeft,
  Check,
  Type,
  AlignLeft,
  Flag,
  CalendarDays,
  Clock,
  Users,
  Eye,
  Target,
  Paperclip,
  Plus,
  Trash2,
  X,
  ChevronRight,
} from 'lucide-react-native';
import api from '../../services/api';

interface User {
  id: number;
  username: string;
  display_name: string;
  avatar_url?: string;
}

interface Checkpoint {
  title: string;
  deadline: string;
}

export default function CreateTaskScreen({ navigation }: any) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [importance, setImportance] = useState<'green' | 'yellow' | 'red'>('yellow');
  const [executorDeadline, setExecutorDeadline] = useState<Date | null>(null);
  const [reviewerDeadline, setReviewerDeadline] = useState<Date | null>(null);
  const [selectedAssignees, setSelectedAssignees] = useState<User[]>([]);
  const [selectedWatchers, setSelectedWatchers] = useState<User[]>([]);
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [loading, setLoading] = useState(false);

  // Модальные окна
  const [showAssigneesModal, setShowAssigneesModal] = useState(false);
  const [showWatchersModal, setShowWatchersModal] = useState(false);
  const [showCheckpointModal, setShowCheckpointModal] = useState(false);
  const [showExecutorDatePicker, setShowExecutorDatePicker] = useState(false);
  const [showReviewerDatePicker, setShowReviewerDatePicker] = useState(false);
  const [checkpointTitle, setCheckpointTitle] = useState('');
  const [checkpointDate, setCheckpointDate] = useState<Date>(new Date());
  const [showCheckpointDate, setShowCheckpointDate] = useState(false);

  // Список пользователей (из дерева прав)
  const [availableUsers, setAvailableUsers] = useState<User[]>([]);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      const users = await api.getSubtreeUsers();
      setAvailableUsers(users);
    } catch (e) {
      console.log('Ошибка загрузки пользователей:', e);
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

    setLoading(true);
    try {
      const payload: any = {
        title: title.trim(),
        description: description.trim() || undefined,
        importance,
        assignee_ids: selectedAssignees.map((u) => u.id),
      };
      if (selectedWatchers.length > 0) {
        payload.watcher_ids = selectedWatchers.map((u) => u.id);
      }
      if (executorDeadline) payload.executor_deadline = executorDeadline.toISOString();
      if (reviewerDeadline) payload.reviewer_deadline = reviewerDeadline.toISOString();
      if (checkpoints.length > 0) {
        payload.checkpoints = checkpoints.map((cp) => ({
          title: cp.title,
          deadline: new Date(cp.deadline).toISOString(),
        }));
      }

      await api.createTask(payload);
      Alert.alert('Успех', 'Задача создана', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (e: any) {
      Alert.alert('Ошибка', e.message || 'Не удалось создать задачу');
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

  const addCheckpoint = () => {
    if (!checkpointTitle.trim()) {
      Alert.alert('Ошибка', 'Введите название контрольной точки');
      return;
    }
    setCheckpoints([
      ...checkpoints,
      { title: checkpointTitle.trim(), deadline: checkpointDate.toISOString() },
    ]);
    setCheckpointTitle('');
    setCheckpointDate(new Date());
    setShowCheckpointModal(false);
  };

  const removeCheckpoint = (idx: number) => {
    setCheckpoints(checkpoints.filter((_, i) => i !== idx));
  };

  const renderUsersModal = (
    visible: boolean,
    onClose: () => void,
    selected: User[],
    setSelected: React.Dispatch<React.SetStateAction<User[]>>,
    title: string,
  ) => (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{title}</Text>
            <TouchableOpacity onPress={onClose} style={styles.modalCloseBtn}>
              <X size={22} color="#141414" strokeWidth={2} />
            </TouchableOpacity>
          </View>
          <FlatList
            data={availableUsers}
            keyExtractor={(item) => String(item.id)}
            contentContainerStyle={{ padding: 16, gap: 8 }}
            renderItem={({ item }) => {
              const isSelected = selected.some((u) => u.id === item.id);
              return (
                <TouchableOpacity
                  onPress={() => toggleUser(item, selected, setSelected)}
                  style={[
                    styles.userRow,
                    isSelected && styles.userRowSelected,
                  ]}
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
                    <Text style={styles.userName}>{item.display_name || item.username}</Text>
                  </View>
                  {isSelected && (
                    <View style={styles.checkCircle}>
                      <Check size={16} color="#FFFFFF" strokeWidth={2.5} />
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
        </View>
      </View>
    </Modal>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* ===== HEADER ===== */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.headerBackBtn}
        >
          <ChevronLeft size={24} color="#141414" strokeWidth={2} />
        </TouchableOpacity>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerTitle}>СОЗДАТЬ ЗАДАЧУ</Text>
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
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Check size={20} color="#FFFFFF" strokeWidth={2.5} />
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ===== КАРТОЧКА 1: Основная информация ===== */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardIconWrap}>
              <Type size={18} color="#1F7A52" strokeWidth={2} />
            </View>
            <Text style={styles.cardTitle}>Основная информация</Text>
          </View>

          <Text style={styles.fieldLabel}>Название</Text>
          <TextInput
            style={styles.textInput}
            placeholder="Например: Подготовить квартальный отчёт"
            placeholderTextColor="#BDBDBD"
            value={title}
            onChangeText={setTitle}
          />

          <View style={styles.divider} />

          <Text style={styles.fieldLabel}>Описание</Text>
          <TextInput
            style={[styles.textInput, styles.textArea]}
            placeholder="Детали задачи, ожидаемый результат..."
            placeholderTextColor="#BDBDBD"
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
              <Flag size={18} color="#1F7A52" strokeWidth={2} />
            </View>
            <Text style={styles.cardTitle}>Приоритет</Text>
          </View>

          <View style={styles.priorityRow}>
            {([
              { key: 'green', label: 'Низкий', color: '#1F7A52', bg: '#D1FAE5' },
              { key: 'yellow', label: 'Средний', color: '#B45309', bg: '#FEF3C7' },
              { key: 'red', label: 'Высокий', color: '#B91C1C', bg: '#FEE2E2' },
            ] as const).map((p) => {
              const active = importance === p.key;
              return (
                <TouchableOpacity
                  key={p.key}
                  onPress={() => setImportance(p.key)}
                  style={[
                    styles.priorityBtn,
                    { backgroundColor: active ? p.bg : '#FFFFFF' },
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
                      { color: active ? p.color : '#6F6F73' },
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
              <Clock size={18} color="#1F7A52" strokeWidth={2} />
            </View>
            <Text style={styles.cardTitle}>Сроки</Text>
          </View>

          {/* Дедлайн выполнения */}
          <Text style={styles.fieldLabel}>Дедлайн выполнения</Text>
          <TouchableOpacity
            onPress={() => setShowExecutorDatePicker(true)}
            style={styles.dateRow}
            activeOpacity={0.7}
          >
            <CalendarDays size={18} color="#6F6F73" strokeWidth={2} />
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
                <X size={16} color="#BDBDBD" strokeWidth={2} />
              </TouchableOpacity>
            )}
          </TouchableOpacity>

          <View style={styles.divider} />

          {/* Дедлайн проверки */}
          <Text style={styles.fieldLabel}>Дедлайн проверки</Text>
          <TouchableOpacity
            onPress={() => setShowReviewerDatePicker(true)}
            style={styles.dateRow}
            activeOpacity={0.7}
          >
            <CalendarDays size={18} color="#6F6F73" strokeWidth={2} />
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
                <X size={16} color="#BDBDBD" strokeWidth={2} />
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
              <Users size={18} color="#1F7A52" strokeWidth={2} />
            </View>
            <Text style={styles.cardTitle}>Участники</Text>
          </View>

          {/* Исполнители */}
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
              <ChevronRight size={18} color="#BDBDBD" strokeWidth={2} />
            </View>
          </TouchableOpacity>

          <View style={styles.divider} />

          {/* Наблюдатели */}
          <TouchableOpacity
            onPress={() => setShowWatchersModal(true)}
            style={styles.participantsRow}
            activeOpacity={0.7}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Eye size={14} color="#6F6F73" strokeWidth={2} />
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
              <ChevronRight size={18} color="#BDBDBD" strokeWidth={2} />
            </View>
          </TouchableOpacity>
        </View>

        {/* ===== КАРТОЧКА 5: Контрольные точки ===== */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardIconWrap}>
              <Target size={18} color="#1F7A52" strokeWidth={2} />
            </View>
            <Text style={styles.cardTitle}>Контрольные точки</Text>
            {checkpoints.length > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{checkpoints.length}</Text>
              </View>
            )}
          </View>

          <Text style={styles.fieldHint}>
            Промежуточные этапы с собственными дедлайнами
          </Text>

          {checkpoints.length > 0 && (
            <View style={styles.checkpointsList}>
              {checkpoints.map((cp, idx) => (
                <View key={idx} style={styles.checkpointItem}>
                  <View style={styles.checkpointLine} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.checkpointTitle}>{cp.title}</Text>
                    <Text style={styles.checkpointDate}>
                      {formatDate(new Date(cp.deadline))}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => removeCheckpoint(idx)}
                    style={styles.checkpointRemoveBtn}
                  >
                    <Trash2 size={16} color="#DC2626" strokeWidth={2} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          <TouchableOpacity
            onPress={() => setShowCheckpointModal(true)}
            style={styles.addBtn}
            activeOpacity={0.7}
          >
            <Plus size={18} color="#1F7A52" strokeWidth={2.5} />
            <Text style={styles.addBtnText}>Добавить контрольную точку</Text>
          </TouchableOpacity>
        </View>

        {/* ===== КАРТОЧКА 6: Файлы ===== */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardIconWrap}>
              <Paperclip size={18} color="#1F7A52" strokeWidth={2} />
            </View>
            <Text style={styles.cardTitle}>Файлы</Text>
          </View>

          <TouchableOpacity style={styles.addBtn} activeOpacity={0.7}>
            <Plus size={18} color="#1F7A52" strokeWidth={2.5} />
            <Text style={styles.addBtnText}>Прикрепить документ</Text>
          </TouchableOpacity>
          <Text style={styles.fieldHint}>
            PDF, DOCX, изображения — до 20 МБ
          </Text>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ===== МОДАЛКИ ===== */}
      {renderUsersModal(
        showAssigneesModal,
        () => setShowAssigneesModal(false),
        selectedAssignees,
        setSelectedAssignees,
        'Исполнители',
      )}
      {renderUsersModal(
        showWatchersModal,
        () => setShowWatchersModal(false),
        selectedWatchers,
        setSelectedWatchers,
        'Наблюдатели',
      )}

      {/* Модалка добавления контрольной точки */}
      <Modal visible={showCheckpointModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: 400 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Контрольная точка</Text>
              <TouchableOpacity
                onPress={() => setShowCheckpointModal(false)}
                style={styles.modalCloseBtn}
              >
                <X size={22} color="#141414" strokeWidth={2} />
              </TouchableOpacity>
            </View>

            <View style={{ padding: 20, gap: 16 }}>
              <TextInput
                style={styles.textInput}
                placeholder="Название этапа"
                placeholderTextColor="#BDBDBD"
                value={checkpointTitle}
                onChangeText={setCheckpointTitle}
                autoFocus
              />
              <TouchableOpacity
                onPress={() => setShowCheckpointDate(true)}
                style={styles.dateRow}
              >
                <CalendarDays size={18} color="#6F6F73" strokeWidth={2} />
                <Text style={styles.dateText}>{formatDate(checkpointDate)}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={addCheckpoint}
                style={styles.modalPrimaryBtn}
              >
                <Text style={styles.modalPrimaryBtnText}>Добавить</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* DatePicker для дедлайна выполнения */}
      {showExecutorDatePicker && (
        <DateTimePicker
          value={executorDeadline || new Date()}
          mode="datetime"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(e, d) => {
            setShowExecutorDatePicker(false);
            if (d) setExecutorDeadline(d);
          }}
          minimumDate={new Date()}
        />
      )}
      {showReviewerDatePicker && (
        <DateTimePicker
          value={reviewerDeadline || new Date()}
          mode="datetime"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(e, d) => {
            setShowReviewerDatePicker(false);
            if (d) setReviewerDeadline(d);
          }}
          minimumDate={new Date()}
        />
      )}
      {showCheckpointDate && (
        <DateTimePicker
          value={checkpointDate}
          mode="datetime"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(e, d) => {
            setShowCheckpointDate(false);
            if (d) setCheckpointDate(d);
          }}
          minimumDate={new Date()}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAF8',
  },

  // ===== HEADER =====
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
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
  headerTitleWrap: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontFamily: Platform.OS === 'ios' ? 'Bebas Neue' : 'sans-serif-condensed',
    fontSize: 24,
    fontWeight: '900',
    color: '#141414',
    letterSpacing: 1,
  },
  headerCreateBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#1F7A52',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCreateBtnDisabled: {
    backgroundColor: '#BDBDBD',
  },

  // ===== SCROLL =====
  scrollContent: {
    padding: 20,
    gap: 20,
  },

  // ===== CARD =====
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 20,
    shadowColor: '#000',
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
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#141414',
    flex: 1,
  },
  badge: {
    backgroundColor: '#1F7A52',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },

  // ===== FIELDS =====
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6F6F73',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  fieldHint: {
    fontSize: 12,
    color: '#BDBDBD',
    fontStyle: 'italic',
  },
  divider: {
    height: 1,
    backgroundColor: '#ECECE8',
    marginVertical: 4,
  },
  textInput: {
    fontSize: 16,
    color: '#141414',
    fontWeight: '500',
    paddingVertical: 8,
    minHeight: 36,
  },
  textArea: {
    minHeight: 80,
  },

  // ===== PRIORITY =====
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
    borderColor: '#ECECE8',
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

  // ===== DATE ROW =====
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
  },
  dateText: {
    flex: 1,
    fontSize: 15,
    color: '#141414',
    fontWeight: '500',
  },
  dateTextPlaceholder: {
    color: '#BDBDBD',
  },

  // ===== PARTICIPANTS =====
  participantsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  participantsLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#141414',
  },
  required: {
    color: '#DC2626',
  },
  participantsRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  participantsEmpty: {
    fontSize: 14,
    color: '#BDBDBD',
    fontStyle: 'italic',
  },
  participantsCount: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F7A52',
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

  // ===== CHECKPOINTS =====
  checkpointsList: {
    gap: 8,
  },
  checkpointItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  checkpointLine: {
    width: 2,
    height: 32,
    backgroundColor: '#1F7A52',
    borderRadius: 1,
  },
  checkpointTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#141414',
  },
  checkpointDate: {
    fontSize: 12,
    color: '#6F6F73',
    marginTop: 2,
  },
  checkpointRemoveBtn: {
    padding: 6,
  },

  // ===== ADD BTN =====
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#ECFDF5',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#D1FAE5',
    borderStyle: 'dashed',
  },
  addBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F7A52',
  },

  // ===== MODAL =====
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
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
    borderBottomColor: '#ECECE8',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#141414',
  },
  modalCloseBtn: {
    padding: 6,
  },
  modalFooter: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#ECECE8',
  },
  modalDoneBtn: {
    backgroundColor: '#1F7A52',
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
  },
  modalDoneBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  modalPrimaryBtn: {
    backgroundColor: '#1F7A52',
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
  },
  modalPrimaryBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },

  // ===== USER ROW =====
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 14,
    backgroundColor: '#FAFAF8',
  },
  userRowSelected: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#1F7A52',
  },
  userAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userAvatarText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  userName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#141414',
  },
  checkCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#1F7A52',
    alignItems: 'center',
    justifyContent: 'center',
  },
});