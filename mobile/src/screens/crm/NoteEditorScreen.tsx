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
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, Note } from '../../services/api';
import {
  ArrowLeft, Star, Check, PenLine, Calendar,
} from 'lucide-react-native';

// Форматируем дату в локальное YYYY-MM-DD
const formatLocalDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export default function NoteEditorScreen({ route, navigation }: any) {
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
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1F7A52" />
      </SafeAreaView>
    );
  }

  const isEditing = !!note;
  const saveButtonEnabled = !saving && (title.trim().length > 0 || content.trim().length > 0);
  const currentNoteDate = note 
    ? formatDate(note.note_date) 
    : formatDate(noteDate || formatLocalDate(new Date()));

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FAFAF8" />
      
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {/* Header row */}
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={handleBack} style={styles.backBtn} activeOpacity={0.85}>
            <ArrowLeft size={22} color="#141414" strokeWidth={2.2} />
          </TouchableOpacity>
          
          <View style={styles.headerCenter}>
            {isEditing && hasChanges() && (
              <View style={styles.unsavedDot} />
            )}
          </View>

          <TouchableOpacity
            onPress={toggleFavorite}
            activeOpacity={0.85}
            style={[styles.iconBtn, isFavorite && styles.iconBtnActiveFav]}
          >
            <Star
              size={20}
              color={isFavorite ? '#FFFFFF' : '#F59E0B'}
              fill={isFavorite ? '#FFFFFF' : '#F59E0B'}
              strokeWidth={2.2}
            />
          </TouchableOpacity>
        </View>

        {/* Big premium title */}
        <View style={styles.heroHeader}>
          <Text style={styles.bigTitle}>
            {isEditing ? 'РЕДАКТИРОВАНИЕ' : 'НОВАЯ ЗАМЕТКА'}
          </Text>
          <View style={styles.dateRow}>
            <Calendar size={14} color="#6F6F73" strokeWidth={2.2} />
            <Text style={styles.bigSubtitle}>{currentNoteDate}</Text>
          </View>
        </View>

        {/* Content */}
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <TextInput
            ref={titleInputRef}
            style={styles.titleInput}
            value={title}
            onChangeText={setTitle}
            placeholder="Заголовок заметки"
            placeholderTextColor="#BDBDBD"
            multiline={false}
            returnKeyType="next"
          />

          <View style={styles.divider} />

          <View style={styles.contentRow}>
            <PenLine size={18} color="#BDBDBD" strokeWidth={2} style={{ marginTop: 4 }} />
            <TextInput
              style={styles.contentInput}
              value={content}
              onChangeText={setContent}
              placeholder="Напишите свои мысли..."
              placeholderTextColor="#BDBDBD"
              multiline
              textAlignVertical="top"
              scrollEnabled={false}
            />
          </View>
        </ScrollView>

        {/* Floating Save button */}
        <TouchableOpacity
          onPress={handleSave}
          disabled={!saveButtonEnabled}
          activeOpacity={0.85}
          style={[
            styles.fab,
            !saveButtonEnabled && styles.fabDisabled,
          ]}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <Check size={22} color="#FFFFFF" strokeWidth={2.8} />
              <Text style={styles.fabText}>
                {isEditing ? 'Сохранить' : 'Создать'}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAF8' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FAFAF8' },

  // ===== HEADER ROW =====
  headerRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 12,
  },
  backBtn: {
    width: 44, height: 44, borderRadius: 14, backgroundColor: '#FFFFFF',
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.05, shadowRadius: 24, elevation: 4,
  },
  headerCenter: { flex: 1, alignItems: 'center' },
  unsavedDot: {
    width: 10, height: 10, borderRadius: 5, backgroundColor: '#1F7A52',
  },
  iconBtn: {
    width: 44, height: 44, borderRadius: 14, backgroundColor: '#FFFFFF',
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.05, shadowRadius: 24, elevation: 4,
  },
  iconBtnActiveFav: { backgroundColor: '#F59E0B' },

  // ===== HERO HEADER =====
  heroHeader: { paddingHorizontal: 24, marginBottom: 20, paddingTop: 8 },
  bigTitle: {
    fontFamily: Platform.OS === 'ios' ? 'Bebas Neue' : 'sans-serif-condensed',
    fontSize: 40, fontWeight: '900', color: '#141414', letterSpacing: -0.5, lineHeight: 44,
  },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  bigSubtitle: {
    fontFamily: Platform.OS === 'ios' ? 'Didot' : 'serif',
    fontSize: 18, fontStyle: 'italic', color: '#6F6F73',
  },

  // ===== CONTENT =====
  scrollView: { flex: 1 },
  scrollContent: { padding: 24, paddingBottom: 120 },
  titleInput: {
    fontSize: 32,
    fontWeight: '800',
    marginBottom: 16,
    padding: 0,
    color: '#141414',
    fontFamily: Platform.OS === 'ios' ? 'Montserrat' : 'sans-serif-medium',
  },
  divider: {
    height: 1,
    backgroundColor: '#ECECE8',
    marginBottom: 20,
  },
  contentRow: { flexDirection: 'row' },
  contentInput: {
    flex: 1,
    fontSize: 17,
    lineHeight: 26,
    minHeight: 300,
    padding: 0,
    paddingLeft: 12,
    color: '#141414',
    fontFamily: Platform.OS === 'ios' ? 'Montserrat' : 'sans-serif',
    fontWeight: '500',
  },

  // ===== FAB (Save button) =====
  fab: {
    position: 'absolute',
    right: 24,
    bottom: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderRadius: 22,
    backgroundColor: '#1F7A52',
    shadowColor: '#1F7A52',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  fabDisabled: { backgroundColor: '#D1D5DB', shadowOpacity: 0.1 },
  fabText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    fontFamily: Platform.OS === 'ios' ? 'Montserrat' : 'sans-serif-medium',
  },
});
