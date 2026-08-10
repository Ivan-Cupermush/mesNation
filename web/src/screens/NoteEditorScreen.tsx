import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import styled from 'styled-components';
import { ArrowLeft, Star, Check, PenLine, Calendar, Loader2 } from 'lucide-react';
import { api, getNotesByMonth } from '../services/api';
import type { Note } from '../services/api';
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

const formatDate = (dateStr: string): string => {
  const date = new Date(dateStr + 'T00:00:00');
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
};

const NoteEditorScreen: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const noteDateParam = searchParams.get('date');

  const noteId = id ? parseInt(id) : null;

  const [note, setNote] = useState<Note | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isFavorite, setIsFavorite] = useState(false);
  const [loading, setLoading] = useState(!!noteId);
  const [saving, setSaving] = useState(false);

  const initialDataRef = useRef({ title: '', content: '', isFavorite: false });

  useEffect(() => {
    if (noteId) {
      loadNote();
    } else {
      setLoading(false);
    }
  }, []);

  const loadNote = async () => {
    try {
      const dateToLoad = noteDateParam || formatLocalDate(new Date());
      const month = dateToLoad.substring(0, 7);
      const allNotes = await getNotesByMonth(month);
      const found = allNotes.find((n: Note) => n.id === noteId);
      if (found) {
        setNote(found);
        setTitle(found.title);
        setContent(found.content);
        setIsFavorite(found.is_favorite);
        initialDataRef.current = {
          title: found.title,
          content: found.content,
          isFavorite: found.is_favorite,
        };
      } else {
        alert('Заметка не найдена');
        navigate('/notes');
      }
    } catch (e) {
      console.error('Ошибка загрузки заметки:', e);
      alert('Не удалось загрузить заметку');
    } finally {
      setLoading(false);
    }
  };

  const hasChanges = (): boolean => {
    return (
      title !== initialDataRef.current.title ||
      content !== initialDataRef.current.content ||
      isFavorite !== initialDataRef.current.isFavorite
    );
  };

  const handleSave = async () => {
    if (!title.trim() && !content.trim()) {
      alert('Добавьте заголовок или текст перед сохранением');
      return;
    }

    setSaving(true);
    try {
      if (note) {
        const updated = await api.updateNote(note.id, {
          title,
          content,
          is_favorite: isFavorite,
        });
        setNote(updated);
        initialDataRef.current = {
          title: updated.title,
          content: updated.content,
          isFavorite: updated.is_favorite,
        };
        alert('Изменения сохранены');
        navigate('/notes');
      } else {
        const dateToUse = noteDateParam || formatLocalDate(new Date());

        await api.createNote({
          title,
          content,
          note_date: dateToUse,
          is_favorite: isFavorite,
        });
        navigate('/notes');
      }
    } catch (e) {
      console.error('Ошибка сохранения:', e);
      alert('Не удалось сохранить заметку');
    } finally {
      setSaving(false);
    }
  };

  const toggleFavorite = () => {
    setIsFavorite(!isFavorite);
  };

  const handleBack = () => {
    if (hasChanges()) {
      if (window.confirm('У вас есть несохранённые изменения. Сохранить заметку?')) {
        handleSave();
      } else {
        navigate('/notes');
      }
    } else {
      navigate('/notes');
    }
  };

  if (loading) {
    return (
      <LoadingContainer>
        <Loader size={40} color={theme.colors.primary} />
      </LoadingContainer>
    );
  }

  const isEditing = !!note;
  const saveButtonEnabled = !saving && (title.trim().length > 0 || content.trim().length > 0);
  const currentNoteDate = note
    ? formatDate(note.note_date)
    : formatDate(noteDateParam || formatLocalDate(new Date()));

  return (
    <Container>
      {/* Header row */}
      <HeaderRow>
        <BackBtn onClick={handleBack}>
          <ArrowLeft size={22} strokeWidth={2.2} />
        </BackBtn>

        <HeaderCenter>
          {isEditing && hasChanges() && <UnsavedDot />}
        </HeaderCenter>

        <IconBtn $active={isFavorite} onClick={toggleFavorite}>
          <Star
            size={20}
            color={isFavorite ? '#FFFFFF' : '#F59E0B'}
            fill={isFavorite ? '#FFFFFF' : '#F59E0B'}
            strokeWidth={2.2}
          />
        </IconBtn>
      </HeaderRow>

      {/* Big premium title */}
      <HeroHeader>
        <BigTitle>{isEditing ? 'РЕДАКТИРОВАНИЕ' : 'НОВАЯ ЗАМЕТКА'}</BigTitle>
        <DateRow>
          <Calendar size={14} color="#6F6F73" strokeWidth={2.2} />
          <BigSubtitle>{currentNoteDate}</BigSubtitle>
        </DateRow>
      </HeroHeader>

      {/* Content */}
      <ScrollView>
        <TitleInput
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Заголовок заметки"
        />

        <Divider />

        <ContentRow>
          <PenLine size={18} color="#BDBDBD" strokeWidth={2} style={{ marginTop: 4 }} />
          <ContentInput
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder="Напишите свои мысли..."
          />
        </ContentRow>
      </ScrollView>

      {/* Floating Save button */}
      <Fab $enabled={saveButtonEnabled} onClick={handleSave} disabled={!saveButtonEnabled}>
        {saving ? (
          <Loader2 size={22} color="#fff" style={{ animation: 'spin 1s linear infinite' }} />
        ) : (
          <>
            <Check size={22} color="#FFFFFF" strokeWidth={2.8} />
            <FabText>{isEditing ? 'Сохранить' : 'Создать'}</FabText>
          </>
        )}
      </Fab>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </Container>
  );
};

export default NoteEditorScreen;

// ===== STYLED =====
const Container = styled.div`
  max-width: 720px;
  margin: 0 auto;
  padding: 0 20px 120px;
`;

const LoadingContainer = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 400px;
`;

const Loader = styled.div<{ size?: number; color?: string }>`
  width: ${p => p.size || 40}px;
  height: ${p => p.size || 40}px;
  border: 3px solid ${theme.colors.borderLight};
  border-top-color: ${p => p.color || theme.colors.primary};
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  @keyframes spin { to { transform: rotate(360deg); } }
`;

const HeaderRow = styled.div`
  display: flex;
  align-items: center;
  padding: 12px 0;
`;

const BackBtn = styled.button`
  width: 44px;
  height: 44px;
  border-radius: 14px;
  background: #FFFFFF;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 6px 24px rgba(0,0,0,0.05);
  color: #141414;
  &:hover { background: ${theme.colors.borderLight}; }
`;

const HeaderCenter = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const UnsavedDot = styled.div`
  width: 10px;
  height: 10px;
  border-radius: 5px;
  background: ${theme.colors.primary};
`;

const IconBtn = styled.button<{ $active: boolean }>`
  width: 44px;
  height: 44px;
  border-radius: 14px;
  background: ${p => (p.$active ? '#F59E0B' : '#FFFFFF')};
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 6px 24px rgba(0,0,0,0.05);
`;

const HeroHeader = styled.div`
  padding: 8px 0 20px;
`;

const BigTitle = styled.h1`
  font-family: ${theme.fonts.display};
  font-size: 40px;
  font-weight: 900;
  color: #141414;
  letter-spacing: -0.5px;
  line-height: 44px;
`;

const DateRow = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
`;

const BigSubtitle = styled.span`
  font-family: ${theme.fonts.serif};
  font-size: 18px;
  font-style: italic;
  color: #6F6F73;
`;

const ScrollView = styled.div`
  flex: 1;
`;

const TitleInput = styled.input`
  width: 100%;
  font-size: 32px;
  font-weight: 800;
  margin-bottom: 16px;
  padding: 0;
  color: #141414;
  background: none;
  border: none;
  outline: none;
  &::placeholder { color: #BDBDBD; }
`;

const Divider = styled.div`
  height: 1px;
  background: #ECECE8;
  margin-bottom: 20px;
`;

const ContentRow = styled.div`
  display: flex;
`;

const ContentInput = styled.textarea`
  flex: 1;
  font-size: 17px;
  line-height: 26px;
  min-height: 300px;
  padding: 0;
  padding-left: 12px;
  color: #141414;
  font-weight: 500;
  background: none;
  border: none;
  outline: none;
  resize: vertical;
  &::placeholder { color: #BDBDBD; }
`;

const Fab = styled.button<{ $enabled: boolean }>`
  position: fixed;
  right: 32px;
  bottom: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 16px 24px;
  border-radius: 22px;
  background: ${p => (p.$enabled ? theme.colors.primary : '#D1D5DB')};
  box-shadow: ${p => (p.$enabled ? '0 8px 16px rgba(31, 122, 82, 0.3)' : '0 4px 12px rgba(0,0,0,0.1)')};
  z-index: 50;
  transition: transform 0.15s;
  cursor: ${p => (p.$enabled ? 'pointer' : 'not-allowed')};

  &:hover {
    transform: ${p => (p.$enabled ? 'scale(1.05)' : 'none')};
  }
`;

const FabText = styled.span`
  font-size: 15px;
  font-weight: 700;
  color: #FFFFFF;
`;
