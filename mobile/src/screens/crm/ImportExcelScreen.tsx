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
