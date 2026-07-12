import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  ActivityIndicator,
  StatusBar,
} from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { api, Note } from '../../services/api';

// Форматируем дату в локальное YYYY-MM-DD
const formatLocalDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export default function NoteEditorScreen({ route, navigation }: any) {
  const { colors } = useTheme();
  const { noteId, noteDate } = route.params || {};
  
  const [note, setNote] = useState<Note | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isFavorite, setIsFavorite] = useState(false);
  const [loading, setLoading] = useState(!!noteId);
  const [saving, setSaving] = useState(false);
  
  const initialDataRef = useRef({ title: '', content: '', isFavorite: false });
  const titleInputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (noteId) {
      loadNote();
    } else {
      setLoading(false);
      setTimeout(() => titleInputRef.current?.focus(), 100);
    }
  }, []);

  const loadNote = async () => {
    try {
      const dateToLoad = noteDate || formatLocalDate(new Date());
      const month = dateToLoad.substring(0, 7);
      const allNotes = await api.getNotesByMonth(month);
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
        Alert.alert('Ошибка', 'Заметка не найдена');
        navigation.goBack();
      }
    } catch (e) {
      console.error('Ошибка загрузки заметки:', e);
      Alert.alert('Ошибка', 'Не удалось загрузить заметку');
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
      Alert.alert('Пустая заметка', 'Добавьте заголовок или текст перед сохранением');
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
        Alert.alert('Сохранено', 'Изменения сохранены', [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
      } else {
        const dateToUse = noteDate || formatLocalDate(new Date());
        
        await api.createNote({
          title,
          content,
          note_date: dateToUse,
          is_favorite: isFavorite,
        });
        navigation.goBack();
      }
    } catch (e) {
      console.error('Ошибка сохранения:', e);
      Alert.alert('Ошибка', 'Не удалось сохранить заметку');
    } finally {
      setSaving(false);
    }
  };

  const toggleFavorite = () => {
    setIsFavorite(!isFavorite);
  };

  const handleBack = () => {
    if (hasChanges()) {
      Alert.alert(
        'Несохранённые изменения',
        'Вы внесли изменения. Сохранить заметку?',
        [
          { text: 'Не сохранять', style: 'destructive', onPress: () => navigation.goBack() },
          { text: 'Отмена', style: 'cancel' },
          { text: 'Сохранить', onPress: handleSave },
        ],
        { cancelable: true }
      );
    } else {
      navigation.goBack();
    }
  };

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr + 'T00:00:00');
    const months = [
      'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
      'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
    ];
    return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
  };

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  const isEditing = !!note;
  const saveButtonText = saving 
    ? 'Сохраняю...' 
    : (isEditing ? 'Сохранить' : 'Добавить');
  const saveButtonEnabled = !saving && (title.trim().length > 0 || content.trim().length > 0);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar 
        barStyle={colors.background === '#fff' ? 'dark-content' : 'light-content'} 
        backgroundColor={colors.background}
      />
      
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <View 
          style={[
            styles.header, 
            { 
              borderBottomColor: colors.border,
              paddingTop: (StatusBar.currentHeight || 24) + 8,
            }
          ]}
        >
          <TouchableOpacity onPress={handleBack} style={styles.backButton}>
            <Text style={[styles.backButtonText, { color: colors.accent }]}>
              ← Назад
            </Text>
          </TouchableOpacity>
          
          <View style={styles.headerCenter}>
            {isEditing && hasChanges() && (
              <View style={[styles.unsavedDot, { backgroundColor: colors.accent }]} />
            )}
          </View>

          <TouchableOpacity
            onPress={toggleFavorite}
            style={styles.favoriteButton}
          >
            <Text style={{ fontSize: 24 }}>
              {isFavorite ? '🚩' : '⚑'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.saveButtonWrapper}>
          <TouchableOpacity
            onPress={handleSave}
            disabled={!saveButtonEnabled}
            style={[
              styles.saveButton,
              {
                backgroundColor: saveButtonEnabled ? colors.accent : colors.surface,
                borderColor: colors.border,
              },
            ]}
          >
            <Text
              style={[
                styles.saveButtonText,
                { color: saveButtonEnabled ? colors.onAccent : colors.textMuted },
              ]}
            >
              {saveButtonText}
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.dateText, { color: colors.textSecondary }]}>
            {note 
              ? formatDate(note.note_date) 
              : formatDate(noteDate || formatLocalDate(new Date()))}
          </Text>

          <TextInput
            ref={titleInputRef}
            style={[styles.titleInput, { color: colors.textPrimary }]}
            value={title}
            onChangeText={setTitle}
            placeholder="Заголовок"
            placeholderTextColor={colors.textMuted}
            multiline={false}
            returnKeyType="next"
          />

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <TextInput
            style={[styles.contentInput, { color: colors.textPrimary }]}
            value={content}
            onChangeText={setContent}
            placeholder="Напишите свои мысли..."
            placeholderTextColor={colors.textMuted}
            multiline
            textAlignVertical="top"
            scrollEnabled={false}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backButton: {
    padding: 8,
    minWidth: 70,
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: '500',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  unsavedDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  favoriteButton: {
    padding: 8,
    minWidth: 44,
    alignItems: 'center',
  },
  saveButtonWrapper: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  saveButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  saveButtonText: {
    fontSize: 17,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 100,
  },
  dateText: {
    fontSize: 13,
    marginBottom: 16,
  },
  titleInput: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 12,
    padding: 0,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginBottom: 16,
  },
  contentInput: {
    fontSize: 17,
    lineHeight: 24,
    minHeight: 200,
    padding: 0,
  },
});
