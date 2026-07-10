import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Platform, Modal,
} from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useTheme } from '../../theme/ThemeContext';

interface DatePickerFieldProps {
  label: string;
  value: Date | null;
  onChange: (date: Date | null) => void;
  mode?: 'date' | 'time' | 'datetime';
  placeholder?: string;
  minimumDate?: Date;
  icon?: string;
}

export const DatePickerField = ({
  label,
  value,
  onChange,
  mode = 'date',
  placeholder = 'Выберите дату',
  minimumDate,
  icon = '📅',
}: DatePickerFieldProps) => {
  const { colors } = useTheme();
  
  // Для Android с datetime: два этапа
  const [showDate, setShowDate] = useState(false);
  const [showTime, setShowTime] = useState(false);
  const [tempDate, setTempDate] = useState<Date>(value || new Date());

  const handleOpen = () => {
    setTempDate(value || new Date());
    if (mode === 'time') {
      setShowTime(true);
    } else if (mode === 'datetime' && Platform.OS === 'android') {
      // Android: сначала дата
      setShowDate(true);
    } else {
      // iOS или просто date
      setShowDate(true);
    }
  };

  const handleDateChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowDate(false);
      if (event.type === 'set' && selectedDate) {
        if (mode === 'datetime') {
          // После выбора даты — открываем время
          setTempDate(selectedDate);
          setTimeout(() => setShowTime(true), 100);
        } else {
          onChange(selectedDate);
        }
      }
    } else {
      // iOS: просто обновляем временную дату
      if (selectedDate) {
        setTempDate(selectedDate);
      }
    }
  };

  const handleTimeChange = (event: DateTimePickerEvent, selectedTime?: Date) => {
    if (Platform.OS === 'android') {
      setShowTime(false);
      if (event.type === 'set' && selectedTime) {
        // Объединяем дату и время
        if (mode === 'datetime') {
          const finalDate = new Date(tempDate);
          finalDate.setHours(selectedTime.getHours());
          finalDate.setMinutes(selectedTime.getMinutes());
          onChange(finalDate);
        } else {
          onChange(selectedTime);
        }
      }
    } else {
      if (selectedTime) {
        setTempDate(selectedTime);
      }
    }
  };

  const handleConfirm = () => {
    onChange(tempDate);
    setShowDate(false);
    setShowTime(false);
  };

  const handleCancel = () => {
    setShowDate(false);
    setShowTime(false);
  };

  const formatDate = (d: Date): string => {
    return d.toLocaleDateString('ru-RU', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    });
  };

  const formatTime = (d: Date): string => {
    return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  };

  const formatValue = (d: Date): string => {
    const now = new Date();
    const diffDays = Math.floor((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    
    if (mode === 'time') {
      return formatTime(d);
    }
    if (mode === 'datetime') {
      let prefix = '';
      if (diffDays === 0) prefix = 'Сегодня';
      else if (diffDays === 1) prefix = 'Завтра';
      else if (diffDays === -1) prefix = 'Вчера';
      else if (diffDays > 1 && diffDays <= 7) prefix = `Через ${diffDays} дн.`;
      else if (diffDays < -1) prefix = `${Math.abs(diffDays)} дн. назад`;
      else prefix = formatDate(d);
      return `${prefix}, ${formatTime(d)}`;
    }
    // mode === 'date'
    if (diffDays === 0) return `Сегодня, ${formatDate(d)}`;
    if (diffDays === 1) return `Завтра, ${formatDate(d)}`;
    if (diffDays === -1) return `Вчера, ${formatDate(d)}`;
    if (diffDays > 1 && diffDays <= 7) return `Через ${diffDays} дн., ${formatDate(d)}`;
    if (diffDays < -1) return `${Math.abs(diffDays)} дн. назад, ${formatDate(d)}`;
    return formatDate(d);
  };

  const getIcon = () => {
    if (mode === 'time') return '🕐';
    if (mode === 'datetime') return '📅';
    return icon;
  };

  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text>
      <TouchableOpacity
        onPress={handleOpen}
        style={[
          styles.field,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
          },
        ]}
      >
        <Text style={[styles.icon]}>{getIcon()}</Text>
        <Text
          style={[
            styles.value,
            { color: value ? colors.textPrimary : colors.textMuted },
          ]}
        >
          {value ? formatValue(value) : placeholder}
        </Text>
        {value && (
          <TouchableOpacity
            onPress={(e) => {
              e.stopPropagation();
              onChange(null);
            }}
            style={{ padding: 4 }}
          >
            <Text style={{ color: colors.textMuted, fontSize: 18 }}>✕</Text>
          </TouchableOpacity>
        )}
      </TouchableOpacity>

      {/* ===== ANDROID: Date picker ===== */}
      {Platform.OS === 'android' && showDate && (
        <DateTimePicker
          value={tempDate}
          mode="date"
          display="default"
          onChange={handleDateChange}
          minimumDate={minimumDate}
        />
      )}

      {/* ===== ANDROID: Time picker ===== */}
      {Platform.OS === 'android' && showTime && (
        <DateTimePicker
          value={tempDate}
          mode="time"
          display="default"
          onChange={handleTimeChange}
          is24Hour
        />
      )}

      {/* ===== iOS: Modal с picker ===== */}
      {Platform.OS === 'ios' && (
        <Modal visible={showDate || showTime} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: colors.elevated }]}>
              <View style={[styles.modalHeader, { borderBottomColor: colors.divider }]}>
                <TouchableOpacity onPress={handleCancel}>
                  <Text style={{ color: colors.accent, fontSize: 16 }}>Отмена</Text>
                </TouchableOpacity>
                <Text style={{ color: colors.textPrimary, fontWeight: '600', fontSize: 16 }}>
                  {label}
                </Text>
                <TouchableOpacity onPress={handleConfirm}>
                  <Text style={{ color: colors.accent, fontSize: 16, fontWeight: '600' }}>Готово</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={tempDate}
                mode={mode === 'datetime' ? 'date' : mode}
                display="spinner"
                onChange={handleDateChange}
                minimumDate={minimumDate}
                is24Hour
              />
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '600', marginBottom: 6, marginLeft: 2 },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  icon: { fontSize: 18, marginRight: 10 },
  value: { flex: 1, fontSize: 15 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 32,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});