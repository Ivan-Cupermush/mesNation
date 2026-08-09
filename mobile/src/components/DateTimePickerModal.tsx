import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View, Text, Modal, TouchableOpacity, ScrollView, StyleSheet, Platform,
} from 'react-native';
import { ChevronLeft, ChevronRight, ChevronDown, X } from 'lucide-react-native';

const MONTHS = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
const MONTHS_SHORT = ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек'];
const WEEKDAYS = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);
const pad2 = (n: number) => String(n).padStart(2, '0');

const ITEM_H = 34;
const VISIBLE = 5;
const WHEEL_H = ITEM_H * VISIBLE;
const WHEEL_PAD = (WHEEL_H - ITEM_H) / 2;

function Wheel({ items, value, onChange }: { items: number[]; value: number; onChange: (v: number) => void }) {
  const ref = useRef<ScrollView>(null);
  const [center, setCenter] = useState(value);

  useEffect(() => {
    const t = setTimeout(() => {
      ref.current?.scrollTo({ y: value * ITEM_H, animated: false });
      setCenter(value);
    }, 60);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const idxFrom = (y: number) => Math.max(0, Math.min(items.length - 1, Math.round(y / ITEM_H)));

  return (
    <View style={{ height: WHEEL_H, flex: 1, position: 'relative' }}>
      <ScrollView
        ref={ref}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_H}
        snapToAlignment="center"
        decelerationRate="fast"
        onScroll={(e) => setCenter(idxFrom(e.nativeEvent.contentOffset.y))}
        onScrollEndDrag={(e) => onChange(idxFrom(e.nativeEvent.contentOffset.y))}
        onMomentumScrollEnd={(e) => onChange(idxFrom(e.nativeEvent.contentOffset.y))}
        contentContainerStyle={{ paddingVertical: WHEEL_PAD }}
      >
        {items.map((it) => {
          const active = it === center;
          return (
            <View key={it} style={{ height: ITEM_H, justifyContent: 'center', alignItems: 'center' }}>
              <Text style={{ fontSize: active ? 20 : 15, fontWeight: active ? '700' : '500', color: active ? '#141414' : '#C9C9CE' }}>
                {pad2(it)}
              </Text>
            </View>
          );
        })}
      </ScrollView>
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { justifyContent: 'center' }]}>
        <View style={{ height: ITEM_H, borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#E5E5EA', backgroundColor: 'rgba(31,122,82,0.05)', borderRadius: 8 }} />
      </View>
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { justifyContent: 'space-between' }]}>
        <View style={{ height: WHEEL_PAD }}>
          <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.9)' }} />
          <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.55)' }} />
          <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.25)' }} />
        </View>
        <View style={{ height: WHEEL_PAD }}>
          <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.25)' }} />
          <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.55)' }} />
          <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.9)' }} />
        </View>
      </View>
    </View>
  );
}

export default function DateTimePickerModal({ visible, initialDate, minDate, title, onSave, onClose }: any) {
  const [month, setMonth] = useState(new Date());
  const [day, setDay] = useState(new Date());
  const [hour, setHour] = useState(12);
  const [minute, setMinute] = useState(0);
  const [openTick, setOpenTick] = useState(0);
  const [showMonthYear, setShowMonthYear] = useState(false);
  const [selMonth, setSelMonth] = useState(0);
  const [selYear, setSelYear] = useState(new Date().getFullYear());

  useEffect(() => {
    if (visible) {
      const base = initialDate ? new Date(initialDate) : new Date();
      setMonth(new Date(base.getFullYear(), base.getMonth(), 1));
      setDay(base);
      setHour(base.getHours());
      setMinute(base.getMinutes());
      setOpenTick((t) => t + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const minDay = minDate ? new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate()) : null;

  const days = useMemo(() => {
    const y = month.getFullYear();
    const m = month.getMonth();
    const first = new Date(y, m, 1);
    const last = new Date(y, m + 1, 0);
    const arr: (Date | null)[] = [];
    const shift = (first.getDay() + 6) % 7;
    for (let i = 0; i < shift; i++) arr.push(null);
    for (let d = 1; d <= last.getDate(); d++) arr.push(new Date(y, m, d));
    while (arr.length % 7 !== 0) arr.push(null);
    return arr;
  }, [month]);

  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const isDisabled = (d: Date) => (minDay ? d.getTime() < minDay.getTime() : false);

  const openMonthYear = () => {
    setSelMonth(month.getMonth());
    setSelYear(month.getFullYear());
    setShowMonthYear(true);
  };

  const years = useMemo(() => {
    const now = new Date().getFullYear();
    const arr: number[] = [];
    for (let y = now - 5; y <= now + 5; y++) arr.push(y);
    return arr;
  }, []);

  const handleSave = () => {
    const d = new Date(day);
    d.setHours(hour, minute, 0, 0);
    onSave(d);
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <TouchableOpacity activeOpacity={1} style={styles.overlay} onPress={onClose}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.headerRow}>
            <Text style={styles.title}>{title || 'Дата и время'}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X size={22} color="#6F6F73" strokeWidth={2} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* ===== Календарь ===== */}
            <View style={styles.calHeader}>
              <TouchableOpacity style={styles.calNavBtn} onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>
                <ChevronLeft size={20} color="#1F7A52" strokeWidth={2} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.calTitleBtn} onPress={openMonthYear} activeOpacity={0.7}>
                <Text style={styles.calTitle}>{MONTHS[month.getMonth()]} {month.getFullYear()}</Text>
                <ChevronDown size={16} color="#6F6F73" strokeWidth={2} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.calNavBtn} onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>
                <ChevronRight size={20} color="#1F7A52" strokeWidth={2} />
              </TouchableOpacity>
            </View>

            <View style={styles.weekRow}>
              {WEEKDAYS.map((w) => (
                <View key={w} style={styles.dayCell}><Text style={styles.weekText}>{w}</Text></View>
              ))}
            </View>

            <View style={styles.daysGrid}>
              {days.map((d, i) => {
                if (!d) return <View key={`e${i}`} style={styles.dayCell} />;
                const disabled = isDisabled(d);
                const selected = isSameDay(d, day);
                const today = isSameDay(d, new Date());
                return (
                  <TouchableOpacity key={d.toISOString()} disabled={disabled} onPress={() => setDay(d)} style={styles.dayCell} activeOpacity={0.7}>
                    <View style={[styles.dayBox, selected && styles.dayBoxSelected, !selected && today && styles.dayBoxToday]}>
                      <Text style={[styles.dayText, selected && styles.dayTextSelected, !selected && today && styles.dayTextToday, disabled && styles.dayTextDisabled]}>
                        {d.getDate()}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* ===== Время: крутилки как в iOS ===== */}
            <Text style={styles.timeLabel}>ВРЕМЯ</Text>
            <View style={styles.wheelsRow}>
              <Wheel key={`h${openTick}`} items={HOURS} value={hour} onChange={setHour} />
              <Text style={styles.wheelColon}>:</Text>
              <Wheel key={`m${openTick}`} items={MINUTES} value={minute} onChange={setMinute} />
            </View>
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose} activeOpacity={0.7}>
              <Text style={styles.cancelBtnText}>Отмена</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveBtn} onPress={handleSave} activeOpacity={0.85}>
              <Text style={styles.saveBtnText}>Готово</Text>
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>

      {/* ===== Быстрый выбор месяца/года ===== */}
      <Modal visible={showMonthYear} transparent animationType="fade">
        <TouchableOpacity activeOpacity={1} style={styles.myOverlay} onPress={() => setShowMonthYear(false)}>
          <View style={styles.myCard}>
            <View style={styles.myHeader}>
              <Text style={styles.myTitle}>Выбор периода</Text>
              <TouchableOpacity onPress={() => setShowMonthYear(false)}>
                <X size={20} color="#6F6F73" strokeWidth={2} />
              </TouchableOpacity>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
              <View style={styles.yearsRow}>
                {years.map((y) => (
                  <TouchableOpacity key={y} style={[styles.yearChip, y === selYear && styles.yearChipActive]} onPress={() => setSelYear(y)} activeOpacity={0.7}>
                    <Text style={[styles.yearChipText, y === selYear && styles.yearChipTextActive]}>{y}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
            <View style={styles.monthsGrid}>
              {MONTHS_SHORT.map((m, i) => (
                <TouchableOpacity key={m} style={[styles.monthCell, i === selMonth && styles.monthCellActive]} onPress={() => setSelMonth(i)} activeOpacity={0.7}>
                  <Text style={[styles.monthCellText, i === selMonth && styles.monthCellTextActive]}>{m}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={styles.myDone} onPress={() => { setMonth(new Date(selYear, selMonth, 1)); setShowMonthYear(false); }} activeOpacity={0.85}>
              <Text style={styles.myDoneText}>Готово</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 24, maxHeight: '88%' },
  handle: { width: 40, height: 4, backgroundColor: '#ECECE8', borderRadius: 2, alignSelf: 'center', marginBottom: 12 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  title: { fontFamily: Platform.OS === 'ios' ? 'Bebas Neue' : 'sans-serif-condensed', fontSize: 22, fontWeight: '900', color: '#141414', letterSpacing: 1 },
  closeBtn: { padding: 4 },

  calHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  calNavBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#ECFDF5', alignItems: 'center', justifyContent: 'center' },
  calTitleBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, backgroundColor: '#FAFAF8' },
  calTitle: { fontSize: 16, fontWeight: '700', color: '#141414' },

  weekRow: { flexDirection: 'row', marginBottom: 4 },
  weekText: { fontSize: 11, fontWeight: '700', color: '#9CA3AF', textAlign: 'center' },
  daysGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  dayBox: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  dayBoxSelected: { backgroundColor: '#1F7A52', shadowColor: '#1F7A52', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 4 },
  dayBoxToday: { borderWidth: 1.5, borderColor: '#1F7A52' },
  dayText: { fontSize: 15, fontWeight: '600', color: '#141414', textAlign: 'center' },
  dayTextSelected: { color: '#FFFFFF', fontWeight: '700' },
  dayTextToday: { color: '#1F7A52', fontWeight: '700' },
  dayTextDisabled: { color: '#E5E5EA' },

  timeLabel: { fontSize: 11, fontWeight: '700', color: '#6F6F73', letterSpacing: 0.5, marginTop: 10, marginBottom: 4, textAlign: 'center' },
  wheelsRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 30 },
  wheelColon: { fontSize: 22, fontWeight: '700', color: '#141414', marginHorizontal: 10 },

  footer: { flexDirection: 'row', gap: 10, marginTop: 16 },
  cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 16, backgroundColor: '#F3F4F6', alignItems: 'center' },
  cancelBtnText: { fontSize: 15, fontWeight: '600', color: '#141414' },
  saveBtn: { flex: 1, paddingVertical: 14, borderRadius: 16, backgroundColor: '#1F7A52', alignItems: 'center' },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },

  myOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  myCard: { width: '86%', backgroundColor: '#FFFFFF', borderRadius: 22, padding: 20 },
  myHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  myTitle: { fontSize: 17, fontWeight: '700', color: '#141414' },
  yearsRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 4 },
  yearChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12, backgroundColor: '#FAFAF8', borderWidth: 1, borderColor: '#ECECE8' },
  yearChipActive: { backgroundColor: '#1F7A52', borderColor: '#1F7A52' },
  yearChipText: { fontSize: 14, fontWeight: '600', color: '#141414' },
  yearChipTextActive: { color: '#FFFFFF', fontWeight: '700' },
  monthsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  monthCell: { width: '22%', paddingVertical: 12, borderRadius: 12, backgroundColor: '#FAFAF8', borderWidth: 1, borderColor: '#ECECE8', alignItems: 'center' },
  monthCellActive: { backgroundColor: '#ECFDF5', borderColor: '#1F7A52' },
  monthCellText: { fontSize: 13, fontWeight: '600', color: '#141414' },
  monthCellTextActive: { color: '#1F7A52', fontWeight: '700' },
  myDone: { marginTop: 16, paddingVertical: 14, borderRadius: 16, backgroundColor: '#1F7A52', alignItems: 'center' },
  myDoneText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
});
