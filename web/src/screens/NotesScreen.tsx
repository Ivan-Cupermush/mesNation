import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { Star, Plus, FileText, BookOpen } from 'lucide-react';
import CalendarView from '../components/CalendarView';
import {
  getNotesByDate, getFavoriteNotes, getDaysWithNotes,
} from '../services/api';
import type { Note, DayWithNotes } from '../services/api';
import { theme } from '../styles/theme';

const MONTHS = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
];

const formatLocalDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatDate = (date: Date): string => {
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
};

const NotesScreen: React.FC = () => {
  const navigate = useNavigate();

  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [notes, setNotes] = useState<Note[]>([]);
  const [daysWithNotes, setDaysWithNotes] = useState<DayWithNotes[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'all' | 'favorite'>('all');

  const loadDaysWithNotes = useCallback(async () => {
    try {
      const month = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}`;
      const data = await getDaysWithNotes(month);
      setDaysWithNotes(data);
    } catch (e) {
      console.error('Ошибка загрузки дней с заметками:', e);
    }
  }, [currentMonth]);

  const loadNotes = useCallback(async () => {
    setLoading(true);
    try {
      if (filter === 'favorite') {
        const data = await getFavoriteNotes();
        setNotes(data);
      } else {
        const dateStr = formatLocalDate(selectedDate);
        const data = await getNotesByDate(dateStr);
        setNotes(data);
      }
    } catch (e) {
      console.error('Ошибка загрузки заметок:', e);
      setNotes([]);
    } finally {
      setLoading(false);
    }
  }, [selectedDate, filter]);

  useEffect(() => {
    loadDaysWithNotes();
    loadNotes();
  }, [loadDaysWithNotes, loadNotes]);

  const handleDateSelect = (date: Date) => {
    setSelectedDate(date);
    setFilter('all');
  };

  const handleMonthChange = (date: Date) => {
    setCurrentMonth(date);
  };

  const handleCreateNote = () => {
    const dateStr = formatLocalDate(selectedDate);
    navigate(`/notes/new?date=${dateStr}`);
  };

  const handleEditNote = (note: Note) => {
    navigate(`/notes/${note.id}`);
  };

  const renderNoteCard = (note: Note) => {
    const preview = note.content.substring(0, 100) + (note.content.length > 100 ? '...' : '');

    return (
      <NoteCard key={note.id} onClick={() => handleEditNote(note)}>
        <NoteHeader>
          <NoteIconWrap>
            <BookOpen size={20} color="#1F7A52" strokeWidth={2.2} />
          </NoteIconWrap>
          <div style={{ flex: 1 }}>
            <NoteTitle>{note.title || 'Без названия'}</NoteTitle>
            <NoteDate>{formatDate(new Date(note.note_date + 'T00:00:00'))}</NoteDate>
          </div>
          {note.is_favorite && (
            <FavoriteBadge>
              <Star size={16} color="#F59E0B" fill="#F59E0B" strokeWidth={2.2} />
            </FavoriteBadge>
          )}
        </NoteHeader>
        <NotePreview>{preview}</NotePreview>
      </NoteCard>
    );
  };

  return (
    <Container>
      {/* Header */}
      <Header>
        <div style={{ flex: 1 }}>
          <BigTitle>ЗАМЕТКИ</BigTitle>
          <Subtitle>{formatDate(selectedDate)}</Subtitle>
        </div>
        <FilterBtn
          $active={filter === 'favorite'}
          onClick={() => setFilter(filter === 'all' ? 'favorite' : 'all')}
        >
          <Star
            size={20}
            color={filter === 'favorite' ? '#FFFFFF' : '#F59E0B'}
            fill={filter === 'favorite' ? '#FFFFFF' : '#F59E0B'}
            strokeWidth={2.2}
          />
        </FilterBtn>
      </Header>

      {/* Calendar */}
      <CalendarContainer>
        <CalendarView
          currentMonth={currentMonth}
          selectedDate={selectedDate}
          daysWithNotes={daysWithNotes}
          onDateSelect={handleDateSelect}
          onMonthChange={handleMonthChange}
        />
      </CalendarContainer>

      {/* Notes List */}
      <ListContainer>
        <ListHeader>
          <ListTitle>
            {filter === 'favorite' ? 'Избранные заметки' : 'Записи за день'}
          </ListTitle>
          <ListCountBadge>
            <ListCountText>{notes.length}</ListCountText>
          </ListCountBadge>
        </ListHeader>

        {loading ? (
          <LoadingContainer>
            <Loader />
          </LoadingContainer>
        ) : notes.length === 0 ? (
          <EmptyState>
            <EmptyIconWrap>
              <FileText size={32} color="#9CA3AF" strokeWidth={1.8} />
            </EmptyIconWrap>
            <EmptyTitle>Нет заметок</EmptyTitle>
            <EmptySubtitle>
              {filter === 'favorite'
                ? 'Добавьте заметки в избранное, нажав на звёздочку'
                : 'Создайте первую заметку для этой даты'}
            </EmptySubtitle>
          </EmptyState>
        ) : (
          <ListContent>
            {notes.map(renderNoteCard)}
          </ListContent>
        )}
      </ListContainer>

      {/* FAB */}
      <Fab onClick={handleCreateNote}>
        <Plus size={28} color="#FFFFFF" strokeWidth={2.5} />
      </Fab>
    </Container>
  );
};

export default NotesScreen;

// ===== STYLED =====
const Container = styled.div`
  max-width: 960px;
  margin: 0 auto;
  padding: 32px 24px 120px;
`;

const Header = styled.div`
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  margin-bottom: 24px;
`;

const BigTitle = styled.h1`
  font-family: ${theme.fonts.display};
  font-size: 40px;
  font-weight: 900;
  color: ${theme.colors.textPrimary};
  letter-spacing: -0.5px;
  line-height: 44px;
`;

const Subtitle = styled.p`
  font-family: ${theme.fonts.serif};
  font-size: 18px;
  font-style: italic;
  color: ${theme.colors.textSecondary};
  margin-top: 4px;
`;

const FilterBtn = styled.button<{ $active: boolean }>`
  width: 48px;
  height: 48px;
  border-radius: 16px;
  background: ${p => (p.$active ? '#F59E0B' : '#FFFFFF')};
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 6px 24px rgba(0,0,0,0.05);
  transition: background 0.2s;
`;

const CalendarContainer = styled.div`
  margin-bottom: 20px;
`;

const ListContainer = styled.div``;

const ListHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
`;

const ListTitle = styled.div`
  font-size: 20px;
  font-weight: 800;
  color: ${theme.colors.textPrimary};
`;

const ListCountBadge = styled.div`
  background: ${theme.colors.primaryLight};
  padding: 6px 12px;
  border-radius: 12px;
`;

const ListCountText = styled.span`
  font-size: 14px;
  font-weight: 800;
  color: ${theme.colors.primary};
`;

const LoadingContainer = styled.div`
  display: flex;
  justify-content: center;
  padding: 64px 0;
`;

const Loader = styled.div`
  width: 40px;
  height: 40px;
  border: 3px solid ${theme.colors.borderLight};
  border-top-color: ${theme.colors.primary};
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  @keyframes spin { to { transform: rotate(360deg); } }
`;

const EmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 64px 48px;
`;

const EmptyIconWrap = styled.div`
  width: 72px;
  height: 72px;
  border-radius: 20px;
  background: ${theme.colors.borderLight};
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 8px;
`;

const EmptyTitle = styled.div`
  font-size: 18px;
  font-weight: 700;
  color: ${theme.colors.textPrimary};
  margin-top: 16px;
`;

const EmptySubtitle = styled.div`
  font-size: 14px;
  color: ${theme.colors.textSecondary};
  margin-top: 8px;
  text-align: center;
  line-height: 20px;
  font-weight: 500;
`;

const ListContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const NoteCard = styled.div`
  background: #FFFFFF;
  border-radius: 22px;
  padding: 20px;
  box-shadow: 0 6px 24px rgba(0,0,0,0.05);
  cursor: pointer;
  transition: transform 0.15s, box-shadow 0.15s;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 10px 28px rgba(0,0,0,0.08);
  }
`;

const NoteHeader = styled.div`
  display: flex;
  align-items: center;
  margin-bottom: 12px;
`;

const NoteIconWrap = styled.div`
  width: 44px;
  height: 44px;
  border-radius: 14px;
  background: ${theme.colors.primaryLight};
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 12px;
`;

const NoteTitle = styled.div`
  font-size: 17px;
  font-weight: 700;
  color: ${theme.colors.textPrimary};
  margin-bottom: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const NoteDate = styled.div`
  font-size: 12px;
  color: ${theme.colors.textSecondary};
  font-weight: 500;
`;

const FavoriteBadge = styled.div`
  width: 36px;
  height: 36px;
  border-radius: 12px;
  background: ${theme.colors.accentLight};
  display: flex;
  align-items: center;
  justify-content: center;
  margin-left: 12px;
`;

const NotePreview = styled.div`
  font-size: 14px;
  color: ${theme.colors.textSecondary};
  line-height: 20px;
  font-weight: 500;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
`;

const Fab = styled.button`
  position: fixed;
  right: 32px;
  bottom: 32px;
  width: 56px;
  height: 56px;
  border-radius: 28px;
  background: ${theme.colors.primary};
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 8px 16px rgba(31, 122, 82, 0.3);
  z-index: 50;
  transition: transform 0.15s;

  &:hover {
    transform: scale(1.05);
  }
`;
