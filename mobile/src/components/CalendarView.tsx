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

// Нормализует любую строку даты в формат YYYY-MM-DD (локально, без UTC сдвига!)
const normalizeDateStr = (dateStr: string): string => {
  if (!dateStr) return '';
  // Берём только первые 10 символов (YYYY-MM-DD)
  return dateStr.substring(0, 10);
};

// Форматируем Date объект в локальную строку YYYY-MM-DD
const formatDateObj = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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

  // Отладочный вывод при получении данных
  useEffect(() => {
    if (daysWithNotes.length > 0) {
      console.log('📅 [CalendarView] Дни с заметками от API:', daysWithNotes);
      console.log('📅 [CalendarView] Нормализованные:', daysWithNotes.map(d => ({
        original: d.note_date,
        normalized: normalizeDateStr(d.note_date),
        count: d.note_count,
      })));
    }
  }, [daysWithNotes]);

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
    
    // Ищем по нормализованной строке
    const found = daysWithNotes.find(d => {
      const normalized = normalizeDateStr(d.note_date);
      return normalized === localDateStr;
    });
    
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

      <View style={styles.weekDaysRow}>
        {weekDays.map((day, index) => (
          <View key={index} style={styles.weekDayCell}>
            <Text style={[styles.weekDayText, { color: colors.textSecondary }]}>
              {day}
            </Text>
          </View>
        ))}
      </View>

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
              style={[
                styles.dayCell,
                {
                  backgroundColor: selected ? colors.accent : 'transparent',
                  opacity: inCurrentMonth ? 1 : 0.3,
                },
              ]}
            >
              <Text
                style={[
                  styles.dayText,
                  {
                    color: selected ? colors.onAccent : today ? colors.accent : colors.textPrimary,
                    fontWeight: today ? '700' : '400',
                  },
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
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 16,
    borderRadius: 12,
    marginHorizontal: 16,
    marginTop: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
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
    marginBottom: 8,
  },
  weekDayCell: {
    flex: 1,
    alignItems: 'center',
  },
  weekDayText: {
    fontSize: 12,
    fontWeight: '600',
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    position: 'relative',
  },
  dayText: {
    fontSize: 16,
  },
  indicator: {
    width: 5,
    height: 5,
    borderRadius: 3,
    position: 'absolute',
    bottom: 6,
  },
});
