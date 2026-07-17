# Изменения от Ромы (коммиты 75af051 и e0c047c)

## Коммит 1: feat: модуль Заметки с календарём в стиле Apple Notes
## Коммит 2: feat: модуль KPI продаж с импортом Excel

---


## Файл: mobile/src/components/CalendarView.tsx

```
import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

interface DayWithNotes {
  note_date: string;
  note_count: number;
}

interface CalendarViewProps {
  currentMonth: Date;
  selectedDate: Date;
  daysWithNotes: DayWithNotes[];
  onDateSelect: (date: Date) => void;
  onMonthChange: (date: Date) => void;
}

const formatDateObj = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const normalizeDateStr = (dateStr: string): string => {
  if (!dateStr) return '';
  return dateStr.substring(0, 10);
};

export const CalendarView: React.FC<CalendarViewProps> = ({
  currentMonth,
  selectedDate,
  daysWithNotes,
  onDateSelect,
  onMonthChange,
}) => {
  const { colors } = useTheme();
  const [days, setDays] = useState<Date[]>([]);

  useEffect(() => {
    generateDays();
  }, [currentMonth]);

  const generateDays = () => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    const daysArray: Date[] = [];

    const startDayOfWeek = (firstDay.getDay() + 6) % 7;
    for (let i = 0; i < startDayOfWeek; i++) {
      daysArray.push(new Date(year, month, -startDayOfWeek + i + 1));
    }

    for (let d = 1; d <= lastDay.getDate(); d++) {
      daysArray.push(new Date(year, month, d));
    }

    const totalDays = daysArray.length;
    const extraDays = totalDays <= 35 ? 35 - totalDays : 42 - totalDays;
    for (let i = 1; i <= extraDays; i++) {
      daysArray.push(new Date(year, month + 1, i));
    }

    setDays(daysArray);
  };

  const getNoteCountForDate = (date: Date): number => {
    const localDateStr = formatDateObj(date);
    const found = daysWithNotes.find(d => normalizeDateStr(d.note_date) === localDateStr);
    return found ? Number(found.note_count) : 0;
  };

  const isToday = (date: Date): boolean => {
    return formatDateObj(date) === formatDateObj(new Date());
  };

  const isSelected = (date: Date): boolean => {
    return formatDateObj(date) === formatDateObj(selectedDate);
  };

  const isCurrentMonth = (date: Date): boolean => {
    return date.getMonth() === currentMonth.getMonth();
  };

  const goToPreviousMonth = () => {
    const newDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1);
    onMonthChange(newDate);
  };

  const goToNextMonth = () => {
    const newDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1);
    onMonthChange(newDate);
  };

  const monthNames = [
    'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
    'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
  ];

  const weekDays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]}>
      {/* Заголовок с навигацией */}
      <View style={styles.header}>
        <TouchableOpacity onPress={goToPreviousMonth} style={styles.navButton}>
          <Text style={[styles.navText, { color: colors.accent }]}>‹</Text>
        </TouchableOpacity>
        <Text style={[styles.monthTitle, { color: colors.textPrimary }]}>
          {monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}
        </Text>
        <TouchableOpacity onPress={goToNextMonth} style={styles.navButton}>
          <Text style={[styles.navText, { color: colors.accent }]}>›</Text>
        </TouchableOpacity>
      </View>

      {/* Дни недели */}
      <View style={styles.weekDaysRow}>
        {weekDays.map((day, index) => (
          <View key={index} style={styles.weekDayCell}>
            <Text style={[styles.weekDayText, { color: colors.textSecondary }]}>
              {day}
            </Text>
          </View>
        ))}
      </View>

      {/* Сетка дней */}
      <View style={styles.daysGrid}>
        {days.map((date, index) => {
          const noteCount = getNoteCountForDate(date);
          const today = isToday(date);
          const selected = isSelected(date);
          const inCurrentMonth = isCurrentMonth(date);

          return (
            <TouchableOpacity
              key={index}
              onPress={() => onDateSelect(date)}
              style={styles.dayCellWrapper}
              activeOpacity={0.7}
            >
              <View
                style={[
                  styles.dayCell,
                  selected && { backgroundColor: colors.accent },
                  today && !selected && { 
                    borderWidth: 1.5, 
                    borderColor: colors.accent 
                  },
                ]}
              >
                <Text
                  style={[
                    styles.dayText,
                    { color: selected ? colors.onAccent : (inCurrentMonth ? colors.textPrimary : colors.textMuted) },
                    today && !selected && { color: colors.accent, fontWeight: '700' },
                    !inCurrentMonth && { opacity: 0.3 },
                  ]}
                >
                  {date.getDate()}
                </Text>
                {noteCount > 0 && (
                  <View
                    style={[
                      styles.indicator,
                      { backgroundColor: selected ? colors.onAccent : colors.accent },
                    ]}
                  />
                )}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 12,
    borderRadius: 12,
    marginHorizontal: 16,
    marginTop: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  navButton: {
    padding: 8,
    minWidth: 44,
    alignItems: 'center',
  },
  navText: {
    fontSize: 28,
    fontWeight: '300',
  },
  monthTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  weekDaysRow: {
    flexDirection: 'row',
    marginBottom: 4,
    paddingHorizontal: 2,
  },
  weekDayCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
  },
  weekDayText: {
    fontSize: 12,
    fontWeight: '600',
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCellWrapper: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    padding: 2,
  },
  dayCell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    position: 'relative',
  },
  dayText: {
    fontSize: 15,
    fontWeight: '500',
    textAlign: 'center',
    textAlignVertical: 'center',
  },
  indicator: {
    width: 5,
    height: 5,
    borderRadius: 3,
    position: 'absolute',
    bottom: 5,
    alignSelf: 'center',
  },
});
```


## Файл: mobile/src/screens/crm/NoteEditorScreen.tsx

```
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
```


## Файл: mobile/src/screens/crm/AddProductKpiScreen.tsx

```
import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator, StatusBar,
} from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { api, MetricType } from '../../services/api';

const METRIC_OPTIONS: { id: MetricType; label: string; unit: string }[] = [
  { id: 'quantity', label: 'Количество (шт)', unit: 'шт' },
  { id: 'amount', label: 'Сумма (рублей)', unit: '₽' },
  { id: 'contracts', label: 'Контракты', unit: 'контр.' },
];

export default function AddProductKpiScreen({ navigation }: any) {
  const { colors } = useTheme();
  const [productName, setProductName] = useState('');
  const [metricType, setMetricType] = useState<MetricType>('quantity');
  const [targetValue, setTargetValue] = useState('');
  const [currentValue, setCurrentValue] = useState('0');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!productName.trim()) {
      Alert.alert('Ошибка', 'Введите название товара');
      return;
    }
    const target = parseFloat(targetValue);
    if (!target || target <= 0) {
      Alert.alert('Ошибка', 'Цель должна быть больше 0');
      return;
    }

    setSaving(true);
    try {
      await api.createSalesTarget({
        product_name: productName.trim(),
        metric_type: metricType,
        target_value: target,
        current_value: parseFloat(currentValue) || 0,
        description: description.trim() || undefined,
      });
      navigation.goBack();
    } catch (e: any) {
      Alert.alert('Ошибка', e.message || 'Не удалось создать KPI');
    } finally {
      setSaving(false);
    }
  };

  const currentUnit = METRIC_OPTIONS.find(m => m.id === metricType)?.unit || '';

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar 
        barStyle={colors.background === '#fff' ? 'dark-content' : 'light-content'} 
        backgroundColor={colors.background}
      />
      
      {/* Header */}
      <View style={[styles.header, { 
        borderBottomColor: colors.border,
        paddingTop: (StatusBar.currentHeight || 24) + 8,
      }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBtn}>
          <Text style={{ color: colors.accent, fontSize: 16 }}>Отмена</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Новый KPI</Text>
        <TouchableOpacity 
          onPress={handleCreate} 
          disabled={saving}
          style={styles.headerBtn}
        >
          <Text style={{ color: colors.accent, fontSize: 16, fontWeight: '600' }}>
            {saving ? '...' : 'Создать'}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Название товара */}
        <Text style={[styles.label, { color: colors.textSecondary }]}>Название товара / услуги</Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: colors.border }]}
          value={productName}
          onChangeText={setProductName}
          placeholder="Например: Премиум пакет"
          placeholderTextColor={colors.textMuted}
        />

        {/* Тип метрики */}
        <Text style={[styles.label, { color: colors.textSecondary }]}>Тип метрики</Text>
        <View style={styles.metricRow}>
          {METRIC_OPTIONS.map(opt => {
            const active = metricType === opt.id;
            return (
              <TouchableOpacity
                key={opt.id}
                onPress={() => setMetricType(opt.id)}
                style={[
                  styles.metricChip,
                  {
                    backgroundColor: active ? colors.accent : colors.surface,
                    borderColor: active ? colors.accent : colors.border,
                  },
                ]}
              >
                <Text style={{ 
                  color: active ? colors.onAccent : colors.textPrimary,
                  fontWeight: active ? '600' : '400',
                  fontSize: 13,
                }}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Целевое значение */}
        <Text style={[styles.label, { color: colors.textSecondary }]}>
          Цель ({currentUnit})
        </Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: colors.border }]}
          value={targetValue}
          onChangeText={setTargetValue}
          placeholder="50"
          placeholderTextColor={colors.textMuted}
          keyboardType="numeric"
        />

        {/* Текущее значение */}
        <Text style={[styles.label, { color: colors.textSecondary }]}>
          Уже достигнуто ({currentUnit}, опционально)
        </Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: colors.border }]}
          value={currentValue}
          onChangeText={setCurrentValue}
          placeholder="0"
          placeholderTextColor={colors.textMuted}
          keyboardType="numeric"
        />

        {/* Описание */}
        <Text style={[styles.label, { color: colors.textSecondary }]}>Описание (опционально)</Text>
        <TextInput
          style={[styles.input, styles.multilineInput, { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: colors.border }]}
          value={description}
          onChangeText={setDescription}
          placeholder="Дополнительная информация о цели"
          placeholderTextColor={colors.textMuted}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
        />

        {/* Кнопка Создать (дублирующая внизу) */}
        <TouchableOpacity
          onPress={handleCreate}
          disabled={saving}
          style={[
            styles.createBtn,
            { backgroundColor: saving ? colors.surface : colors.accent },
          ]}
        >
          {saving ? (
            <ActivityIndicator color={colors.onAccent} />
          ) : (
            <Text style={[styles.createBtnText, { color: colors.onAccent }]}>
              Создать KPI
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerBtn: { padding: 8, minWidth: 70 },
  headerTitle: { fontSize: 17, fontWeight: '600' },
  scrollContent: { padding: 20, paddingBottom: 60 },
  label: { fontSize: 13, fontWeight: '600', marginBottom: 6, marginTop: 14 },
  input: {
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    fontSize: 16,
  },
  multilineInput: { minHeight: 80 },
  metricRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  metricChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
  },
  createBtn: {
    marginTop: 30,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  createBtnText: { fontSize: 16, fontWeight: '600' },
});
```


## Файл: mobile/src/screens/crm/ImportExcelScreen.tsx

```
import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator,
  Alert, ScrollView, StatusBar,
} from 'react-native';
import { pick } from '@react-native-documents/picker';
import { useTheme } from '../../theme/ThemeContext';
import { api, ImportPreview } from '../../services/api';

type Step = 'pick' | 'preview' | 'importing' | 'done';

export default function ImportExcelScreen({ navigation }: any) {
  const { colors } = useTheme();
  const [step, setStep] = useState<Step>('pick');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number; totalAmount: number } | null>(null);

  const handlePickFile = async () => {
    try {
      setError(null);
      const results = await pick({
        type: [
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'text/csv',
        ],
        allowMultiSelection: false,
      });

      if (results && results.length > 0) {
        const file = results[0];
        setStep('preview');
        const data = await api.previewImport(file.uri, file.name, file.type || 'application/octet-stream');
        setPreview(data);
      }
    } catch (err: any) {
      if (err?.code === 'DOCUMENT_PICKER_CANCELED') {
        // Пользователь отменил — это нормально
      } else {
        console.error(err);
        setError(err.message || 'Ошибка чтения файла');
        setStep('pick');
      }
    }
  };

  const handleConfirmImport = async () => {
    if (!preview) return;
    setStep('importing');
    try {
      const result = await api.confirmImport(preview.importId, preview.suggestedMapping);
      setImportResult(result);
      setStep('done');
    } catch (err: any) {
      Alert.alert('Ошибка импорта', err.message || 'Не удалось сохранить данные');
      setStep('preview');
    }
  };

  const formatMoney = (val: number) => {
    return new Intl.NumberFormat('ru-RU').format(Math.round(val)) + ' ₽';
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar 
        barStyle={colors.background === '#fff' ? 'dark-content' : 'light-content'} 
        backgroundColor={colors.background}
      />
      
      {/* Header */}
      <View style={[styles.header, { 
        borderBottomColor: colors.border,
        paddingTop: (StatusBar.currentHeight || 24) + 8,
      }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBtn}>
          <Text style={{ color: colors.accent, fontSize: 16 }}>← Назад</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Импорт Excel</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        
        {/* ШАГ 1: Выбор файла */}
        {step === 'pick' && (
          <View style={styles.centerBlock}>
            <Text style={{ fontSize: 64, marginBottom: 16 }}>📁</Text>
            <Text style={[styles.mainText, { color: colors.textPrimary }]}>
              Выберите файл с продажами
            </Text>
            <Text style={[styles.subText, { color: colors.textSecondary }]}>
              Поддерживаются форматы .xlsx, .xls и .csv
            </Text>

            {error && (
              <View style={[styles.errorBox, { backgroundColor: '#FEE2E2' }]}>
                <Text style={{ color: '#991B1B', fontSize: 14 }}>⚠️ {error}</Text>
              </View>
            )}

            <TouchableOpacity
              onPress={handlePickFile}
              style={[styles.primaryBtn, { backgroundColor: colors.accent }]}
            >
              <Text style={[styles.primaryBtnText, { color: colors.onAccent }]}>
                Выбрать файл
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ШАГ 2: Превью */}
        {step === 'preview' && preview && (
          <View>
            <View style={[styles.infoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.infoTitle, { color: colors.textPrimary }]}>📄 {preview.fileName}</Text>
              <View style={styles.infoRow}>
                <Text style={{ color: colors.textSecondary }}>Найдено строк:</Text>
                <Text style={{ color: colors.textPrimary, fontWeight: '600' }}>{preview.totalRows}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={{ color: colors.textSecondary }}>Общая сумма:</Text>
                <Text style={{ color: colors.accent, fontWeight: '700', fontSize: 16 }}>
                  {formatMoney(preview.totalAmount)}
                </Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={{ color: colors.textSecondary }}>Корректных строк:</Text>
                <Text style={{ color: '#10B981', fontWeight: '600' }}>
                  {preview.validation.valid} из {Math.min(preview.totalRows, 10)} (проверено)
                </Text>
              </View>
            </View>

            {/* Превью таблицы */}
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
              Предпросмотр (первые 5 строк)
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
              <View style={[styles.table, { borderColor: colors.border }]}>
                {/* Заголовки */}
                <View style={[styles.tableRow, { backgroundColor: colors.surface }]}>
                  {preview.headers.map((h, i) => (
                    <Text key={i} style={[styles.tableCell, styles.tableHeader, { color: colors.textPrimary, borderColor: colors.border }]}>
                      {h}
                    </Text>
                  ))}
                </View>
                {/* Данные */}
                {preview.preview.map((row, rowIdx) => (
                  <View key={rowIdx} style={styles.tableRow}>
                    {preview.headers.map((h, i) => (
                      <Text key={i} style={[styles.tableCell, { color: colors.textSecondary, borderColor: colors.border }]}>
                        {String(row[h] || '').substring(0, 20)}
                      </Text>
                    ))}
                  </View>
                ))}
              </View>
            </ScrollView>

            {preview.validation.errors.length > 0 && (
              <View style={[styles.warningBox, { backgroundColor: '#FEF3C7' }]}>
                <Text style={{ color: '#92400E', fontWeight: '600', marginBottom: 4 }}>
                  ⚠️ Найдены ошибки:
                </Text>
                {preview.validation.errors.slice(0, 3).map((e, i) => (
                  <Text key={i} style={{ color: '#92400E', fontSize: 12 }}>• {e}</Text>
                ))}
                <Text style={{ color: '#92400E', fontSize: 12, marginTop: 4 }}>
                  Эти строки будут пропущены при импорте.
                </Text>
              </View>
            )}

            <TouchableOpacity
              onPress={handleConfirmImport}
              style={[styles.primaryBtn, { backgroundColor: colors.accent }]}
            >
              <Text style={[styles.primaryBtnText, { color: colors.onAccent }]}>
                Импортировать {preview.totalRows} строк
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ШАГ 3: Загрузка */}
        {step === 'importing' && (
          <View style={styles.centerBlock}>
            <ActivityIndicator size="large" color={colors.accent} />
            <Text style={[styles.mainText, { color: colors.textPrimary, marginTop: 16 }]}>
              Сохраняем данные...
            </Text>
          </View>
        )}

        {/* ШАГ 4: Успех */}
        {step === 'done' && importResult && (
          <View style={styles.centerBlock}>
            <Text style={{ fontSize: 64, marginBottom: 16 }}>✅</Text>
            <Text style={[styles.mainText, { color: colors.textPrimary }]}>
              Импорт завершён!
            </Text>
            <Text style={[styles.subText, { color: colors.textSecondary, marginBottom: 20 }]}>
              Добавлено: {importResult.imported} строк{'\n'}
              Пропущено: {importResult.skipped} строк{'\n'}
              Сумма: {formatMoney(importResult.totalAmount)}
            </Text>
            
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              style={[styles.primaryBtn, { backgroundColor: colors.accent }]}
            >
              <Text style={[styles.primaryBtnText, { color: colors.onAccent }]}>
                Вернуться к статистике
              </Text>
            </TouchableOpacity>
          </View>
        )}

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerBtn: { padding: 8, minWidth: 60 },
  headerTitle: { fontSize: 17, fontWeight: '600' },
  scrollContent: { padding: 20, paddingBottom: 60 },
  centerBlock: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
  mainText: { fontSize: 20, fontWeight: '700', textAlign: 'center', marginBottom: 8 },
  subText: { fontSize: 14, textAlign: 'center', marginBottom: 24 },
  primaryBtn: {
    width: '100%',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 10,
  },
  primaryBtnText: { fontSize: 16, fontWeight: '600' },
  errorBox: { padding: 12, borderRadius: 8, marginBottom: 16, width: '100%' },
  warningBox: { padding: 12, borderRadius: 8, marginBottom: 20 },
  infoCard: { padding: 16, borderRadius: 12, borderWidth: 1, marginBottom: 20 },
  infoTitle: { fontSize: 15, fontWeight: '600', marginBottom: 12 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  sectionTitle: { fontSize: 15, fontWeight: '600', marginBottom: 10 },
  table: { borderWidth: 1, borderRadius: 8, overflow: 'hidden', marginBottom: 10 },
  tableRow: { flexDirection: 'row' },
  tableCell: { padding: 8, minWidth: 100, borderRightWidth: 1, borderBottomWidth: 1 },
  tableHeader: { fontWeight: '700' },
});
```


## Файл: server/src/db/migrations/006_notes.sql

```
-- Миграция 006: Модуль Заметок (Notes)
CREATE TABLE IF NOT EXISTS notes (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) DEFAULT '',
    content TEXT DEFAULT '',
    is_favorite BOOLEAN DEFAULT FALSE,
    task_id INT REFERENCES tasks(id) ON DELETE SET NULL, -- Связь с задачами (на будущее)
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Индексы для быстрой работы
CREATE INDEX IF NOT EXISTS idx_notes_user_id ON notes(user_id);
CREATE INDEX IF NOT EXISTS idx_notes_favorite ON notes(user_id, is_favorite) WHERE is_favorite = TRUE;
CREATE INDEX IF NOT EXISTS idx_notes_task_id ON notes(task_id) WHERE task_id IS NOT NULL;
```


## Файл: server/src/db/migrations/006_notes_update.sql

```
-- Миграция 006: Обновление таблицы notes для календаря

-- Добавить колонку note_date (дата заметки для календаря)
ALTER TABLE notes ADD COLUMN IF NOT EXISTS note_date DATE;

-- Заполнить note_date существующих заметок датой создания
UPDATE notes 
SET note_date = DATE(created_at) 
WHERE note_date IS NULL;

-- Сделать note_date обязательной
ALTER TABLE notes ALTER COLUMN note_date SET NOT NULL;

-- Установить значение по умолчанию (сегодня)
ALTER TABLE notes ALTER COLUMN note_date SET DEFAULT CURRENT_DATE;

-- Индекс для быстрого поиска заметок по дате
CREATE INDEX IF NOT EXISTS idx_notes_user_date ON notes(user_id, note_date);

-- Индекс для быстрого поиска заметок за месяц
CREATE INDEX IF NOT EXISTS idx_notes_month ON notes(user_id, DATE_TRUNC('month', note_date));

-- Индекс для избранных заметок
CREATE INDEX IF NOT EXISTS idx_notes_favorite ON notes(user_id, is_favorite) WHERE is_favorite = TRUE;
```


## Файл: server/src/db/migrations/007_sales.sql

```
-- Миграция 007: KPI продаж (цели + транзакции + импорты)

-- === ЦЕЛИ ПРОДАЖ ===
-- Общий план отдела или индивидуальный KPI по товару
CREATE TABLE IF NOT EXISTS sales_targets (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Признак плана отдела (один на отдел)
    is_department_target BOOLEAN DEFAULT FALSE,
    department_id INT,
    
    -- KPI по конкретному товару
    product_name VARCHAR(255),
    metric_type VARCHAR(50) DEFAULT 'quantity', -- quantity | amount | contracts
    target_value DECIMAL(15,2) NOT NULL,
    current_value DECIMAL(15,2) DEFAULT 0,
    
    -- Период действия KPI
    period_start DATE NOT NULL DEFAULT CURRENT_DATE,
    period_end DATE NOT NULL DEFAULT (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month - 1 day'),
    
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- === ТРАНЗАКЦИИ (ФАКТ ПРОДАЖ) ===
CREATE TABLE IF NOT EXISTS sales_transactions (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_id INT REFERENCES sales_targets(id) ON DELETE SET NULL,
    
    product_name VARCHAR(255) NOT NULL,
    quantity DECIMAL(15,2) DEFAULT 1,
    amount DECIMAL(15,2) DEFAULT 0,
    
    transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
    client_name VARCHAR(255),
    notes TEXT,
    
    import_id INT, -- если из импорта Excel
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- === ИСТОРИЯ ИМПОРТОВ EXCEL ===
CREATE TABLE IF NOT EXISTS sales_imports (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    file_name VARCHAR(255) NOT NULL,
    file_size INT,
    
    total_rows INT DEFAULT 0,
    imported_rows INT DEFAULT 0,
    skipped_rows INT DEFAULT 0,
    
    total_amount DECIMAL(15,2) DEFAULT 0,
    status VARCHAR(20) DEFAULT 'pending', -- pending | completed | failed
    
    error_log JSONB,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- === ИНДЕКСЫ ===
CREATE INDEX IF NOT EXISTS idx_sales_targets_user 
    ON sales_targets(user_id);
CREATE INDEX IF NOT EXISTS idx_sales_targets_dept 
    ON sales_targets(department_id) 
    WHERE is_department_target = TRUE;
CREATE INDEX IF NOT EXISTS idx_sales_targets_period 
    ON sales_targets(period_start, period_end);

CREATE INDEX IF NOT EXISTS idx_sales_transactions_user 
    ON sales_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_sales_transactions_target 
    ON sales_transactions(target_id);
CREATE INDEX IF NOT EXISTS idx_sales_transactions_date 
    ON sales_transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_sales_transactions_import 
    ON sales_transactions(import_id);

CREATE INDEX IF NOT EXISTS idx_sales_imports_user 
    ON sales_imports(user_id);
```


## Файл: server/src/db/migrations/008_sales_refactor.sql

```
-- Миграция 008: Переделка архитектуры KPI продаж
-- Концепция: у каждого менеджера свой личный план на месяц

-- 1. Переименовать поле
ALTER TABLE sales_targets 
RENAME COLUMN is_department_target TO is_personal_monthly_target;

-- 2. Удалить department_id (больше не нужен)
ALTER TABLE sales_targets 
DROP COLUMN IF EXISTS department_id;

-- 3. Добавить поле created_by (кто назначил план — руководитель)
ALTER TABLE sales_targets 
ADD COLUMN IF NOT EXISTS created_by INT REFERENCES users(id) ON DELETE SET NULL;

-- 4. Добавить индекс для быстрого поиска активного плана
CREATE INDEX IF NOT EXISTS idx_sales_targets_personal_monthly 
ON sales_targets(user_id, is_personal_monthly_target) 
WHERE is_personal_monthly_target = TRUE;

-- 5. Обновить существующие данные (если есть)
UPDATE sales_targets 
SET is_personal_monthly_target = TRUE 
WHERE is_personal_monthly_target = FALSE 
  AND product_name IS NULL;

-- 6. Показать результат
SELECT id, user_id, is_personal_monthly_target, product_name, 
       target_value, current_value 
FROM sales_targets 
ORDER BY id;
```


## Файл: server/src/routes/notes.ts

```
import { Router, Request, Response } from 'express';
import { Pool } from 'pg';

const router = Router();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

// GET /api/notes - Получить заметки с фильтрами
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { month, date, favorite } = req.query;
    
    let query = `SELECT id, user_id, title, content, is_favorite, 
                        TO_CHAR(note_date, 'YYYY-MM-DD') as note_date,
                        created_at, updated_at 
                 FROM notes WHERE user_id = $1`;
    const params: any[] = [userId];
    let paramIndex = 2;
    
    if (month) {
      query += ` AND TO_CHAR(note_date, 'YYYY-MM') = $${paramIndex}`;
      params.push(month);
      paramIndex++;
    }
    
    if (date) {
      query += ` AND note_date = $${paramIndex}::date`;
      params.push(date);
      paramIndex++;
    }
    
    if (favorite === 'true') {
      query += ' AND is_favorite = TRUE';
    }
    
    query += ' ORDER BY updated_at DESC';
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Ошибка получения заметок:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// GET /api/notes/days-with-notes - Получить дни с заметками за месяц
router.get('/days-with-notes', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { month } = req.query;
    
    if (!month) {
      return res.status(400).json({ error: 'Параметр month обязателен (формат: YYYY-MM)' });
    }
    
    const result = await pool.query(
      `SELECT TO_CHAR(note_date, 'YYYY-MM-DD') as note_date, COUNT(*) as note_count 
       FROM notes 
       WHERE user_id = $1 
         AND TO_CHAR(note_date, 'YYYY-MM') = $2
       GROUP BY note_date
       ORDER BY note_date`,
      [userId, month]
    );
    
    res.json(result.rows);
  } catch (error) {
    console.error('Ошибка получения дней с заметками:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/notes - Создать новую заметку
router.post('/', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { title = '', content = '', note_date, is_favorite = false } = req.body;
    
    const dateToUse = note_date || new Date().toISOString().split('T')[0];
    
    const result = await pool.query(
      `INSERT INTO notes (user_id, title, content, note_date, is_favorite) 
       VALUES ($1, $2, $3, $4, $5) 
       RETURNING id, user_id, title, content, is_favorite, 
                 TO_CHAR(note_date, 'YYYY-MM-DD') as note_date,
                 created_at, updated_at`,
      [userId, title, content, dateToUse, is_favorite]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Ошибка создания заметки:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// PATCH /api/notes/:id - Обновить заметку
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const noteId = parseInt(req.params.id);
    const { title, content, is_favorite, note_date } = req.body;
    
    const checkResult = await pool.query(
      'SELECT user_id FROM notes WHERE id = $1',
      [noteId]
    );
    
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Заметка не найдена' });
    }
    
    if (checkResult.rows[0].user_id !== userId) {
      return res.status(403).json({ error: 'Нет доступа к заметке' });
    }
    
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;
    
    if (title !== undefined) {
      updates.push(`title = $${paramIndex++}`);
      values.push(title);
    }
    
    if (content !== undefined) {
      updates.push(`content = $${paramIndex++}`);
      values.push(content);
    }
    
    if (is_favorite !== undefined) {
      updates.push(`is_favorite = $${paramIndex++}`);
      values.push(is_favorite);
    }
    
    if (note_date !== undefined) {
      updates.push(`note_date = $${paramIndex++}::date`);
      values.push(note_date);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'Нет данных для обновления' });
    }
    
    updates.push(`updated_at = NOW()`);
    values.push(noteId);
    
    const query = `
      UPDATE notes 
      SET ${updates.join(', ')} 
      WHERE id = $${paramIndex}
      RETURNING id, user_id, title, content, is_favorite, 
                TO_CHAR(note_date, 'YYYY-MM-DD') as note_date,
                created_at, updated_at
    `;
    
    const result = await pool.query(query, values);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Ошибка обновления заметки:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// DELETE /api/notes/:id - Удалить заметку
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const noteId = parseInt(req.params.id);
    
    const result = await pool.query(
      'DELETE FROM notes WHERE id = $1 AND user_id = $2 RETURNING id',
      [noteId, userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Заметка не найдена' });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Ошибка удаления заметки:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

export default router;
```


## Файл: server/src/routes/kpiSales.ts

```
import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import multer from 'multer';
import xlsx from 'xlsx';
import fs from 'fs';
import path from 'path';

const router = Router();

const importsDir = path.join(__dirname, '../../uploads/imports');
if (!fs.existsSync(importsDir)) {
  fs.mkdirSync(importsDir, { recursive: true });
}

const upload = multer({ dest: importsDir });

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'mesnation',
});

// ===================== ЦЕЛИ ПРОДАЖ =====================

// GET /api/kpi/sales/targets — мои цели (товарные KPI)
router.get('/targets', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    
    const result = await pool.query(
      `SELECT st.*, 
              ROUND((st.current_value / st.target_value * 100)::numeric, 1) as progress_percent
       FROM sales_targets st
       WHERE st.user_id = $1 
         AND st.is_personal_monthly_target = FALSE
       ORDER BY st.created_at DESC`,
      [userId]
    );
    
    res.json(result.rows);
  } catch (error) {
    console.error('Ошибка получения целей:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// GET /api/kpi/sales/targets/my-monthly — мой активный план на месяц
router.get('/targets/my-monthly', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    
    const result = await pool.query(
      `SELECT *, 
              ROUND((current_value / target_value * 100)::numeric, 1) as progress_percent
       FROM sales_targets 
       WHERE user_id = $1 
         AND is_personal_monthly_target = TRUE
         AND period_start <= CURRENT_DATE 
         AND period_end >= CURRENT_DATE
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId]
    );
    
    res.json(result.rows[0] || null);
  } catch (error) {
    console.error('Ошибка получения плана:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/kpi/sales/targets — создать товарный KPI
router.post('/targets', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const {
      product_name,
      metric_type = 'quantity',
      target_value,
      current_value = 0,
      period_start,
      period_end,
      description,
    } = req.body;
    
    if (!target_value || target_value <= 0) {
      return res.status(400).json({ error: 'Целевое значение должно быть больше 0' });
    }
    
    if (!product_name) {
      return res.status(400).json({ error: 'Название товара обязательно' });
    }
    
    const result = await pool.query(
      `INSERT INTO sales_targets 
         (user_id, product_name, metric_type, target_value, current_value, 
          period_start, period_end, description, is_personal_monthly_target)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, FALSE)
       RETURNING *`,
      [
        userId, 
        product_name, 
        metric_type, 
        target_value, 
        current_value,
        period_start || new Date(), 
        period_end || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        description
      ]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Ошибка создания цели:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/kpi/sales/targets/personal-monthly — назначить личный план (руководитель)
router.post('/targets/personal-monthly', async (req: Request, res: Response) => {
  try {
    const managerId = (req as any).userId;
    const {
      user_id,
      target_value,
      period_start,
      period_end,
      description,
    } = req.body;
    
    if (!user_id) {
      return res.status(400).json({ error: 'Не указан пользователь' });
    }
    
    if (!target_value || target_value <= 0) {
      return res.status(400).json({ error: 'Целевое значение должно быть больше 0' });
    }
    
    // TODO: Проверить, что managerId является руководителем user_id
    // (через role_tree)
    
    // Деактивировать старые планы этого пользователя
    await pool.query(
      `UPDATE sales_targets 
       SET period_end = CURRENT_DATE - INTERVAL '1 day'
       WHERE user_id = $1 
         AND is_personal_monthly_target = TRUE
         AND period_end >= CURRENT_DATE`,
      [user_id]
    );
    
    // Создать новый план
    const result = await pool.query(
      `INSERT INTO sales_targets 
         (user_id, metric_type, target_value, current_value, 
          period_start, period_end, description, 
          is_personal_monthly_target, created_by)
       VALUES ($1, 'amount', $2, 0, $3, $4, $5, TRUE, $6)
       RETURNING *`,
      [
        user_id,
        target_value,
        period_start || new Date(),
        period_end || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        description,
        managerId
      ]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Ошибка назначения плана:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// PATCH /api/kpi/sales/targets/:id — обновить цель
router.patch('/targets/:id', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const targetId = parseInt(req.params.id);
    const { current_value, target_value, description } = req.body;
    
    const check = await pool.query(
      'SELECT user_id FROM sales_targets WHERE id = $1',
      [targetId]
    );
    
    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Цель не найдена' });
    }
    
    if (check.rows[0].user_id !== userId) {
      return res.status(403).json({ error: 'Нет доступа' });
    }
    
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;
    
    if (current_value !== undefined) {
      updates.push(`current_value = $${paramIndex++}`);
      values.push(current_value);
    }
    if (target_value !== undefined) {
      updates.push(`target_value = $${paramIndex++}`);
      values.push(target_value);
    }
    if (description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(description);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'Нет данных для обновления' });
    }
    
    updates.push('updated_at = NOW()');
    values.push(targetId);
    
    const result = await pool.query(
      `UPDATE sales_targets 
       SET ${updates.join(', ')} 
       WHERE id = $${paramIndex} 
       RETURNING *`,
      values
    );
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Ошибка обновления цели:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// DELETE /api/kpi/sales/targets/:id
router.delete('/targets/:id', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const targetId = parseInt(req.params.id);
    
    const result = await pool.query(
      'DELETE FROM sales_targets WHERE id = $1 AND user_id = $2 RETURNING id',
      [targetId, userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Цель не найдена' });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Ошибка удаления:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ===================== ТРАНЗАКЦИИ =====================

// GET /api/kpi/sales/transactions — история продаж
router.get('/transactions', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { target_id, period } = req.query;
    
    let query = 'SELECT * FROM sales_transactions WHERE user_id = $1';
    const params: any[] = [userId];
    let paramIndex = 2;
    
    if (target_id) {
      query += ` AND target_id = $${paramIndex++}`;
      params.push(target_id);
    }
    
    if (period === 'month') {
      query += ` AND transaction_date >= DATE_TRUNC('month', CURRENT_DATE)`;
    } else if (period === 'week') {
      query += ` AND transaction_date >= CURRENT_DATE - INTERVAL '7 days'`;
    }
    
    query += ' ORDER BY transaction_date DESC, created_at DESC LIMIT 100';
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Ошибка получения транзакций:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/kpi/sales/transactions — добавить продажу вручную
router.post('/transactions', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const {
      product_name,
      quantity = 1,
      amount = 0,
      transaction_date,
      client_name,
      notes,
      target_id,
    } = req.body;
    
    if (!product_name) {
      return res.status(400).json({ error: 'Название товара обязательно' });
    }
    
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      const txResult = await client.query(
        `INSERT INTO sales_transactions 
           (user_id, target_id, product_name, quantity, amount, transaction_date, client_name, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [userId, target_id || null, product_name, quantity, amount, 
         transaction_date || new Date(), client_name, notes]
      );
      
      if (target_id) {
        const targetCheck = await client.query(
          'SELECT metric_type FROM sales_targets WHERE id = $1',
          [target_id]
        );
        
        if (targetCheck.rows.length > 0) {
          const increment = targetCheck.rows[0].metric_type === 'amount' ? amount : quantity;
          await client.query(
            `UPDATE sales_targets 
             SET current_value = current_value + $1, updated_at = NOW()
             WHERE id = $2`,
            [increment, target_id]
          );
        }
      }
      
      await client.query('COMMIT');
      res.status(201).json(txResult.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Ошибка добавления транзакции:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ===================== ИМПОРТ EXCEL =====================

// POST /api/kpi/sales/import/preview
router.post('/import/preview', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const file = req.file;
    
    if (!file) {
      return res.status(400).json({ error: 'Нет файла' });
    }
    
    const workbook = xlsx.readFile(file.path);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(sheet, { defval: '' });
    
    if (data.length === 0) {
      fs.unlinkSync(file.path);
      return res.status(400).json({ error: 'Файл пустой или не содержит данных' });
    }
    
    const headers = Object.keys(data[0] as any);
    const suggestedMapping: Record<string, string | null> = {
      product_name: headers.find(h => /товар|product|название|наименование|item/i.test(h)) || headers[0] || null,
      quantity: headers.find(h => /кол|quantity|шт|count|количество/i.test(h)) || null,
      amount: headers.find(h => /сумма|amount|цена|price|руб|стоимость/i.test(h)) || null,
      transaction_date: headers.find(h => /дата|date/i.test(h)) || null,
      client_name: headers.find(h => /клиент|client|покупатель|customer/i.test(h)) || null,
      notes: headers.find(h => /коммент|note|примечание|comment|описание/i.test(h)) || null,
    };
    
    const importResult = await pool.query(
      `INSERT INTO sales_imports (user_id, file_name, file_size, total_rows, status)
       VALUES ($1, $2, $3, $4, 'pending')
       RETURNING id`,
      [userId, file.originalname, file.size, data.length]
    );
    
    const importId = importResult.rows[0].id;
    
    const validation = {
      valid: 0,
      invalid: 0,
      errors: [] as string[],
    };
    
    const sampleSize = Math.min(data.length, 10);
    for (let i = 0; i < sampleSize; i++) {
      const row = data[i] as any;
      if (suggestedMapping.product_name && row[suggestedMapping.product_name]) {
        validation.valid++;
      } else {
        validation.invalid++;
        validation.errors.push(`Строка ${i + 2}: нет названия товара`);
      }
    }
    
    const permanentPath = path.join(importsDir, `${importId}.xlsx`);
    fs.renameSync(file.path, permanentPath);
    
    let totalAmount = 0;
    if (suggestedMapping.amount) {
      for (const row of data) {
        const amount = parseFloat(String((row as any)[suggestedMapping.amount!] || '0').replace(/[^\d.-]/g, ''));
        if (!isNaN(amount)) totalAmount += amount;
      }
    }
    
    res.json({
      importId,
      fileName: file.originalname,
      totalRows: data.length,
      preview: data.slice(0, 5),
      headers,
      suggestedMapping,
      validation,
      totalAmount,
    });
  } catch (error) {
    console.error('Ошибка парсинга:', error);
    res.status(500).json({ error: 'Ошибка чтения файла' });
  }
});

// POST /api/kpi/sales/import/confirm
router.post('/import/confirm', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { importId, mapping } = req.body;
    
    const importCheck = await pool.query(
      'SELECT * FROM sales_imports WHERE id = $1 AND user_id = $2',
      [importId, userId]
    );
    
    if (importCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Импорт не найден' });
    }
    
    const filePath = path.join(importsDir, `${importId}.xlsx`);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Файл не найден' });
    }
    
    const workbook = xlsx.readFile(filePath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = xlsx.utils.sheet_to_json(sheet, { defval: '' });
    
    const parseDate = (val: any): Date => {
      if (!val) return new Date();
      if (val instanceof Date) return val;
      if (typeof val === 'number') {
        return new Date((val - 25569) * 86400 * 1000);
      }
      const str = String(val);
      const dmy = str.match(/(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})/);
      if (dmy) {
        let year = parseInt(dmy[3]);
        if (year < 100) year += 2000;
        return new Date(year, parseInt(dmy[2]) - 1, parseInt(dmy[1]));
      }
      const ymd = str.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
      if (ymd) {
        return new Date(parseInt(ymd[1]), parseInt(ymd[2]) - 1, parseInt(ymd[3]));
      }
      return new Date(str);
    };
    
    const parseNumber = (val: any): number => {
      if (!val) return 0;
      const num = parseFloat(String(val).replace(/[^\d.-]/g, ''));
      return isNaN(num) ? 0 : num;
    };
    
    const transactions: any[] = [];
    const errors: string[] = [];
    
    for (let i = 0; i < data.length; i++) {
      const row = data[i] as any;
      
      const productName = mapping.product_name 
        ? String(row[mapping.product_name] || '').trim() 
        : '';
      
      if (!productName) {
        errors.push(`Строка ${i + 2}: нет названия товара`);
        continue;
      }
      
      transactions.push({
        product_name: productName,
        quantity: mapping.quantity ? parseNumber(row[mapping.quantity]) || 1 : 1,
        amount: mapping.amount ? parseNumber(row[mapping.amount]) : 0,
        transaction_date: mapping.transaction_date ? parseDate(row[mapping.transaction_date]) : new Date(),
        client_name: mapping.client_name ? String(row[mapping.client_name] || '').trim() || null : null,
        notes: mapping.notes ? String(row[mapping.notes] || '').trim() || null : null,
      });
    }
    
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      for (const t of transactions) {
        await client.query(
          `INSERT INTO sales_transactions 
             (user_id, import_id, product_name, quantity, amount, transaction_date, client_name, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [userId, importId, t.product_name, t.quantity, t.amount, 
           t.transaction_date, t.client_name, t.notes]
        );
      }
      
      const totalAmount = transactions.reduce((sum, t) => sum + t.amount, 0);
      
      await client.query(
        `UPDATE sales_imports 
         SET imported_rows = $1, skipped_rows = $2, total_amount = $3, 
             status = 'completed', completed_at = NOW(), error_log = $4
         WHERE id = $5`,
        [transactions.length, errors.length, totalAmount, JSON.stringify(errors), importId]
      );
      
      await client.query('COMMIT');
      
      res.json({
        success: true,
        imported: transactions.length,
        skipped: errors.length,
        totalAmount,
        errors: errors.slice(0, 10),
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Ошибка импорта:', error);
    res.status(500).json({ error: 'Ошибка импорта' });
  }
});

// GET /api/kpi/sales/import/history
router.get('/import/history', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const result = await pool.query(
      `SELECT * FROM sales_imports WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`,
      [userId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Ошибка:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ===================== СВОДКА =====================

// GET /api/kpi/sales/summary
router.get('/summary', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { period = 'month' } = req.query;
    
    let dateFilter = '';
    if (period === 'week') {
      dateFilter = `AND transaction_date >= CURRENT_DATE - INTERVAL '7 days'`;
    } else if (period === 'month') {
      dateFilter = `AND transaction_date >= DATE_TRUNC('month', CURRENT_DATE)`;
    } else if (period === 'quarter') {
      dateFilter = `AND transaction_date >= DATE_TRUNC('quarter', CURRENT_DATE)`;
    }
    
    const factResult = await pool.query(
      `SELECT 
         COALESCE(SUM(amount), 0) as total_amount,
         COALESCE(SUM(quantity), 0) as total_quantity,
         COUNT(*) as total_transactions
       FROM sales_transactions
       WHERE user_id = $1 ${dateFilter}`,
      [userId]
    );
    
    const targetsResult = await pool.query(
      `SELECT *, 
              ROUND((current_value / target_value * 100)::numeric, 1) as progress_percent
       FROM sales_targets 
       WHERE user_id = $1 
         AND period_start <= CURRENT_DATE 
         AND period_end >= CURRENT_DATE
         AND is_personal_monthly_target = FALSE
       ORDER BY created_at DESC`,
      [userId]
    );
    
    const personalTargetResult = await pool.query(
      `SELECT *,
              ROUND((current_value / target_value * 100)::numeric, 1) as progress_percent
       FROM sales_targets 
       WHERE user_id = $1
         AND is_personal_monthly_target = TRUE
         AND period_start <= CURRENT_DATE 
         AND period_end >= CURRENT_DATE
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId]
    );
    
    const topProductsResult = await pool.query(
      `SELECT 
         product_name,
         SUM(quantity) as total_quantity,
         SUM(amount) as total_amount,
         COUNT(*) as transactions_count
       FROM sales_transactions
       WHERE user_id = $1 ${dateFilter}
       GROUP BY product_name
       ORDER BY total_amount DESC
       LIMIT 10`,
      [userId]
    );
    
    res.json({
      fact: factResult.rows[0],
      targets: targetsResult.rows,
      personalTarget: personalTargetResult.rows[0] || null,
      topProducts: topProductsResult.rows,
      period,
    });
  } catch (error) {
    console.error('Ошибка:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

export default router;
```


## Файл: mobile/src/screens/crm/NotesScreen.tsx

```
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
```


## Файл: mobile/src/screens/crm/KpiScreen.tsx

```
import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  RefreshControl, ActivityIndicator, StatusBar,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../../theme/ThemeContext';
import { Card } from '../../components/ui/Card';
import { api, SalesSummary, SalesTarget } from '../../services/api';

type Period = 'week' | 'month' | 'quarter';

const PERIODS: { id: Period; label: string }[] = [
  { id: 'week', label: 'Неделя' },
  { id: 'month', label: 'Месяц' },
  { id: 'quarter', label: 'Квартал' },
];

const formatMoney = (value: number | string): string => {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '0 ₽';
  return new Intl.NumberFormat('ru-RU').format(Math.round(num)) + ' ₽';
};

const getProgressColor = (percent: number, colors: any): string => {
  if (percent >= 80) return '#10B981'; // зелёный
  if (percent >= 50) return '#F59E0B'; // жёлтый
  return '#EF4444'; // красный
};

export default function KpiScreen({ navigation }: any) {
  const { colors } = useTheme();
  const [period, setPeriod] = useState<Period>('month');
  const [summary, setSummary] = useState<SalesSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const data = await api.getSalesSummary(period);
      setSummary(data);
    } catch (e) {
      console.error('Ошибка загрузки KPI:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [period]);

  useFocusEffect(useCallback(() => {
    loadData();
  }, [loadData]));

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const calculateForecast = (target: SalesTarget): number => {
    const start = new Date(target.period_start).getTime();
    const end = new Date(target.period_end).getTime();
    const now = Date.now();
    const totalDays = (end - start) / (1000 * 60 * 60 * 24);
    const passedDays = (now - start) / (1000 * 60 * 60 * 24);
    
    if (passedDays <= 0 || totalDays <= 0) return 0;
    const dailyRate = Number(target.current_value) / passedDays;
    return Math.round(dailyRate * totalDays);
  };

  const daysRemaining = (target: SalesTarget): number => {
    const end = new Date(target.period_end).getTime();
    const now = Date.now();
    return Math.max(0, Math.ceil((end - now) / (1000 * 60 * 60 * 24)));
  };

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  const personalTarget = summary?.personalTarget;
  const myTargets = summary?.targets || [];
  const fact = summary?.fact;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar 
        barStyle={colors.background === '#fff' ? 'dark-content' : 'light-content'} 
        backgroundColor={colors.background}
      />
      
      {/* Header с отступом под статус-бар */}
      <View style={[styles.header, { paddingTop: (StatusBar.currentHeight || 24) + 8 }]}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Статистика</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Переключатель периода */}
        <View style={styles.periodRow}>
          {PERIODS.map(p => {
            const active = period === p.id;
            return (
              <TouchableOpacity
                key={p.id}
                onPress={() => setPeriod(p.id)}
                style={[
                  styles.periodChip,
                  {
                    backgroundColor: active ? colors.accent : colors.surface,
                    borderColor: active ? colors.accent : colors.border,
                  },
                ]}
              >
                <Text
                  style={{
                    color: active ? colors.onAccent : colors.textPrimary,
                    fontWeight: active ? '600' : '400',
                    fontSize: 13,
                  }}
                >
                  {p.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* План отдела (если есть) */}
        {personalTarget && (
          <Card padding="lg" style={{ marginBottom: 16 }}>
            <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
              💰 МОЙ ПЛАН НА МЕСЯЦ
            </Text>
            <Text style={[styles.bigNumber, { color: colors.textPrimary }]}>
              {formatMoney(personalTarget.current_value)}
            </Text>
            <Text style={[styles.subNumber, { color: colors.textSecondary }]}>
              из {formatMoney(personalTarget.target_value)}
            </Text>

            <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${Math.min(100, Number(personalTarget.progress_percent || 0))}%`,
                    backgroundColor: getProgressColor(Number(personalTarget.progress_percent || 0), colors),
                  },
                ]}
              />
            </View>

            <View style={styles.progressMeta}>
              <Text style={[styles.progressPercent, { color: colors.textPrimary }]}>
                {personalTarget.progress_percent}% выполнено
              </Text>
              <Text style={[styles.daysLeft, { color: colors.textSecondary }]}>
                Осталось {daysRemaining(personalTarget)} дн.
              </Text>
            </View>

            <View style={[styles.forecastBlock, { backgroundColor: colors.background }]}>
              <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                📈 Прогноз к концу месяца:{' '}
                <Text style={{ color: colors.textPrimary, fontWeight: '600' }}>
                  {formatMoney(calculateForecast(personalTarget))}
                </Text>
              </Text>
            </View>
          </Card>
        )}

        {/* Сводка (3 карточки) */}
        {fact && (
          <View style={styles.statsGrid}>
            <View style={[styles.statCard, { backgroundColor: colors.surface }]}>
              <Text style={styles.statEmoji}>💰</Text>
              <Text style={[styles.statValue, { color: colors.textPrimary }]}>
                {formatMoney(fact.total_amount)}
              </Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Сумма</Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: colors.surface }]}>
              <Text style={styles.statEmoji}>📦</Text>
              <Text style={[styles.statValue, { color: colors.textPrimary }]}>
                {Number(fact.total_quantity).toFixed(0)}
              </Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Единиц</Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: colors.surface }]}>
              <Text style={styles.statEmoji}>📋</Text>
              <Text style={[styles.statValue, { color: colors.textPrimary }]}>
                {fact.total_transactions}
              </Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Сделок</Text>
            </View>
          </View>
        )}

        {/* Действия: импорт Excel */}
        <TouchableOpacity
          onPress={() => navigation.navigate('ImportExcel')}
          style={[styles.actionButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <Text style={{ fontSize: 20, marginRight: 12 }}>📁</Text>
          <Text style={[styles.actionText, { color: colors.textPrimary }]}>
            Импорт продаж из Excel
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 20 }}>›</Text>
        </TouchableOpacity>

        {/* Мои KPI по товарам */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
            🎯 Мои KPI по товарам
          </Text>
          <TouchableOpacity
            onPress={() => navigation.navigate('AddProductKpi')}
            style={[styles.addBtn, { backgroundColor: colors.accent }]}
          >
            <Text style={{ color: colors.onAccent, fontSize: 20, fontWeight: '300' }}>+</Text>
          </TouchableOpacity>
        </View>

        {myTargets.length === 0 ? (
          <View style={styles.emptyBlock}>
            <Text style={{ fontSize: 48, marginBottom: 8 }}>🎯</Text>
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
              Пока нет KPI по товарам
            </Text>
            <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
              Нажмите + чтобы добавить цель продаж
            </Text>
          </View>
        ) : (
          myTargets.map(target => {
            const percent = Number(target.progress_percent || 0);
            const current = Number(target.current_value);
            const total = Number(target.target_value);
            const unit = target.metric_type === 'amount' ? '₽' 
                       : target.metric_type === 'contracts' ? 'контр.' : 'шт';

            return (
              <TouchableOpacity
                key={target.id}
                onPress={() => navigation.navigate('ProductKpiDetail', { targetId: target.id })}
                activeOpacity={0.7}
              >
                <Card padding="md" style={{ marginBottom: 10 }}>
                  <View style={styles.targetHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.targetName, { color: colors.textPrimary }]} numberOfLines={1}>
                        📦 {target.product_name}
                      </Text>
                      <Text style={[styles.targetDesc, { color: colors.textSecondary }]}>
                        {current} / {total} {unit}
                      </Text>
                    </View>
                    <Text style={[styles.targetPercent, { 
                      color: getProgressColor(percent, colors),
                    }]}>
                      {percent}%
                    </Text>
                  </View>
                  <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
                    <View
                      style={[
                        styles.progressFill,
                        {
                          width: `${Math.min(100, percent)}%`,
                          backgroundColor: getProgressColor(percent, colors),
                        },
                      ]}
                    />
                  </View>
                  <Text style={[styles.remaining, { color: colors.textSecondary }]}>
                    {percent >= 100 
                      ? '🔥 Перевыполнение!' 
                      : `Осталось: ${(total - current).toFixed(target.metric_type === 'amount' ? 0 : 0)} ${unit}`}
                  </Text>
                </Card>
              </TouchableOpacity>
            );
          })
        )}

        {/* Топ товаров */}
        {summary?.topProducts && summary.topProducts.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary, marginTop: 20 }]}>
              🏆 Топ товаров
            </Text>
            <Card padding="md" style={{ marginTop: 8 }}>
              {summary.topProducts.slice(0, 5).map((p, idx) => (
                <View
                  key={idx}
                  style={[
                    styles.topRow,
                    idx < summary.topProducts.length - 1 && { 
                      borderBottomWidth: StyleSheet.hairlineWidth, 
                      borderBottomColor: colors.border,
                      paddingBottom: 10,
                      marginBottom: 10,
                    },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.topName, { color: colors.textPrimary }]} numberOfLines={1}>
                      {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}.`} {p.product_name}
                    </Text>
                    <Text style={[styles.topMeta, { color: colors.textSecondary }]}>
                      {Number(p.total_quantity).toFixed(0)} шт · {p.transactions_count} сделок
                    </Text>
                  </View>
                  <Text style={[styles.topAmount, { color: colors.accent }]}>
                    {formatMoney(p.total_amount)}
                  </Text>
                </View>
              ))}
            </Card>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  title: { fontSize: 32, fontWeight: '700' },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  periodRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  periodChip: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  bigNumber: {
    fontSize: 28,
    fontWeight: '700',
  },
  subNumber: {
    fontSize: 14,
    marginTop: 2,
    marginBottom: 12,
  },
  progressBar: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  progressPercent: { fontSize: 13, fontWeight: '600' },
  daysLeft: { fontSize: 13 },
  forecastBlock: {
    padding: 10,
    borderRadius: 8,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  statEmoji: { fontSize: 22, marginBottom: 4 },
  statValue: { fontSize: 16, fontWeight: '700', marginBottom: 2 },
  statLabel: { fontSize: 11 },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 20,
  },
  actionText: { flex: 1, fontSize: 15, fontWeight: '500' },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  sectionTitle: { fontSize: 17, fontWeight: '600' },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyBlock: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyTitle: { fontSize: 16, fontWeight: '600' },
  emptySubtitle: { fontSize: 13, marginTop: 4 },
  targetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  targetName: { fontSize: 15, fontWeight: '600', marginBottom: 2 },
  targetDesc: { fontSize: 13 },
  targetPercent: { fontSize: 20, fontWeight: '700', marginLeft: 8 },
  remaining: { fontSize: 12, marginTop: 4 },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  topName: { fontSize: 14, fontWeight: '500', marginBottom: 2 },
  topMeta: { fontSize: 12 },
  topAmount: { fontSize: 14, fontWeight: '700', marginLeft: 8 },
});
```


## Файл: mobile/src/services/api.ts

```
import { SERVER_URL, getToken } from '../utils';

export interface Task {
  id: number;
  title: string;
  description: string;
  importance: 'green' | 'yellow' | 'red';
  hard_deadline: string | null;
  status_new: 'new' | 'in_progress' | 'on_review' | 'done' | 'overdue' | 'rejected' | 'archived';
  creator_id: number;
  creator_username?: string;
  creator_name?: string;
  watcher_id: number;
  executor_comment: string | null;
  watcher_comment: string | null;
  assignees_count: number;
  pending_checkpoints: number;
  assignees?: Array<{
    id: number;
    username: string;
    display_name: string;
    avatar_url: string | null;
  }>;
  created_at: string;
}

export interface RoleNode {
  id: number;
  name: string;
  parent_id: number | null;
  description: string;
  level: number;
  color: string;
  icon: string;
  users_count: number;
}

export interface UserInSubtree {
  id: number;
  username: string;
  display_name: string;
  avatar_url: string | null;
  role_name: string;
}

// ===== Типы для модуля Заметок =====
export interface Note {
  id: number;
  user_id: number;
  title: string;
  content: string;
  is_favorite: boolean;
  note_date: string;
  created_at: string;
  updated_at: string;
}

export interface DayWithNotes {
  note_date: string;
  note_count: number;
}

// ===== Типы для модуля KPI Продаж =====
export type MetricType = 'quantity' | 'amount' | 'contracts';

export interface SalesTarget {
  id: number;
  user_id: number;
  is_department_target: boolean;
  department_id: number | null;
  product_name: string | null;
  metric_type: MetricType;
  target_value: number;
  current_value: number;
  period_start: string;
  period_end: string;
  description: string | null;
  progress_percent?: number;
  created_at: string;
  updated_at: string;
}

export interface SalesTransaction {
  id: number;
  user_id: number;
  target_id: number | null;
  product_name: string;
  quantity: number;
  amount: number;
  transaction_date: string;
  client_name: string | null;
  notes: string | null;
  import_id: number | null;
  created_at: string;
}

export interface SalesImport {
  id: number;
  user_id: number;
  file_name: string;
  file_size: number | null;
  total_rows: number;
  imported_rows: number;
  skipped_rows: number;
  total_amount: number;
  status: 'pending' | 'completed' | 'failed';
  error_log: string[] | null;
  created_at: string;
  completed_at: string | null;
}

export interface ImportPreview {
  importId: number;
  fileName: string;
  totalRows: number;
  preview: any[];
  headers: string[];
  suggestedMapping: Record<string, string | null>;
  validation: {
    valid: number;
    invalid: number;
    errors: string[];
  };
  totalAmount: number;
}

export interface ImportResult {
  success: boolean;
  imported: number;
  skipped: number;
  totalAmount: number;
  errors: string[];
}

export interface SalesSummary {
  fact: {
    total_amount: number;
    total_quantity: number;
    total_transactions: number;
  };
  targets: SalesTarget[];
  personalTarget: SalesTarget | null;
  topProducts: Array<{
    product_name: string;
    total_quantity: number;
    total_amount: number;
    transactions_count: number;
  }>;
  period: string;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = await getToken();
  if (!token) throw new Error('Нет токена');
  
  const res = await fetch(`${SERVER_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options?.headers || {}),
    },
  });
  
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Ошибка запроса');
  return data;
}

export const api = {
  // ===== Задачи (Tasks) =====
  getTasks: (filter?: 'all' | 'mine' | 'created' | 'watching') =>
    request<Task[]>(`/api/tasks${filter ? `?filter=${filter}` : ''}`),

  getTask: (id: number) =>
    request<any>(`/api/tasks/${id}`),

  createTask: (data: {
    title: string;
    description?: string;
    importance?: 'green' | 'yellow' | 'red';
    hard_deadline?: string;
    assignee_ids: number[];
    watcher_ids?: number[];
    checkpoints?: Array<{ title: string; deadline: string }>;
  }) =>
    request<Task>('/api/tasks', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateTask: (id: number, data: Partial<Task>) =>
    request<Task>(`/api/tasks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deleteTask: (id: number) =>
    request<{ success: boolean }>(`/api/tasks/${id}`, { method: 'DELETE' }),

  addCanvasPost: (taskId: number, content: string, content_type: string = 'text') =>
    request<any>(`/api/tasks/${taskId}/canvas`, {
      method: 'POST',
      body: JSON.stringify({ content, content_type }),
    }),

  // ===== Дерево ролей (Role Tree) =====
  getRoleTree: () => request<RoleNode[]>('/api/role-tree'),

  getUsersInSubtree: (nodeId: number) =>
    request<UserInSubtree[]>(`/api/role-tree/users/in-subtree/${nodeId}`),

  // ===== Заметки (Notes) =====
  getNotesByMonth: (month: string) =>
    request<Note[]>(`/api/notes?month=${month}`),

  getNotesByDate: (date: string) =>
    request<Note[]>(`/api/notes?date=${date}`),

  getFavoriteNotes: () =>
    request<Note[]>('/api/notes?favorite=true'),

  getDaysWithNotes: (month: string) =>
    request<DayWithNotes[]>(`/api/notes/days-with-notes?month=${month}`),

  createNote: (data: {
    title?: string;
    content?: string;
    note_date?: string;
    is_favorite?: boolean;
  }) =>
    request<Note>('/api/notes', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateNote: (id: number, data: Partial<Note>) =>
    request<Note>(`/api/notes/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deleteNote: (id: number) =>
    request<{ success: boolean }>(`/api/notes/${id}`, { method: 'DELETE' }),

  // ===== KPI Продаж =====
  
  // Цели продаж
  getSalesTargets: () =>
    request<SalesTarget[]>('/api/kpi/sales/targets'),

  createSalesTarget: (data: {
    product_name?: string;
    metric_type?: MetricType;
    target_value: number;
    current_value?: number;
    period_start?: string;
    period_end?: string;
    description?: string;
    is_department_target?: boolean;
  }) =>
    request<SalesTarget>('/api/kpi/sales/targets', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateSalesTarget: (id: number, data: Partial<SalesTarget>) =>
    request<SalesTarget>(`/api/kpi/sales/targets/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deleteSalesTarget: (id: number) =>
    request<{ success: boolean }>(`/api/kpi/sales/targets/${id}`, { method: 'DELETE' }),

  // Транзакции
  getSalesTransactions: (params?: { target_id?: number; period?: 'week' | 'month' }) => {
    const query = new URLSearchParams();
    if (params?.target_id) query.set('target_id', String(params.target_id));
    if (params?.period) query.set('period', params.period);
    const q = query.toString();
    return request<SalesTransaction[]>(`/api/kpi/sales/transactions${q ? `?${q}` : ''}`);
  },

  createSalesTransaction: (data: {
    product_name: string;
    quantity?: number;
    amount?: number;
    transaction_date?: string;
    client_name?: string;
    notes?: string;
    target_id?: number;
  }) =>
    request<SalesTransaction>('/api/kpi/sales/transactions', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Сводка
  getSalesSummary: (period: 'week' | 'month' | 'quarter' = 'month') =>
    request<SalesSummary>(`/api/kpi/sales/summary?period=${period}`),

  // Импорт Excel
  previewImport: async (fileUri: string, fileName: string, fileType: string): Promise<ImportPreview> => {
    const token = await getToken();
    if (!token) throw new Error('Нет токена');
    
    const formData = new FormData();
    formData.append('file', {
      uri: fileUri,
      name: fileName,
      type: fileType,
    } as any);
    
    const res = await fetch(`${SERVER_URL}/api/kpi/sales/import/preview`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'multipart/form-data',
      },
      body: formData,
    });
    
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Ошибка загрузки файла');
    return data;
  },

  confirmImport: (importId: number, mapping: Record<string, string | null>) =>
    request<ImportResult>('/api/kpi/sales/import/confirm', {
      method: 'POST',
      body: JSON.stringify({ importId, mapping }),
    }),

  getImportHistory: () =>
    request<SalesImport[]>('/api/kpi/sales/import/history'),
};
```


## Файл: mobile/App.tsx

```
import React, { useState, useEffect } from 'react';
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import * as RNFS from 'react-native-fs';
import CreateTaskScreen from './src/screens/crm/CreateTaskScreen';
import TaskDetailScreen from './src/screens/crm/TaskDetailScreen';

// ===== Экраны мессенджера (от Ромы) =====
import AuthScreen from './src/screens/AuthScreen';
import ChatListScreen from './src/screens/ChatListScreen';
import ChatScreen from './src/screens/ChatScreen';
import CreateChatScreen from './src/screens/CreateChatScreen';
import ChatInfoScreen from './src/screens/ChatInfoScreen';
import TopicListScreen from './src/screens/TopicListScreen';
import TopicInfoScreen from './src/screens/TopicInfoScreen';
import AddMembersScreen from './src/screens/AddMembersScreen';
import MediaListScreen from './src/screens/MediaListScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import UserProfileScreen from './src/screens/UserProfileScreen';

// ===== Экраны CRM =====
import TasksScreen from './src/screens/crm/TasksScreen';
import NotesScreen from './src/screens/crm/NotesScreen';
import NoteEditorScreen from './src/screens/crm/NoteEditorScreen';
import KpiScreen from './src/screens/crm/KpiScreen';
import ImportExcelScreen from './src/screens/crm/ImportExcelScreen';
import AddProductKpiScreen from './src/screens/crm/AddProductKpiScreen';
import KnowledgeScreen from './src/screens/crm/KnowledgeScreen';

// ===== Тема =====
import { ThemeProvider, useTheme } from './src/theme/ThemeContext';
import { SERVER_URL, getToken } from './src/utils';

// ========== Навигационные типы ==========
type ChatStackParamList = {
  ChatList: undefined;
  Chat: { chatId: string; chatName: string; topicId?: number | null; messageId?: number };
  CreateChat: undefined;
  ChatInfo: { chatId: string };
  TopicList: { chatId: string; chatName: string };
  TopicInfo: { chatId: string; topicId: number };
  AddMembers: { chatId: string };
  MediaList: { chatId: string; type: 'files' | 'images' };
  Profile: undefined;
  UserProfile: { userId: number; username: string; displayName: string; avatarUrl: string; role: string };
};

type TasksStackParamList = { 
  TasksHome: undefined; 
  CreateTask: undefined;
  TaskDetail: { taskId: number };
};

type NotesStackParamList = { 
  NotesHome: undefined;
  NoteEditor: { noteId?: number; noteDate?: string };
};

type KpiStackParamList = { KpiHome: undefined; AddProductKpi: undefined; ProductKpiDetail: { targetId: number }; };
type KnowledgeStackParamList = { KnowledgeHome: undefined };
type AuthStackParamList = { Auth: undefined };

type MainTabsParamList = {
  TasksTab: undefined;
  NotesTab: undefined;
  KpiTab: undefined;
  ChatTab: undefined;
  KnowledgeTab: undefined;
};

const ChatStack = createNativeStackNavigator<ChatStackParamList>();
const TasksStack = createNativeStackNavigator<TasksStackParamList>();
const NotesStack = createNativeStackNavigator<NotesStackParamList>();
const KpiStack = createNativeStackNavigator<KpiStackParamList>();
const KnowledgeStack = createNativeStackNavigator<KnowledgeStackParamList>();
const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const Tab = createBottomTabNavigator<MainTabsParamList>();

// ========== Обёртка для Stack-ов с общим стилем ==========
const useHeaderStyle = () => {
  const { colors } = useTheme();
  return {
    headerStyle: { backgroundColor: colors.header, shadowOpacity: 0, elevation: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
    headerTintColor: colors.accent,
    headerTitleStyle: { fontWeight: '600' as const, fontSize: 17, color: colors.textPrimary },
  };
};

// ========== Chat Stack (мессенджер) ==========
function ChatStackNavigator({ onLogout }: { onLogout: () => void }) {
  const headerStyle = useHeaderStyle();
  return (
    <ChatStack.Navigator screenOptions={headerStyle}>
      <ChatStack.Screen
        name="ChatList"
        options={{ title: 'mesNation', headerShown: false }}
        children={(props) => <ChatListScreen {...props} onLogout={onLogout} />}
      />
      <ChatStack.Screen name="Chat" component={ChatScreen} options={{ headerShown: false }} />
      <ChatStack.Screen name="CreateChat" component={CreateChatScreen} options={{ title: 'Новый чат' }} />
      <ChatStack.Screen name="ChatInfo" component={ChatInfoScreen} options={{ title: 'Информация о чате' }} />
      <ChatStack.Screen name="TopicList" component={TopicListScreen} options={{ title: 'Топики' }} />
      <ChatStack.Screen name="TopicInfo" component={TopicInfoScreen} options={{ title: 'Топик' }} />
      <ChatStack.Screen name="AddMembers" component={AddMembersScreen} options={{ title: 'Добавить участников' }} />
      <ChatStack.Screen name="MediaList" component={MediaListScreen} options={{ title: 'Медиа' }} />
      <ChatStack.Screen
        name="Profile"
        options={{ title: 'Профиль' }}
        children={(props) => <ProfileScreen {...props} onLogout={onLogout} />}
      />
      <ChatStack.Screen name="UserProfile" component={UserProfileScreen} options={{ title: 'Профиль' }} />
    </ChatStack.Navigator>
  );
}

// ========== Tasks Stack ==========
function TasksStackNavigator() {
  const headerStyle = useHeaderStyle();
  return (
    <TasksStack.Navigator screenOptions={headerStyle}>
      <TasksStack.Screen name="TasksHome" component={TasksScreen} options={{ headerShown: false }} />
      <TasksStack.Screen name="CreateTask" component={CreateTaskScreen} options={{ title: 'Новая задача' }} />
      <TasksStack.Screen name="TaskDetail" component={TaskDetailScreen} options={{ title: 'Задача' }} />
    </TasksStack.Navigator>
  );
}

// ========== Notes Stack ==========
function NotesStackNavigator() {
  const headerStyle = useHeaderStyle();
  return (
    <NotesStack.Navigator screenOptions={headerStyle}>
      <NotesStack.Screen name="NotesHome" component={NotesScreen} options={{ title: 'Заметки' }} />
      <NotesStack.Screen 
        name="NoteEditor" 
        component={NoteEditorScreen} 
        options={{ title: 'Редактор', headerShown: false }} 
      />
    </NotesStack.Navigator>
  );
}

// ========== KPI Stack ==========
function KpiStackNavigator() {
  const headerStyle = useHeaderStyle();
  return (
    <KpiStack.Navigator screenOptions={headerStyle}>
      <KpiStack.Screen name="KpiHome" component={KpiScreen} options={{ title: 'Статистика' }} />
      <KpiStack.Screen name="AddProductKpi" component={AddProductKpiScreen} options={{ headerShown: false }} />
      <KpiStack.Screen name="ImportExcel" component={ImportExcelScreen} options={{ title: 'Импорт Excel' }} />
    </KpiStack.Navigator>
  );
}

// ========== Knowledge Stack ==========
function KnowledgeStackNavigator() {
  const headerStyle = useHeaderStyle();
  return (
    <KnowledgeStack.Navigator screenOptions={headerStyle}>
      <KnowledgeStack.Screen name="KnowledgeHome" component={KnowledgeScreen} options={{ title: 'База знаний' }} />
    </KnowledgeStack.Navigator>
  );
}

// ========== Иконка вкладки ==========
function TabIcon({ emoji, focused }: { emoji: string; focused: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.tabIcon, { opacity: focused ? 1 : 0.5 }]}>
      <Text style={{ fontSize: 22 }}>{emoji}</Text>
    </View>
  );
}

// ========== Главный Tab-навигатор ==========
function MainTabs({ onLogout }: { onLogout: () => void }) {
  const { colors } = useTheme();
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.tabBarIconActive,
        tabBarInactiveTintColor: colors.tabBarIcon,
        tabBarStyle: {
          backgroundColor: colors.tabBar,
          borderTopColor: colors.border,
          borderTopWidth: StyleSheet.hairlineWidth,
          height: 64,
          paddingBottom: 8,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tab.Screen
        name="TasksTab"
        component={TasksStackNavigator}
        options={{
          title: 'Задачи',
          tabBarIcon: ({ focused }) => <TabIcon emoji="📋" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="NotesTab"
        component={NotesStackNavigator}
        options={{
          title: 'Заметки',
          tabBarIcon: ({ focused }) => <TabIcon emoji="📝" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="KpiTab"
        component={KpiStackNavigator}
        options={{
          title: 'Статистика',
          tabBarIcon: ({ focused }) => <TabIcon emoji="📊" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="ChatTab"
        options={{
          title: 'Чаты',
          tabBarIcon: ({ focused }) => <TabIcon emoji="💬" focused={focused} />,
        }}
        children={() => <ChatStackNavigator onLogout={onLogout} />}
      />
      <Tab.Screen
        name="KnowledgeTab"
        component={KnowledgeStackNavigator}
        options={{
          title: 'База',
          tabBarIcon: ({ focused }) => <TabIcon emoji="📚" focused={focused} />,
        }}
      />
    </Tab.Navigator>
  );
}

// ========== Auth Stack ==========
function AuthStackNavigator({ onLoginSuccess }: { onLoginSuccess: (token: string, user: any) => void }) {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Auth" children={(props) => <AuthScreen {...props} onLoginSuccess={onLoginSuccess} />} />
    </AuthStack.Navigator>
  );
}

// ========== Корневой компонент ==========
function RootNavigator() {
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);

  useEffect(() => {
    (async () => {
      const token = await getToken();
      if (token) {
        try {
          const res = await fetch(`${SERVER_URL}/api/auth/me`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            setIsLoggedIn(true);
            return;
          }
        } catch (e) {}
        try { await RNFS.unlink(`${RNFS.DocumentDirectoryPath}/token.txt`); } catch (e) {}
      }
      setIsLoggedIn(false);
    })();
  }, []);

  const handleLoginSuccess = (_token: string, _user: any) => setIsLoggedIn(true);
  const handleLogout = async () => {
    try { await RNFS.unlink(`${RNFS.DocumentDirectoryPath}/token.txt`); } catch (e) {}
    setIsLoggedIn(false);
  };

  if (isLoggedIn === null) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator size="large" color="#6366F1" />
        <Text style={styles.splashText}>mesNation</Text>
      </View>
    );
  }

  return (
    <NavigationContainer>
      {isLoggedIn ? <MainTabs onLogout={handleLogout} /> : <AuthStackNavigator onLoginSuccess={handleLoginSuccess} />}
    </NavigationContainer>
  );
}

// ========== Точка входа ==========
export default function App() {
  return (
    <ThemeProvider>
      <RootNavigator />
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  tabIcon: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  splash: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  splashText: { marginTop: 16, fontSize: 18, fontWeight: '600', color: '#6366F1' },
});
```


## Файл: server/src/index.ts

```
import express, { Request, Response, NextFunction } from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import pool from './db/pool';
import multer from 'multer';
import path from 'path';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import sharp from 'sharp';
import fs from 'fs';
import chatsRouter from './routes/chats';
import roleTreeRouter from './routes/roleTree';
import tasksRouter from './routes/tasks';
import notesRouter from './routes/notes';
import kpiSalesRouter from './routes/kpiSales';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });

const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'default-secret';

const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 100 * 1024 * 1024 }
});

fs.mkdirSync('uploads/thumbs', { recursive: true });
fs.mkdirSync('uploads/avatars', { recursive: true });

// ========== Middleware ==========
app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));
app.use(express.static(path.join(__dirname, '../public')));

interface AuthRequest extends Request {
  userId?: number;
  username?: string;
}

function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Токен не предоставлен' });
  const token = authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Неверный формат токена' });
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId: number; username: string };
    req.userId = payload.userId;
    req.username = payload.username;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Недействительный токен' });
  }
}

function authenticateQuery(req: AuthRequest, res: Response, next: NextFunction) {
  const token = req.query.token as string;
  if (!token) return res.status(401).json({ error: 'Токен не предоставлен' });
  try {
    jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Недействительный или истекший токен' });
  }
}

// Статика для аплоадов
app.use('/uploads/thumbs', express.static('uploads/thumbs'));
app.use('/uploads/avatars', express.static('uploads/avatars'));
app.use('/uploads', (req: AuthRequest, res: Response, next: NextFunction) => {
  if (req.query.token) return authenticateQuery(req, res, next);
  return authenticate(req, res, next);
}, express.static('uploads'));

// ========== Публичные эндпоинты ==========
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ========== Auth ==========
app.post('/api/auth/register', async (req: Request, res: Response) => {
  try {
    const { username, email, password, display_name } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Имя пользователя, email и пароль обязательны' });
    }
    const existing = await pool.query('SELECT id FROM users WHERE email = $1 OR username = $2', [email, username]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Пользователь с таким email или именем уже существует' });
    }
    const password_hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
  `INSERT INTO users (username, email, password_hash, display_name, role_id, name)
 VALUES ($1, $2, $3, $4, (SELECT id FROM role_tree WHERE name = 'employee'), $1)
 RETURNING id, username, email, display_name, avatar_url`,
  [username, email, password_hash, display_name || username]
);
    const user = result.rows[0];
    const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ token, user });
  } catch (err) {
    console.error('Ошибка регистрации:', err);
    res.status(500).json({ error: 'Ошибка сервера при регистрации' });
  }
});

app.post('/api/auth/login', async (req: Request, res: Response) => {
  try {
    const { username, email, password } = req.body;
    if ((!username && !email) || !password) {
      return res.status(400).json({ error: 'Укажите имя пользователя (или email) и пароль' });
    }
    const result = await pool.query(
      'SELECT id, username, email, password_hash, display_name, avatar_url FROM users WHERE username = $1 OR email = $2',
      [username || '', email || '']
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Неверное имя пользователя или пароль' });
    }
    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Неверное имя пользователя или пароль' });
    }
    const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, username: user.username, email: user.email, display_name: user.display_name, avatar_url: user.avatar_url } });
  } catch (err) {
    console.error('Ошибка входа:', err);
    res.status(500).json({ error: 'Ошибка сервера при входе' });
  }
});

app.get('/api/auth/me', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      'SELECT id, username, email, display_name, avatar_url, role_id, department_id FROM users WHERE id = $1',
      [req.userId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Пользователь не найден' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Ошибка получения профиля:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.get('/api/users', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query('SELECT id, username, display_name, avatar_url FROM users');
    res.json(result.rows);
  } catch (err) {
    console.error('Ошибка получения пользователей:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.post('/api/auth/avatar', authenticate, upload.single('avatar'), async (req: AuthRequest, res: Response) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'Нет файла' });
    const avatarUrl = '/uploads/avatars/' + file.filename;
    await pool.query('UPDATE users SET avatar_url = $1 WHERE id = $2', [avatarUrl, req.userId]);
    res.json({ avatar_url: avatarUrl });
  } catch (err) {
    console.error('Ошибка загрузки аватара:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.patch('/api/auth/profile', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { display_name } = req.body;
    if (!display_name) return res.status(400).json({ error: 'Имя обязательно' });
    await pool.query('UPDATE users SET display_name = $1 WHERE id = $2', [display_name, req.userId]);
    res.json({ display_name });
  } catch (err) {
    console.error('Ошибка обновления профиля:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.get('/api/file-token/:filename', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const filename = req.params.filename;
    const filePath = path.join('uploads', filename as string);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Файл не найден' });
    const tempToken = jwt.sign({ filename }, JWT_SECRET, { expiresIn: '5m' });
    res.json({ url: `/uploads/${filename}?token=${tempToken}` });
  } catch (err) {
    console.error('Ошибка генерации токена:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ========== Основные роуты ==========
app.use('/api/chats', authenticate, chatsRouter);
app.use('/api/role-tree', authenticate, roleTreeRouter);
app.use('/api/tasks', authenticate, tasksRouter);
app.use('/api/notes', authenticate, notesRouter);
app.use('/api/kpi/sales', authenticate, kpiSalesRouter);

// ========== Сообщения ==========
app.get('/api/messages/:chatId', async (req: Request, res: Response) => {
  try {
    const { chatId } = req.params;
    const { topic_id } = req.query;
    let query = 'SELECT * FROM messages WHERE chat_id = $1';
    const params: any[] = [chatId];
    if (topic_id) {
      query += ' AND topic_id = $2';
      params.push(topic_id);
    } else {
      query += ' AND topic_id IS NULL';
    }
    query += ' ORDER BY created_at ASC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка получения сообщений' });
  }
});

app.get('/api/messages/:chatId/pinned', async (req: Request, res: Response) => {
  try {
    const { chatId } = req.params;
    const { topic_id } = req.query;
    let query = 'SELECT * FROM messages WHERE chat_id = $1 AND pinned = true AND deleted_for_all = false';
    const params: any[] = [chatId];
    if (topic_id) {
      query += ' AND topic_id = $2';
      params.push(topic_id);
    } else {
      query += ' AND topic_id IS NULL';
    }
    query += ' ORDER BY created_at ASC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Ошибка получения закреплённых:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.patch('/api/messages/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const messageId = parseInt(req.params.id as string);
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'Текст обязателен' });
    const msgResult = await pool.query('SELECT * FROM messages WHERE id = $1', [messageId]);
    if (msgResult.rows.length === 0) return res.status(404).json({ error: 'Сообщение не найдено' });
    const msg = msgResult.rows[0];
    if (msg.sender_id !== req.userId) return res.status(403).json({ error: 'Только автор может редактировать сообщение' });
    const result = await pool.query(
      'UPDATE messages SET text = $1, edited_at = NOW() WHERE id = $2 RETURNING *',
      [text, messageId]
    );
    const updatedMsg = result.rows[0];
    io.to(msg.chat_id).emit('message_edited', updatedMsg);
    res.json(updatedMsg);
  } catch (err) {
    console.error('Ошибка редактирования:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.delete('/api/messages/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const messageId = parseInt(req.params.id as string);
    const { scope } = req.query;
    const msgResult = await pool.query('SELECT * FROM messages WHERE id = $1', [messageId]);
    if (msgResult.rows.length === 0) return res.status(404).json({ error: 'Сообщение не найдено' });
    const msg = msgResult.rows[0];
    if (scope === 'all') {
      const chatResult = await pool.query('SELECT * FROM chats WHERE id = $1', [msg.chat_id]);
      const chat = chatResult.rows[0];
      if (msg.sender_id !== req.userId && chat.created_by !== req.userId) {
        return res.status(403).json({ error: 'Нет прав для удаления для всех' });
      }
      await pool.query('UPDATE messages SET deleted_for_all = true WHERE id = $1', [messageId]);
    } else {
      await pool.query(
        'UPDATE messages SET deleted_for_user_ids = array_append(deleted_for_user_ids, $1) WHERE id = $2',
        [req.userId, messageId]
      );
    }
    io.to(msg.chat_id).emit('message_deleted', { id: messageId, scope, userId: req.userId });
    res.json({ success: true });
  } catch (err) {
    console.error('Ошибка удаления:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ========== Закрепление сообщений ==========
app.patch('/api/messages/:id/pin', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const messageId = parseInt(req.params.id as string);
    const userId = req.userId!;
    const msgResult = await pool.query('SELECT * FROM messages WHERE id = $1', [messageId]);
    if (msgResult.rows.length === 0) return res.status(404).json({ error: 'Сообщение не найдено' });
    const msg = msgResult.rows[0];
    let canPin = true;
    const adminCheck = await pool.query('SELECT permissions FROM chat_admins WHERE chat_id = $1 AND user_id = $2', [msg.chat_id, userId]);
    if (adminCheck.rows.length > 0) {
      const perms = adminCheck.rows[0].permissions || [];
      canPin = perms.includes('pin_messages');
    }
    if (!canPin) return res.status(403).json({ error: 'Нет прав на закрепление сообщений' });
    await pool.query('UPDATE messages SET pinned = true WHERE id = $1', [messageId]);
    io.to(msg.chat_id).emit('message_pinned', { id: messageId, pinned: true });
    res.json({ success: true, pinned: true });
  } catch (err) {
    console.error('Ошибка закрепления:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.patch('/api/messages/:id/unpin', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const messageId = parseInt(req.params.id as string);
    const userId = req.userId!;
    const msgResult = await pool.query('SELECT * FROM messages WHERE id = $1', [messageId]);
    if (msgResult.rows.length === 0) return res.status(404).json({ error: 'Сообщение не найдено' });
    const msg = msgResult.rows[0];
    let canUnpin = true;
    const adminCheck = await pool.query('SELECT permissions FROM chat_admins WHERE chat_id = $1 AND user_id = $2', [msg.chat_id, userId]);
    if (adminCheck.rows.length > 0) {
      const perms = adminCheck.rows[0].permissions || [];
      canUnpin = perms.includes('pin_messages');
    }
    if (!canUnpin) return res.status(403).json({ error: 'Нет прав на открепление сообщений' });
    await pool.query('UPDATE messages SET pinned = false WHERE id = $1', [messageId]);
    io.to(msg.chat_id).emit('message_unpinned', { id: messageId, pinned: false });
    res.json({ success: true, pinned: false });
  } catch (err) {
    console.error('Ошибка открепления:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ========== Загрузка файлов ==========
app.post('/api/upload', authenticate, upload.single('file'), async (req: AuthRequest, res: Response) => {
  try {
    const { chatId, senderId, topicId } = req.body;
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'Нет файла' });
    if (!chatId || !senderId) return res.status(400).json({ error: 'Не указан чат или отправитель' });

    const memberCheck = await pool.query(
      'SELECT 1 FROM chat_members WHERE chat_id = $1 AND user_id = $2',
      [chatId, senderId]
    );
    if (memberCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Пользователь не состоит в чате' });
    }

    let thumbUrl: string | null = null;
    const isImage = file.mimetype.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(file.originalname);
    if (isImage) {
      const thumbFilename = 'thumb_' + file.filename;
      const thumbPath = path.join('uploads', 'thumbs', thumbFilename);
      try {
        await sharp(file.path).resize(300, 300, { fit: 'inside' }).toFile(thumbPath);
        thumbUrl = '/uploads/thumbs/' + thumbFilename;
      } catch (sharpErr) {
        console.error('Ошибка создания миниатюры:', sharpErr);
      }
    }

    const result = await pool.query(
      `INSERT INTO messages (chat_id, sender_id, file_url, file_name, thumb_url, topic_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [chatId, senderId, `/uploads/${file.filename}`, file.originalname, thumbUrl, topicId || null]
    );
    const msg = result.rows[0];
    io.to(chatId).emit('new_message', msg);
    res.status(201).json(msg);
  } catch (err) {
    console.error('Ошибка загрузки файла:', err);
    res.status(500).json({ error: 'Ошибка загрузки файла' });
  }
});

// ========== Топики ==========
app.post('/api/chats/:id/topics', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const chatId = parseInt(req.params.id as string);
    const { title } = req.body;
    if (!title) return res.status(400).json({ error: 'Название топика обязательно' });
    const chatResult = await pool.query('SELECT * FROM chats WHERE id = $1', [chatId]);
    if (chatResult.rows.length === 0) return res.status(404).json({ error: 'Чат не найден' });
    const chat = chatResult.rows[0];
    if (!chat.is_supergroup) return res.status(400).json({ error: 'Топики доступны только в супергруппах' });
    if (chat.created_by !== req.userId) return res.status(403).json({ error: 'Только создатель может создавать топики' });
    const result = await pool.query(
      'INSERT INTO topics (chat_id, title, created_by) VALUES ($1, $2, $3) RETURNING *',
      [chatId, title, req.userId]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Ошибка создания топика:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.get('/api/chats/:id/topics', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const chatId = parseInt(req.params.id as string);
    const result = await pool.query('SELECT * FROM topics WHERE chat_id = $1 ORDER BY created_at ASC', [chatId]);
    res.json(result.rows);
  } catch (err) {
    console.error('Ошибка получения топиков:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.delete('/api/topics/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const topicId = parseInt(req.params.id as string);
    const topicResult = await pool.query('SELECT * FROM topics WHERE id = $1', [topicId]);
    if (topicResult.rows.length === 0) return res.status(404).json({ error: 'Топик не найден' });
    const topic = topicResult.rows[0];
    const chatResult = await pool.query('SELECT * FROM chats WHERE id = $1', [topic.chat_id]);
    if (chatResult.rows[0].created_by !== req.userId) return res.status(403).json({ error: 'Только создатель супергруппы может удалять топики' });
    await pool.query('DELETE FROM topics WHERE id = $1', [topicId]);
    res.json({ success: true });
  } catch (err) {
    console.error('Ошибка удаления топика:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ========== Пересылка между чатами ==========
app.post('/api/messages/reply-to-another-chat', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { message_id, target_chat_id, target_topic_id, text } = req.body;
    const userId = req.userId!;
    const msgResult = await pool.query('SELECT * FROM messages WHERE id = $1', [message_id]);
    if (msgResult.rows.length === 0) return res.status(404).json({ error: 'Исходное сообщение не найдено' });
    const originalMsg = msgResult.rows[0];
    const memberCheck = await pool.query('SELECT 1 FROM chat_members WHERE chat_id = $1 AND user_id = $2', [target_chat_id, userId]);
    if (memberCheck.rows.length === 0) return res.status(403).json({ error: 'Вы не являетесь участником целевого чата' });
    const externalChatId = (originalMsg.chat_id != target_chat_id) ? originalMsg.chat_id : null;
    const finalText = (text && text.trim() !== '') ? text : (originalMsg.text || '');
    const fileUrl = originalMsg.file_url || null;
    const fileName = originalMsg.file_name || null;
    const thumbUrl = originalMsg.thumb_url || null;
    const insertResult = await pool.query(
      `INSERT INTO messages (chat_id, sender_id, text, reply_to_message_id, topic_id, external_reply_chat_id, file_url, file_name, thumb_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [target_chat_id, userId, finalText, message_id, target_topic_id || null, externalChatId, fileUrl, fileName, thumbUrl]
    );
    const newMsg = insertResult.rows[0];
    io.to(target_chat_id.toString()).emit('new_message', newMsg);
    res.status(201).json(newMsg);
  } catch (err) {
    console.error('Ошибка пересылки:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ========== WebSocket ==========
const onlineUsers = new Map<string, Set<number>>();

io.on('connection', (socket) => {
  console.log('+ user connected:', socket.id);

  socket.on('join_chat', (chatId: string) => {
    socket.join(chatId);
    const userId = (socket as any).handshake?.auth?.userId;
    if (userId && chatId) {
      if (!onlineUsers.has(chatId)) onlineUsers.set(chatId, new Set());
      onlineUsers.get(chatId)!.add(userId);
      io.to(chatId).emit('online_users', Array.from(onlineUsers.get(chatId)!));
    }
  });

  socket.on('send_message', async (data: { chatId: string; senderId: number; text: string; reply_to_message_id?: number; topic_id?: number }) => {
    try {
      const { chatId, senderId, text, reply_to_message_id, topic_id } = data;
      if (reply_to_message_id) {
        const replyMsg = await pool.query('SELECT id FROM messages WHERE id = $1 AND chat_id = $2', [reply_to_message_id, chatId]);
        if (replyMsg.rows.length === 0) return;
      }
      const result = await pool.query(
        `INSERT INTO messages (chat_id, sender_id, text, reply_to_message_id, topic_id)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [chatId, senderId || 0, text, reply_to_message_id || null, topic_id || null]
      );
      io.to(chatId).emit('new_message', result.rows[0]);
    } catch (err) { console.error(err); }
  });

  socket.on('typing', async ({ chatId, userId }: { chatId: string; userId: number }) => {
    const user = await pool.query('SELECT username, display_name FROM users WHERE id = $1', [userId]);
    const name = user.rows[0]?.display_name || user.rows[0]?.username || 'User ' + userId;
    socket.to(chatId).emit('user_typing', { chatId, userId, userName: name });
  });

  socket.on('stop_typing', ({ chatId, userId }: { chatId: string; userId: number }) => {
    socket.to(chatId).emit('user_stop_typing', { chatId, userId });
  });

  socket.on('disconnect', () => {
    console.log('- user disconnected:', socket.id);
    for (const [chatId, users] of onlineUsers) {
      const userId = (socket as any).handshake?.auth?.userId;
      if (userId && users.has(userId)) {
        users.delete(userId);
        if (users.size === 0) onlineUsers.delete(chatId);
        else io.to(chatId).emit('online_users', Array.from(users));
      }
    }
  });
});

// ========== СТАРТ СЕРВЕРА (ВСЕГДА В САМОМ КОНЦЕ!) ==========
httpServer.listen(PORT, () => console.log(`🚀 Сервер запущен на порту ${PORT}`));
```

