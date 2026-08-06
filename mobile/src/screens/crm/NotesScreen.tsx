import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ActivityIndicator,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Calendar, Star, Plus, FileText } from 'lucide-react-native';
import { CalendarView } from '../../components/CalendarView';
import { api, Note, DayWithNotes } from '../../services/api';

const formatLocalDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export default function NotesScreen({ navigation }: any) {
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
        style={styles.noteCard}
        activeOpacity={0.7}
      >
        <View style={styles.noteHeader}>
          {item.is_favorite && (
            <View style={styles.favoriteBadge}>
              <Star size={14} color="#F59E0B" fill="#F59E0B" />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.noteTitle} numberOfLines={1}>
              {item.title || 'Без названия'}
            </Text>
            <Text style={styles.noteDate}>
              {formatDate(new Date(item.note_date))}
            </Text>
          </View>
          <View style={styles.noteIcon}>
            <FileText size={20} color="#6F6F73" />
          </View>
        </View>
        <Text style={styles.notePreview} numberOfLines={3}>
          {preview}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FAFAF8" />
      
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Заметки</Text>
          <Text style={styles.subtitle}>
            {formatDate(selectedDate)}
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => setFilter(filter === 'all' ? 'favorite' : 'all')}
          style={[
            styles.filterBtn,
            filter === 'favorite' && styles.filterBtnActive,
          ]}
        >
          <Star
            size={20}
            color={filter === 'favorite' ? '#FFFFFF' : '#6F6F73'}
            fill={filter === 'favorite' ? '#FFFFFF' : 'none'}
          />
        </TouchableOpacity>
      </View>

      {/* Calendar */}
      <View style={styles.calendarContainer}>
        <CalendarView
          currentMonth={currentMonth}
          selectedDate={selectedDate}
          daysWithNotes={daysWithNotes}
          onDateSelect={handleDateSelect}
          onMonthChange={handleMonthChange}
        />
      </View>

      {/* Notes List */}
      <View style={styles.listContainer}>
        <View style={styles.listHeader}>
          <Text style={styles.listTitle}>
            {filter === 'favorite' ? 'Избранные заметки' : `Заметки за ${formatDate(selectedDate)}`}
          </Text>
          <Text style={styles.listCount}>{notes.length}</Text>
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#1F7A52" />
          </View>
        ) : notes.length === 0 ? (
          <View style={styles.emptyState}>
            <FileText size={48} color="#D1D5DB" />
            <Text style={styles.emptyTitle}>Нет заметок</Text>
            <Text style={styles.emptySubtitle}>
              {filter === 'favorite'
                ? 'Добавьте заметки в избранное'
                : 'Создайте первую заметку для этой даты'}
            </Text>
          </View>
        ) : (
          <FlatList
            data={notes}
            keyExtractor={(item) => item.id.toString()}
            renderItem={renderNoteCard}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={handleCreateNote}
        activeOpacity={0.8}
      >
        <Plus size={28} color="#FFFFFF" />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAF8',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 16,
  },
  title: {
    fontFamily: Platform.OS === 'ios' ? 'Bebas Neue' : 'sans-serif-condensed',
    fontSize: 40,
    fontWeight: '900',
    color: '#141414',
    letterSpacing: -0.5,
    lineHeight: 44,
  },
  subtitle: {
    fontSize: 16,
    color: '#6F6F73',
    marginTop: 4,
    fontWeight: '500',
  },
  filterBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  filterBtnActive: {
    backgroundColor: '#1F7A52',
  },
  calendarContainer: {
    paddingHorizontal: 24,
    marginBottom: 16,
  },
  listContainer: {
    flex: 1,
  },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    marginBottom: 12,
  },
  listTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#141414',
  },
  listCount: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F7A52',
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 48,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#141414',
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#6F6F73',
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 20,
  },
  listContent: {
    paddingHorizontal: 24,
    paddingBottom: 120,
    gap: 16,
  },
  noteCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 20,
    shadowColor: '#000',
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
  favoriteBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FEF3C7',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  noteTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#141414',
    marginBottom: 4,
  },
  noteDate: {
    fontSize: 13,
    color: '#6F6F73',
    fontWeight: '500',
  },
  noteIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 12,
  },
  notePreview: {
    fontSize: 14,
    color: '#6F6F73',
    lineHeight: 20,
    fontWeight: '500',
  },
  fab: {
    position: 'absolute',
    right: 24,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: '#1F7A52',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#1F7A52',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
});
