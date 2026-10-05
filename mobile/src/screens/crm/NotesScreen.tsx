import React, { useState, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
  StatusBar,
  Alert,
  Animated,
  LayoutChangeEvent,
} from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Star, Plus, FileText, BookOpen, UserRound, Paperclip, Copy, CopyPlus, Trash2 } from 'lucide-react-native';
import ActionSheet from '../../components/chat/ActionSheet';
import NotesCalendar, { CAL_COLLAPSE, CAL_FULL_H } from '../../components/NotesCalendar';
import { api, Note, DayWithNotes } from '../../services/api';

import { T, themed } from '../../theme/runtime';
const formatLocalDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const NoteSeparator = () => <View style={styles.separator} />;

export default function NotesScreen({ navigation }: any) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [notes, setNotes] = useState<Note[]>([]);
  const [daysWithNotes, setDaysWithNotes] = useState<DayWithNotes[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'all' | 'favorite'>('all');
  // Меню заметки — нижний лист: системный Alert на Android вмещает только 3 кнопки,
  // и «Отмена» пропадала.
  const [menuNote, setMenuNote] = useState<Note | null>(null);

  // Точки в календаре: соседние месяцы тоже видны (края сетки и свёрнутая неделя).
  const loadDaysWithNotes = useCallback(async () => {
    try {
      const months = [-1, 0, 1].map((k) => {
        const d = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + k, 1);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      });
      const parts = await Promise.all(months.map((m) => api.getDaysWithNotes(m).catch(() => [] as DayWithNotes[])));
      setDaysWithNotes(parts.flat());
    } catch (e) {
      console.error('Ошибка загрузки дней с заметками:', e);
    }
  }, [currentMonth]);

  const marked = useMemo(
    () => new Set(daysWithNotes.filter((d) => Number(d.note_count) > 0).map((d) => String(d.note_date).substring(0, 10))),
    [daysWithNotes],
  );

  // ---------- Сворачивание календаря прокруткой ----------
  const scrollY = useRef(new Animated.Value(0)).current;
  const offset = useRef(0);
  const listRef = useRef<FlatList<Note>>(null);
  const [viewportH, setViewportH] = useState(0);
  const snapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragStart = useRef(0);

  const onScroll = useMemo(
    () =>
      Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
        useNativeDriver: true,
        listener: (e: any) => {
          offset.current = e.nativeEvent.contentOffset.y;
        },
      }),
    [scrollY],
  );

  const scrollTo = (y: number, animated = true) => listRef.current?.scrollToOffset({ offset: Math.max(0, y), animated });

  // Календарь не останавливается на полпути: доводим до ближайшего состояния.
  const snap = (y: number) => {
    if (y <= 0 || y >= CAL_COLLAPSE) return;
    scrollTo(y > CAL_COLLAPSE / 2 ? CAL_COLLAPSE : 0);
  };

  const isCollapsed = () => offset.current >= CAL_COLLAPSE - 4;

  const onCalendarDrag = (phase: 'start' | 'move' | 'end', dy: number, vy: number) => {
    if (phase === 'start') {
      dragStart.current = offset.current;
    } else if (phase === 'move') {
      scrollTo(dragStart.current - dy, false);
    } else if (dy > 0 || vy > 0.3) {
      // Потянули вниз — полный календарь и начало списка.
      scrollTo(0);
    } else if (offset.current < CAL_COLLAPSE) {
      scrollTo(CAL_COLLAPSE);
    }
  };

  const loadNotes = useCallback(async () => {
    setLoading(true);
    try {
      if (filter === 'favorite') {
        const data = await api.getFavoriteNotes();
        setNotes(data);
      } else {
        const data = await api.getNotesByDate(formatLocalDate(selectedDate));
        setNotes(data);
      }
    } catch (e) {
      console.error('Ошибка загрузки заметок:', e);
    } finally {
      setLoading(false);
    }
  }, [selectedDate, filter]);

  useFocusEffect(
    useCallback(() => {
      loadDaysWithNotes();
      loadNotes();
    }, [loadDaysWithNotes, loadNotes])
  );

  const handleDateSelect = (date: Date) => {
    setSelectedDate(date);
    setFilter('all');
    if (date.getMonth() !== currentMonth.getMonth() || date.getFullYear() !== currentMonth.getFullYear()) {
      setCurrentMonth(new Date(date.getFullYear(), date.getMonth(), 1));
    }
  };

  const handleToday = () => {
    const now = new Date();
    setSelectedDate(now);
    setCurrentMonth(new Date(now.getFullYear(), now.getMonth(), 1));
    setFilter('all');
  };

  const handleMonthChange = (date: Date) => {
    setCurrentMonth(date);
  };

  const handleCreateNote = () => {
    navigation.navigate('NoteEditor', { noteDate: formatLocalDate(selectedDate) });
  };

  const handleEditNote = (note: Note) => {
    navigation.navigate('NoteEditor', { noteId: note.id, noteDate: note.note_date });
  };

  const handleNoteActions = (note: Note) => setMenuNote(note);

  const noteActions = (note: Note) => [
    {
      key: 'copy',
      label: 'Скопировать текст',
      icon: <Copy size={20} color={T.textPrimary} />,
      onPress: () => Clipboard.setString([note.title, note.content].filter(Boolean).join('\n\n')),
    },
    {
      key: 'duplicate',
      label: 'Создать копию',
      icon: <CopyPlus size={20} color={T.textPrimary} />,
      onPress: async () => {
        try {
          await api.duplicateNote(note.id);
          loadNotes();
          loadDaysWithNotes();
        } catch (e: any) {
          Alert.alert('Ошибка', e?.message || 'Не удалось скопировать заметку');
        }
      },
    },
    {
      key: 'delete',
      label: 'Удалить',
      danger: true,
      icon: <Trash2 size={20} color={T.danger} />,
      onPress: () =>
        Alert.alert('Удалить заметку?', 'Заметка и её вложения будут удалены.', [
          { text: 'Отмена', style: 'cancel' },
          {
            text: 'Удалить',
            style: 'destructive',
            onPress: async () => {
              try {
                await api.deleteNote(note.id);
                setNotes((prev) => prev.filter((n) => n.id !== note.id));
                loadDaysWithNotes();
              } catch (e: any) {
                Alert.alert('Ошибка', e?.message || 'Не удалось удалить заметку');
              }
            },
          },
        ]),
    },
  ];

  const formatDate = (date: Date): string => {
    const months = [
      'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
      'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
    ];
    return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
  };

  const renderNoteCard = ({ item }: { item: Note }) => {
    const preview = item.content.substring(0, 100) + (item.content.length > 100 ? '...' : '');
    return (
      <TouchableOpacity
        onPress={() => handleEditNote(item)}
        onLongPress={() => handleNoteActions(item)}
        style={styles.noteCard}
        activeOpacity={0.7}
      >
        <View style={styles.noteHeader}>
          <View style={styles.noteIconWrap}>
            <BookOpen size={20} color={T.accent} strokeWidth={2.2} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.noteTitle} numberOfLines={1}>
              {item.title || 'Без названия'}
            </Text>
            <Text style={styles.noteDate}>
              {formatDate(new Date(item.note_date + 'T00:00:00'))}
            </Text>
          </View>
          {item.is_favorite && (
            <View style={styles.favoriteBadge}>
              <Star size={16} color={T.warning} fill={T.warning} strokeWidth={2.2} />
            </View>
          )}
        </View>
        <Text style={styles.notePreview} numberOfLines={3}>
          {preview}
        </Text>
        {item.files_count ? (
          <View style={styles.filesBadge}>
            <Paperclip size={13} color={T.textSecondary} strokeWidth={2.2} />
            <Text style={styles.filesBadgeText}>{item.files_count}</Text>
          </View>
        ) : null}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle={T.statusBar} backgroundColor="transparent" translucent />

      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>ЗАМЕТКИ</Text>
          <Text style={styles.subtitle}>
            {formatDate(selectedDate)}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.profileBtn}
          onPress={() => navigation.getParent()?.navigate('ChatTab', { screen: 'Profile' })}
          activeOpacity={0.7}
        >
          <UserRound size={20} color={T.accent} strokeWidth={2} />
        </TouchableOpacity>
      </View>

      {/* Список под календарём: календарь лежит поверх и сворачивается прокруткой */}
      <View style={styles.listArea} onLayout={(e: LayoutChangeEvent) => setViewportH(e.nativeEvent.layout.height)}>
        <Animated.FlatList
          ref={listRef as any}
          data={notes}
          keyExtractor={(item: Note) => item.id.toString()}
          renderItem={renderNoteCard}
          onScroll={onScroll}
          scrollEventThrottle={16}
          onScrollBeginDrag={() => snapTimer.current && clearTimeout(snapTimer.current)}
          onScrollEndDrag={(e: any) => {
            const y = e.nativeEvent.contentOffset.y;
            snapTimer.current = setTimeout(() => snap(y), 120);
          }}
          onMomentumScrollBegin={() => snapTimer.current && clearTimeout(snapTimer.current)}
          onMomentumScrollEnd={(e: any) => snap(e.nativeEvent.contentOffset.y)}
          ListHeaderComponent={
            <>
              <View style={{ height: CAL_FULL_H }} />
              <View style={styles.listHeader}>
                <Text style={styles.listTitle}>
                  {filter === 'favorite' ? 'Избранные заметки' : 'Записи за день'}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <TouchableOpacity
                    onPress={() => setFilter(filter === 'all' ? 'favorite' : 'all')}
                    activeOpacity={0.85}
                    style={[styles.filterBtn, filter === 'favorite' && styles.filterBtnActive]}
                    accessibilityLabel="Избранные заметки"
                  >
                    <Star
                      size={18}
                      color={filter === 'favorite' ? T.onAccent : T.warning}
                      fill={filter === 'favorite' ? T.onAccent : T.warning}
                      strokeWidth={2.2}
                    />
                  </TouchableOpacity>
                  <View style={styles.listCountBadge}>
                    <Text style={styles.listCountText}>{notes.length}</Text>
                  </View>
                </View>
              </View>
            </>
          }
          ListEmptyComponent={
            loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={T.accent} />
              </View>
            ) : (
              <View style={styles.emptyState}>
                <View style={styles.emptyIconWrap}>
                  <FileText size={32} color={T.textMuted} strokeWidth={1.8} />
                </View>
                <Text style={styles.emptyTitle}>Нет заметок</Text>
                <Text style={styles.emptySubtitle}>
                  {filter === 'favorite'
                    ? 'Добавьте заметки в избранное, нажав на звёздочку'
                    : 'Создайте первую заметку для этой даты'}
                </Text>
              </View>
            )
          }
          ItemSeparatorComponent={NoteSeparator}
          // Свернуть календарь можно всегда, даже когда заметок мало.
          contentContainerStyle={[styles.listContent, viewportH > 0 && { minHeight: viewportH + CAL_COLLAPSE }]}
          showsVerticalScrollIndicator={false}
        />
        <View style={styles.calendarOverlay} pointerEvents="box-none">
          <NotesCalendar
            month={currentMonth}
            selected={selectedDate}
            marked={marked}
            scrollY={scrollY}
            isCollapsed={isCollapsed}
            onSelect={handleDateSelect}
            onMonthChange={handleMonthChange}
            onToday={handleToday}
            onVerticalDrag={onCalendarDrag}
          />
        </View>
      </View>

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={handleCreateNote}
        activeOpacity={0.85}
      >
        <Plus size={28} color={T.onAccent} strokeWidth={2.5} />
      </TouchableOpacity>
      <ActionSheet
        visible={!!menuNote}
        title={menuNote ? menuNote.title || 'Без названия' : undefined}
        actions={menuNote ? noteActions(menuNote) : []}
        onClose={() => setMenuNote(null)}
      />
    </SafeAreaView>
  );
}

const styles = themed(() => ({
  filesBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 },
  filesBadgeText: { fontSize: 12, color: T.textSecondary, fontWeight: '600' },
  container: { flex: 1, backgroundColor: T.background },

  // ===== HEADER =====
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 10,
  },
  title: {
    fontFamily: Platform.OS === 'ios' ? 'Bebas Neue' : 'sans-serif-condensed',
    fontSize: 40,
    fontWeight: '900',
    color: T.textPrimary,
    letterSpacing: -0.5,
    lineHeight: 44,
  },
  subtitle: {
        fontSize: 14,
    color: T.textSecondary,
    marginTop: 4,
    fontWeight: '500',
  },
  profileBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: T.card,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: T.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },

  // ===== СПИСОК И КАЛЕНДАРЬ =====
  listArea: { flex: 1 },
  separator: { height: 14 },
  calendarOverlay: { position: 'absolute', left: 0, right: 0, top: 0 },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    marginBottom: 14,
  },
  listTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: T.textPrimary,
    fontFamily: Platform.OS === 'ios' ? 'Montserrat' : 'sans-serif-medium',
  },
  listCountBadge: {
    backgroundColor: T.successSoft,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  listCountText: {
    fontSize: 14,
    fontWeight: '800',
    color: T.accent,
    fontFamily: Platform.OS === 'ios' ? 'Montserrat' : 'sans-serif-medium',
  },
  filterBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: T.card,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: T.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 24,
    elevation: 4,
  },
  filterBtnActive: {
    backgroundColor: T.warning,
  },

  // ===== STATES =====
  loadingContainer: { paddingTop: 48, justifyContent: 'center', alignItems: 'center' },
  emptyState: {
    justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 24, paddingTop: 36,
  },
  emptyIconWrap: {
    width: 72, height: 72, borderRadius: 20, backgroundColor: T.inputBg,
    justifyContent: 'center', alignItems: 'center', marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 18, fontWeight: '700', color: T.textPrimary, marginTop: 16,
    fontFamily: Platform.OS === 'ios' ? 'Montserrat' : 'sans-serif-medium',
  },
  emptySubtitle: {
    fontSize: 14, color: T.textSecondary, marginTop: 8,
    textAlign: 'center', lineHeight: 20, fontWeight: '500',
  },

  // ===== NOTE CARDS =====
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 120,
  },
  noteCard: {
    backgroundColor: T.card,
    borderRadius: 22,
    padding: 20,
    shadowColor: T.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 24,
    elevation: 4,
  },
  noteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  noteIconWrap: {
    width: 44, height: 44, borderRadius: 14, backgroundColor: T.successSoft,
    justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  noteTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: T.textPrimary,
    marginBottom: 2,
    fontFamily: Platform.OS === 'ios' ? 'Montserrat' : 'sans-serif-medium',
  },
  noteDate: {
    fontSize: 12,
    color: T.textSecondary,
    fontWeight: '500',
  },
  favoriteBadge: {
    width: 36, height: 36, borderRadius: 12, backgroundColor: T.warningSoft,
    justifyContent: 'center', alignItems: 'center', marginLeft: 12,
  },
  notePreview: {
    fontSize: 14,
    color: T.textSecondary,
    lineHeight: 20,
    fontWeight: '500',
  },

  // ===== FAB =====
  fab: {
    position: 'absolute',
    right: 24,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: T.accent,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: T.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  }
}));