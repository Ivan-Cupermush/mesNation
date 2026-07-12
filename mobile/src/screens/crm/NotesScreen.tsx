const formatLocalDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, StatusBar } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../../theme/ThemeContext';
import { CalendarView } from '../../components/CalendarView';
import { api, Note, DayWithNotes } from '../../services/api';

export default function NotesScreen({ navigation }: any) {
  const { colors } = useTheme();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [notes, setNotes] = useState<Note[]>([]);
  const [daysWithNotes, setDaysWithNotes] = useState<DayWithNotes[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'all' | 'favorite'>('all');

  const loadDaysWithNotes = useCallback(async () => {
    try {
      const month = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}`;
      const data = await api.getDaysWithNotes(month);
      setDaysWithNotes(data);
    } catch (e) {
      console.error('Ошибка загрузки дней с заметками:', e);
    }
  }, [currentMonth]);

  const loadNotes = useCallback(async () => {
    setLoading(true);
    try {
      if (filter === 'favorite') {
        const data = await api.getFavoriteNotes();
        setNotes(data);
      } else {
        const dateStr = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`;
        const data = await api.getNotesByDate(dateStr);
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
  };

  const handleMonthChange = (date: Date) => {
    setCurrentMonth(date);
  };

  const handleCreateNote = () => {
    const dateStr = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`;
    navigation.navigate('NoteEditor', { noteDate: dateStr });
  };

  const handleEditNote = (note: Note) => {
    navigation.navigate('NoteEditor', { noteId: note.id, noteDate: note.note_date });
  };

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
        style={[styles.noteCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
      >
        <View style={styles.noteHeader}>
          {item.is_favorite && <Text style={styles.favoriteIcon}>🚩</Text>}
          <View style={{ flex: 1 }}>
            <Text style={[styles.noteTitle, { color: colors.textPrimary }]} numberOfLines={1}>
              {item.title || 'Без названия'}
            </Text>
            <Text style={[styles.noteDate, { color: colors.textSecondary }]}>
              {formatDate(new Date(item.note_date))}
            </Text>
          </View>
        </View>
        {preview && (
          <Text style={[styles.notePreview, { color: colors.textSecondary }]} numberOfLines={3}>
            {preview}
          </Text>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={colors.background === '#fff' ? 'dark-content' : 'light-content'} backgroundColor={colors.background} />
      
      {/* Хедер с отступом для статус-бара */}
      <View style={[styles.header, { paddingTop: (StatusBar.currentHeight || 24) + 8 }]}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Заметки</Text>
        <TouchableOpacity
          onPress={handleCreateNote}
          style={[styles.addButton, { backgroundColor: colors.accent }]}
        >
          <Text style={{ color: colors.onAccent, fontSize: 24, fontWeight: '300' }}>+</Text>
        </TouchableOpacity>
      </View>

      <CalendarView
        currentMonth={currentMonth}
        selectedDate={selectedDate}
        daysWithNotes={daysWithNotes}
        onDateSelect={handleDateSelect}
        onMonthChange={handleMonthChange}
      />

      <View style={styles.filtersRow}>
        <TouchableOpacity
          onPress={() => setFilter('all')}
          style={[
            styles.filterChip,
            {
              backgroundColor: filter === 'all' ? colors.accent : colors.surface,
              borderColor: filter === 'all' ? colors.accent : colors.border,
            },
          ]}
        >
          <Text
            style={{
              color: filter === 'all' ? colors.onAccent : colors.textPrimary,
              fontWeight: filter === 'all' ? '600' : '400',
            }}
          >
            Все
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setFilter('favorite')}
          style={[
            styles.filterChip,
            {
              backgroundColor: filter === 'favorite' ? colors.accent : colors.surface,
              borderColor: filter === 'favorite' ? colors.accent : colors.border,
            },
          ]}
        >
          <Text
            style={{
              color: filter === 'favorite' ? colors.onAccent : colors.textPrimary,
              fontWeight: filter === 'favorite' ? '600' : '400',
            }}
          >
            🚩 Избранные
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.listHeader}>
        <Text style={[styles.listTitle, { color: colors.textSecondary }]}>
          {filter === 'favorite' 
            ? 'Избранные заметки' 
            : `${formatDate(selectedDate)} · ${notes.length}`}
        </Text>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : (
        <FlatList
          data={notes}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderNoteCard}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={{ fontSize: 64 }}>📝</Text>
              <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
                {filter === 'favorite' ? 'Нет избранных заметок' : 'Нет заметок за этот день'}
              </Text>
              <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
                Нажмите + чтобы создать заметку
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  title: { fontSize: 32, fontWeight: '700' },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  filtersRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  listHeader: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
  },
  listTitle: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  noteCard: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
  },
  noteHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  favoriteIcon: {
    fontSize: 20,
    marginRight: 8,
  },
  noteTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  noteDate: {
    fontSize: 12,
  },
  notePreview: {
    fontSize: 14,
    lineHeight: 20,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    marginTop: 6,
  },
});
