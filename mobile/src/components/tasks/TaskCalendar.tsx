import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, LayoutAnimation, Platform, UIManager } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { Task } from '../../services/api';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface TaskCalendarProps {
  tasks: Task[];
  onPressTask: (task: Task) => void;
}

interface CalendarDay {
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  dayOfWeek: number;
}

interface WeekRow {
  days: CalendarDay[];
  tasks: Task[];
}

// Цвета линий задач — интегрированы в тему приложения
const PRIORITY_COLORS = {
  high: '#EF4444',    // красный — высокий приоритет
  medium: '#F59E0B',  // жёлтый — средний приоритет
  low: '#10B981',     // зелёный — низкий приоритет
};

const PRIORITY_THICKNESS = {
  high: 8,
  medium: 6,
  low: 4,
};

const getTaskColor = (task: Task): string => {
  if (task.importance === 'red') return PRIORITY_COLORS.high;
  if (task.importance === 'yellow') return PRIORITY_COLORS.medium;
  return PRIORITY_COLORS.low;
};

const getTaskThickness = (task: Task): number => {
  return PRIORITY_THICKNESS[task.importance] || PRIORITY_THICKNESS.low;
};

const getMonthDays = (year: number, month: number): CalendarDay[] => {
  const days: CalendarDay[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  
  let startDate = new Date(firstDay);
  const firstDayOfWeek = startDate.getDay();
  const daysToSubtract = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;
  startDate.setDate(startDate.getDate() - daysToSubtract);
  
  let currentDate = new Date(startDate);
  while (currentDate <= lastDay || currentDate.getDay() !== 1) {
    const isCurrentMonth = currentDate.getMonth() === month;
    const isToday = currentDate.getTime() === today.getTime();
    const dayOfWeek = currentDate.getDay() === 0 ? 6 : currentDate.getDay() - 1;
    
    days.push({
      date: new Date(currentDate),
      isCurrentMonth,
      isToday,
      dayOfWeek,
    });
    
    currentDate.setDate(currentDate.getDate() + 1);
    if (days.length >= 42) break;
  }
  
  return days;
};

const getWeeks = (days: CalendarDay[]): WeekRow[] => {
  const weeks: WeekRow[] = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push({ days: days.slice(i, i + 7), tasks: [] });
  }
  return weeks;
};

const isTaskActiveInWeek = (task: Task, weekStart: Date, weekEnd: Date): boolean => {
  const startDate = new Date(task.created_at);
  startDate.setHours(0, 0, 0, 0);
  
  const deadline = task.executor_deadline || task.hard_deadline;
  const endDate = deadline ? new Date(deadline) : new Date(startDate.getTime() + 7 * 24 * 60 * 60 * 1000);
  endDate.setHours(23, 59, 59, 999);
  
  return startDate <= weekEnd && endDate >= weekStart;
};

const getTaskPositionInWeek = (task: Task, week: WeekRow): { left: number; width: number } | null => {
  if (!isTaskActiveInWeek(task, week.days[0].date, week.days[6].date)) return null;
  
  const startDate = new Date(task.created_at);
  startDate.setHours(0, 0, 0, 0);
  
  const deadline = task.executor_deadline || task.hard_deadline;
  const endDate = deadline ? new Date(deadline) : new Date(startDate.getTime() + 7 * 24 * 60 * 60 * 1000);
  endDate.setHours(23, 59, 59, 999);
  
  const weekStart = week.days[0].date;
  const weekEnd = new Date(week.days[6].date);
  weekEnd.setHours(23, 59, 59, 999);
  
  const taskStart = startDate < weekStart ? weekStart : startDate;
  const taskEnd = endDate > weekEnd ? weekEnd : endDate;
  
  const startDayIndex = Math.floor((taskStart.getTime() - weekStart.getTime()) / (24 * 60 * 60 * 1000));
  const endDayIndex = Math.floor((taskEnd.getTime() - weekStart.getTime()) / (24 * 60 * 60 * 1000));
  
  const left = (startDayIndex / 7) * 100;
  const width = ((endDayIndex - startDayIndex + 1) / 7) * 100;
  
  return { left, width: Math.max(width, 100 / 7) };
};

const sortTasks = (tasks: Task[]): Task[] => {
  const priorityOrder = { red: 0, yellow: 1, green: 2 };
  return [...tasks].sort((a, b) => {
    const priorityDiff = (priorityOrder[a.importance] || 2) - (priorityOrder[b.importance] || 2);
    if (priorityDiff !== 0) return priorityDiff;
    
    const deadlineA = a.executor_deadline || a.hard_deadline;
    const deadlineB = b.executor_deadline || b.hard_deadline;
    if (!deadlineA && !deadlineB) return 0;
    if (!deadlineA) return 1;
    if (!deadlineB) return -1;
    
    return new Date(deadlineA).getTime() - new Date(deadlineB).getTime();
  });
};

const ROW_HEIGHT_COLLAPSED = 80;
const ROW_HEIGHT_PER_TASK = 16;
const MAX_VISIBLE_TASKS = 3;

export default function TaskCalendar({ tasks, onPressTask }: TaskCalendarProps) {
  const { colors } = useTheme();
  const [expandedWeeks, setExpandedWeeks] = useState<Set<number>>(new Set());
  
  // Защита от undefined
  const safeTasks = Array.isArray(tasks) ? tasks : [];
  
  const currentMonth = useMemo(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  }, []);
  
  const days = useMemo(() => getMonthDays(currentMonth.year, currentMonth.month), [currentMonth]);
  const weeks = useMemo(() => {
    const w = getWeeks(days);
    w.forEach((week) => {
      const weekStart = week.days[0].date;
      const weekEnd = new Date(week.days[6].date);
      weekEnd.setHours(23, 59, 59, 999);
      const weekTasks = safeTasks.filter(task => isTaskActiveInWeek(task, weekStart, weekEnd));
      week.tasks = sortTasks(weekTasks);
    });
    return w;
  }, [days, safeTasks]);
  
  const toggleWeekExpansion = (weekIndex: number) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedWeeks(prev => {
      const next = new Set(prev);
      if (next.has(weekIndex)) next.delete(weekIndex);
      else next.add(weekIndex);
      return next;
    });
  };
  
  const monthName = new Date(currentMonth.year, currentMonth.month).toLocaleDateString('ru-RU', {
    month: 'long',
    year: 'numeric',
  });
  
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Text style={[styles.monthTitle, { color: colors.textPrimary }]}>
          {monthName}
        </Text>
      </View>
      
      <View style={styles.weekDaysHeader}>
        {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((day, idx) => (
          <View key={idx} style={styles.weekDayCell}>
            <Text style={[styles.weekDayText, { color: colors.textPrimary }]}>{day}</Text>
          </View>
        ))}
      </View>
      
      <ScrollView style={styles.calendarGrid} showsVerticalScrollIndicator={false}>
        {weeks.map((week, weekIndex) => {
          const isExpanded = expandedWeeks.has(weekIndex);
          const hasOverflow = week.tasks.length > MAX_VISIBLE_TASKS;
          const visibleTasks = isExpanded ? week.tasks : week.tasks.slice(0, MAX_VISIBLE_TASKS);
          const hiddenCount = week.tasks.length - MAX_VISIBLE_TASKS;
          const rowHeight = isExpanded
            ? Math.max(ROW_HEIGHT_COLLAPSED, week.tasks.length * ROW_HEIGHT_PER_TASK + 40)
            : ROW_HEIGHT_COLLAPSED;
          
          return (
            <View
              key={weekIndex}
              style={[
                styles.weekRow,
                {
                  height: rowHeight,
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                },
              ]}
            >
              <View style={styles.daysContainer}>
                {week.days.map((day, dayIndex) => (
                  <TouchableOpacity
                    key={dayIndex}
                    style={[
                      styles.dayCell,
                      { borderRightColor: colors.border },
                      !day.isCurrentMonth && { opacity: 0.3 },
                      day.isToday && { backgroundColor: colors.accent + '20' },
                    ]}
                    activeOpacity={0.7}
                    onPress={() => console.log('День:', day.date)}
                  >
                    <Text
                      style={[
                        styles.dayNumber,
                        { color: colors.textSecondary },
                        !day.isCurrentMonth && { color: colors.textMuted },
                        day.isToday && { color: colors.accent, fontWeight: '700' },
                      ]}
                    >
                      {day.date.getDate()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              
              <View style={styles.taskLinesContainer}>
                {visibleTasks.map((task, taskIndex) => {
                  const position = getTaskPositionInWeek(task, week);
                  if (!position) return null;
                  const taskColor = getTaskColor(task);
                  const thickness = getTaskThickness(task);
                  const top = 24 + taskIndex * ROW_HEIGHT_PER_TASK;
                  
                  return (
                    <TouchableOpacity
                      key={task.id}
                      style={[
                        styles.taskLine,
                        {
                          left: position.left + '%',
                          width: position.width + '%',
                          top,
                          height: thickness,
                          backgroundColor: taskColor,
                        },
                      ]}
                      activeOpacity={0.8}
                      onPress={() => onPressTask(task)}
                    >
                      <View
                        style={[
                          styles.deadlineDot,
                          {
                            width: thickness + 4,
                            height: thickness + 4,
                            borderRadius: (thickness + 4) / 2,
                            backgroundColor: taskColor,
                            borderColor: colors.background,
                          },
                        ]}
                      />
                    </TouchableOpacity>
                  );
                })}
              </View>
              
              {/* Единая кнопка развернуть/свернуть с "+N" внутри */}
              {hasOverflow && (
                <TouchableOpacity
                  style={[styles.expandButton, { backgroundColor: colors.surface }]}
                  activeOpacity={0.6}
                  onPress={() => toggleWeekExpansion(weekIndex)}
                >
                  <Text style={[styles.expandButtonText, { color: colors.accent }]}>
                    {isExpanded ? '▲ Свернуть' : `▼ Развернуть (+${hiddenCount})`}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })}
      </ScrollView>
      
      <View style={[styles.legend, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
        <View style={styles.legendRow}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: PRIORITY_COLORS.high }]} />
            <Text style={[styles.legendText, { color: colors.textSecondary }]}>Высокий</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: PRIORITY_COLORS.medium }]} />
            <Text style={[styles.legendText, { color: colors.textSecondary }]}>Средний</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: PRIORITY_COLORS.low }]} />
            <Text style={[styles.legendText, { color: colors.textSecondary }]}>Низкий</Text>
          </View>
        </View>
        <Text style={[styles.legendHint, { color: colors.textMuted }]}>
          Толщина линии = приоритет • Точка = дедлайн
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    padding: 16,
    paddingTop: 20,
    alignItems: 'center',
  },
  monthTitle: {
    fontSize: 24,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  weekDaysHeader: {
    flexDirection: 'row',
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  weekDayCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
  },
  weekDayText: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  calendarGrid: {
    flex: 1,
    paddingHorizontal: 8,
  },
  weekRow: {
    position: 'relative',
    marginBottom: 8,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
  },
  daysContainer: {
    flexDirection: 'row',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '100%',
  },
  dayCell: {
    flex: 1,
    padding: 4,
    borderRightWidth: 1,
  },
  dayNumber: {
    fontSize: 11,
    fontWeight: '600',
  },
  taskLinesContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '100%',
    paddingHorizontal: 8,
  },
  taskLine: {
    position: 'absolute',
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingRight: 2,
  },
  deadlineDot: {
    borderWidth: 2,
  },
  expandButton: {
    position: 'absolute',
    bottom: 4,
    left: 8,
    right: 8,
    paddingVertical: 6,
    borderRadius: 6,
    alignItems: 'center',
    zIndex: 10,
  },
  expandButtonText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  legend: {
    padding: 12,
    borderTopWidth: 1,
  },
  legendRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendText: {
    fontSize: 11,
    fontWeight: '500',
  },
  legendHint: {
    fontSize: 10,
    textAlign: 'center',
    fontStyle: 'italic',
  },
});