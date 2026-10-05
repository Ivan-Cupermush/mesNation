import React, { useMemo, useRef } from 'react';
import { View, Text, TouchableOpacity, Animated, PanResponder, LayoutChangeEvent } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { T, themed } from '../theme/runtime';

/**
 * Календарь заметок, который сворачивается при прокрутке списка, как в
 * календаре iOS: строки месяца плавно уезжают под заголовок, остаётся
 * неделя с выбранным днём. Всё движение — трансформации от прокрутки
 * (нативный драйвер), поэтому без рывков.
 *
 * Свайп влево/вправо: в развёрнутом виде листает месяцы, в свёрнутом —
 * недели. Календарь лежит поверх списка; его прозрачные места пропускают
 * касания к заметкам.
 */

export const CAL_TITLE_H = 48;
export const CAL_WEEKDAYS_H = 26;
export const CAL_ROW_H = 46;
export const CAL_ROWS = 6;
export const CAL_HEAD_H = CAL_TITLE_H + CAL_WEEKDAYS_H;
/** Полная высота календаря и путь прокрутки до свёрнутого вида. */
export const CAL_FULL_H = CAL_HEAD_H + CAL_ROWS * CAL_ROW_H;
export const CAL_COLLAPSE = (CAL_ROWS - 1) * CAL_ROW_H;

const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

export const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Всегда 6 недель: высота календаря не прыгает от месяца к месяцу. */
export function monthGrid(month: Date): Date[][] {
  const y = month.getFullYear();
  const m = month.getMonth();
  const lead = (new Date(y, m, 1).getDay() + 6) % 7;
  const rows: Date[][] = [];
  for (let r = 0; r < CAL_ROWS; r++) {
    rows.push(Array.from({ length: 7 }, (_, c) => new Date(y, m, 1 - lead + r * 7 + c)));
  }
  return rows;
}

interface Props {
  month: Date;
  selected: Date;
  /** Дни с заметками: ключ YYYY-MM-DD. */
  marked: Set<string>;
  scrollY: Animated.Value;
  /** Свёрнут ли сейчас календарь (для свайпа: месяц или неделя). */
  isCollapsed: () => boolean;
  onSelect: (d: Date) => void;
  onMonthChange: (d: Date) => void;
  onToday: () => void;
  /** Вертикальный жест по календарю двигает список (сворачивает/разворачивает). */
  onVerticalDrag?: (phase: 'start' | 'move' | 'end', dy: number, vy: number) => void;
}

export default function NotesCalendar({ month, selected, marked, scrollY, isCollapsed, onSelect, onMonthChange, onToday, onVerticalDrag }: Props) {
  const rows = useMemo(() => monthGrid(month), [month]);
  const todayKey = dayKey(new Date());
  const selKey = dayKey(selected);

  // Неделя, которая остаётся в свёрнутом виде: выбранная, иначе текущая, иначе первая.
  const pinned = useMemo(() => {
    const find = (k: string) => rows.findIndex((r) => r.some((d) => dayKey(d) === k));
    const s = find(selKey);
    if (s >= 0) return s;
    const t = find(todayKey);
    return t >= 0 ? t : 0;
  }, [rows, selKey, todayKey]);

  // Выбранная неделя и строки над ней поднимаются под заголовок;
  // строки под ней едут вместе со списком и уходят под выбранную.
  const pinnedShift = scrollY.interpolate({
    inputRange: [0, CAL_COLLAPSE],
    outputRange: [0, -pinned * CAL_ROW_H],
    extrapolate: 'clamp',
  });
  const belowShift = scrollY.interpolate({
    inputRange: [0, CAL_FULL_H * 4],
    outputRange: [0, -CAL_FULL_H * 4],
    extrapolate: 'clamp',
  });
  const dividerOpacity = scrollY.interpolate({
    inputRange: [CAL_COLLAPSE - 24, CAL_COLLAPSE],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  // ---------- Свайп: месяцы / недели ----------
  const width = useRef(0);
  const swipeX = useRef(new Animated.Value(0)).current;
  const handlers = useRef({ onSelect, onMonthChange, month, selected, isCollapsed, onVerticalDrag });
  handlers.current = { onSelect, onMonthChange, month, selected, isCollapsed, onVerticalDrag };
  const axis = useRef<'x' | 'y'>('x');

  const shift = (dir: 1 | -1) => {
    const h = handlers.current;
    if (h.isCollapsed()) {
      const d = new Date(h.selected);
      d.setDate(d.getDate() + dir * 7);
      h.onSelect(d);
      if (d.getMonth() !== h.month.getMonth() || d.getFullYear() !== h.month.getFullYear()) {
        h.onMonthChange(new Date(d.getFullYear(), d.getMonth(), 1));
      }
    } else {
      h.onMonthChange(new Date(h.month.getFullYear(), h.month.getMonth() + dir, 1));
    }
  };

  const slide = (dir: 1 | -1) => {
    const w = width.current || 360;
    Animated.timing(swipeX, { toValue: -dir * w, duration: 160, useNativeDriver: true }).start(() => {
      shift(dir);
      swipeX.setValue(dir * w * 0.6);
      Animated.spring(swipeX, { toValue: 0, useNativeDriver: true, friction: 9, tension: 80 }).start();
    });
  };

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => {
        if (Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5) {
          axis.current = 'x';
          return true;
        }
        if (handlers.current.onVerticalDrag && Math.abs(g.dy) > 10 && Math.abs(g.dy) > Math.abs(g.dx) * 1.5) {
          axis.current = 'y';
          handlers.current.onVerticalDrag('start', 0, 0);
          return true;
        }
        return false;
      },
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (_e, g) => {
        if (axis.current === 'x') swipeX.setValue(g.dx);
        else handlers.current.onVerticalDrag?.('move', g.dy, g.vy);
      },
      onPanResponderRelease: (_e, g) => {
        if (axis.current === 'y') {
          handlers.current.onVerticalDrag?.('end', g.dy, g.vy);
          return;
        }
        const w = width.current || 360;
        if (Math.abs(g.dx) > w * 0.22 || Math.abs(g.vx) > 0.5) slide(g.dx < 0 ? 1 : -1);
        else Animated.spring(swipeX, { toValue: 0, useNativeDriver: true, friction: 8 }).start();
      },
      onPanResponderTerminate: (_e, g) => {
        if (axis.current === 'y') handlers.current.onVerticalDrag?.('end', g.dy, 0);
        else Animated.spring(swipeX, { toValue: 0, useNativeDriver: true }).start();
      },
    }),
  ).current;

  const renderRow = (r: number) => {
    const shiftY = r > pinned ? belowShift : pinnedShift;
    return (
      <Animated.View key={r} style={[styles.row, { top: CAL_HEAD_H + r * CAL_ROW_H, transform: [{ translateY: shiftY }] }]}>
        <Animated.View style={[styles.rowInner, { transform: [{ translateX: swipeX }] }]}>
          {rows[r].map((d) => {
            const k = dayKey(d);
            const isSel = k === selKey;
            const isToday = k === todayKey;
            const inMonth = d.getMonth() === month.getMonth();
            return (
              <TouchableOpacity key={k} style={styles.cell} onPress={() => onSelect(d)} activeOpacity={0.6} accessibilityLabel={`${d.getDate()} ${MONTHS[d.getMonth()]}`}>
                <View style={[styles.day, isSel && styles.daySel, isToday && !isSel && styles.dayToday]}>
                  <Text
                    style={[
                      styles.dayText,
                      !inMonth && styles.dayOut,
                      isToday && !isSel && styles.dayTodayText,
                      isSel && styles.daySelText,
                    ]}
                  >
                    {d.getDate()}
                  </Text>
                </View>
                <View style={[styles.dot, marked.has(k) ? (isSel ? styles.dotSel : styles.dotOn) : null]} />
              </TouchableOpacity>
            );
          })}
        </Animated.View>
      </Animated.View>
    );
  };

  // Порядок отрисовки = порядок наложения: нижние строки, верхние, выбранная, заголовок.
  const order = [
    ...Array.from({ length: CAL_ROWS }, (_, r) => r).filter((r) => r > pinned),
    ...Array.from({ length: CAL_ROWS }, (_, r) => r).filter((r) => r < pinned),
    pinned,
  ];

  return (
    <View
      style={styles.wrap}
      pointerEvents="box-none"
      onLayout={(e: LayoutChangeEvent) => (width.current = e.nativeEvent.layout.width)}
      {...pan.panHandlers}
    >
      {order.map(renderRow)}
      <Animated.View
        pointerEvents="none"
        style={[styles.divider, { top: CAL_HEAD_H + CAL_ROW_H, opacity: dividerOpacity }]}
      />
      <View style={styles.head}>
        <View style={styles.titleRow}>
          <TouchableOpacity onPress={onToday} activeOpacity={0.6} accessibilityLabel="К сегодняшнему дню">
            <Text style={styles.title}>
              {MONTHS[month.getMonth()]} <Text style={styles.year}>{month.getFullYear()}</Text>
            </Text>
          </TouchableOpacity>
          <View style={styles.nav}>
            <TouchableOpacity onPress={() => slide(-1)} style={styles.navBtn} hitSlop={8} accessibilityLabel="Назад">
              <ChevronLeft size={22} color={T.accent} strokeWidth={2.4} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => slide(1)} style={styles.navBtn} hitSlop={8} accessibilityLabel="Вперёд">
              <ChevronRight size={22} color={T.accent} strokeWidth={2.4} />
            </TouchableOpacity>
          </View>
        </View>
        <View style={styles.weekdays}>
          {WEEKDAYS.map((w, i) => (
            <Text key={w} style={[styles.weekday, i >= 5 && styles.weekend]}>
              {w}
            </Text>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = themed(() => ({
  wrap: { height: CAL_FULL_H, overflow: 'hidden' },
  head: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: CAL_HEAD_H,
    paddingHorizontal: 16,
    backgroundColor: T.background,
  },
  titleRow: { height: CAL_TITLE_H, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 4 },
  title: { fontSize: 21, fontWeight: '800', color: T.textPrimary, letterSpacing: -0.3 },
  year: { color: T.accent, fontWeight: '800' },
  nav: { flexDirection: 'row', gap: 4 },
  navBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: T.surface },
  weekdays: { height: CAL_WEEKDAYS_H, flexDirection: 'row', alignItems: 'center' },
  weekday: { flex: 1, textAlign: 'center', fontSize: 12, fontWeight: '600', color: T.textMuted },
  weekend: { color: T.textSecondary },
  row: { position: 'absolute', left: 0, right: 0, height: CAL_ROW_H, backgroundColor: T.background, paddingHorizontal: 16 },
  rowInner: { flex: 1, flexDirection: 'row' },
  cell: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  day: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  daySel: { backgroundColor: T.accent },
  dayToday: { backgroundColor: T.accentMuted },
  dayText: { fontSize: 16, fontWeight: '500', color: T.textPrimary },
  dayOut: { color: T.textMuted, opacity: 0.55 },
  dayTodayText: { color: T.accent, fontWeight: '700' },
  daySelText: { color: T.onAccent, fontWeight: '700' },
  dot: { width: 4, height: 4, borderRadius: 2, marginTop: 2, backgroundColor: 'transparent' },
  dotOn: { backgroundColor: T.accent },
  dotSel: { backgroundColor: T.accent },
  divider: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: T.border },
}));
