import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator,
  Alert, ScrollView, StatusBar, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { pick } from '@react-native-documents/picker';
import { api, ImportPreview } from '../../services/api';
import {
  ArrowLeft, FileSpreadsheet, Upload, CheckCircle2, AlertCircle,
  TrendingUp, FileCheck, XCircle,
} from 'lucide-react-native';

type Step = 'pick' | 'preview' | 'importing' | 'done';

export default function ImportExcelScreen({ navigation }: any) {
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
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FAFAF8" />

      {/* Header row с back-кнопкой */}
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <ArrowLeft size={22} color="#141414" strokeWidth={2.2} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>Импорт</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Большой премиум заголовок */}
        <View style={styles.heroHeader}>
          <Text style={styles.bigTitle}>ИМПОРТ EXCEL</Text>
          <Text style={styles.bigSubtitle}>Загрузка KPI из файла</Text>
        </View>

        {/* ШАГ 1: Выбор файла */}
        {step === 'pick' && (
          <View style={styles.card}>
            <View style={styles.centerIconWrap}>
              <FileSpreadsheet size={48} color="#1F7A52" strokeWidth={1.8} />
            </View>
            <Text style={styles.mainText}>Выберите файл с продажами</Text>
            <Text style={styles.subText}>
              Поддерживаются форматы .xlsx, .xls и .csv
            </Text>

            {error && (
              <View style={styles.errorBox}>
                <AlertCircle size={18} color="#991B1B" />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <TouchableOpacity
              onPress={handlePickFile}
              activeOpacity={0.85}
              style={styles.primaryBtn}
            >
              <Upload size={18} color="#fff" strokeWidth={2.5} />
              <Text style={styles.primaryBtnText}>Выбрать файл</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ШАГ 2: Превью */}
        {step === 'preview' && preview && (
          <>
            {/* Инфо карточка */}
            <View style={styles.card}>
              <View style={styles.fileNameRow}>
                <View style={styles.fileNameIconWrap}>
                  <FileCheck size={20} color="#1F7A52" strokeWidth={2.2} />
                </View>
                <Text style={styles.fileNameText} numberOfLines={1}>
                  {preview.fileName}
                </Text>
              </View>

              <View style={styles.statsRow}>
                <View style={styles.miniStat}>
                  <Text style={styles.miniStatLabel}>Строк</Text>
                  <Text style={styles.miniStatValue}>{preview.totalRows}</Text>
                </View>
                <View style={styles.miniStatDivider} />
                <View style={styles.miniStat}>
                  <Text style={styles.miniStatLabel}>Сумма</Text>
                  <Text style={[styles.miniStatValue, { color: '#1F7A52' }]}>
                    {formatMoney(preview.totalAmount)}
                  </Text>
                </View>
                <View style={styles.miniStatDivider} />
                <View style={styles.miniStat}>
                  <Text style={styles.miniStatLabel}>Валидно</Text>
                  <Text style={[styles.miniStatValue, { color: '#10B981' }]}>
                    {preview.validation.valid}
                  </Text>
                </View>
              </View>
            </View>

            {/* Таблица предпросмотра */}
            <Text style={styles.sectionTitle}>
              Предпросмотр ({Math.min(preview.preview.length, 5)} из {preview.totalRows})
            </Text>
            <View style={styles.tableCard}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.table}>
                  {/* Заголовки */}
                  <View style={styles.tableRow}>
                    {preview.headers.map((h, i) => (
                      <Text key={i} style={styles.tableHeaderCell}>
                        {h}
                      </Text>
                    ))}
                  </View>
                  {/* Данные */}
                  {preview.preview.map((row, rowIdx) => (
                    <View
                      key={rowIdx}
                      style={[styles.tableRow, rowIdx % 2 === 1 && styles.tableRowAlt]}
                    >
                      {preview.headers.map((h, i) => (
                        <Text key={i} style={styles.tableCell}>
                          {String(row[h] || '').substring(0, 20)}
                        </Text>
                      ))}
                    </View>
                  ))}
                </View>
              </ScrollView>
            </View>

            {/* Ошибки */}
            {preview.validation.errors.length > 0 && (
              <View style={styles.warningBox}>
                <View style={styles.warningHeader}>
                  <AlertCircle size={18} color="#92400E" strokeWidth={2.2} />
                  <Text style={styles.warningTitle}>Найдены ошибки</Text>
                </View>
                {preview.validation.errors.slice(0, 3).map((e, i) => (
                  <Text key={i} style={styles.warningLine}>• {e}</Text>
                ))}
                <Text style={styles.warningHint}>
                  Эти строки будут пропущены при импорте.
                </Text>
              </View>
            )}

            <TouchableOpacity
              onPress={handleConfirmImport}
              activeOpacity={0.85}
              style={styles.primaryBtn}
            >
              <CheckCircle2 size={18} color="#fff" strokeWidth={2.5} />
              <Text style={styles.primaryBtnText}>
                Импортировать {preview.totalRows} строк
              </Text>
            </TouchableOpacity>
          </>
        )}

        {/* ШАГ 3: Загрузка */}
        {step === 'importing' && (
          <View style={styles.card}>
            <View style={styles.centerIconWrap}>
              <ActivityIndicator size="large" color="#1F7A52" />
            </View>
            <Text style={styles.mainText}>Сохраняем данные...</Text>
            <Text style={styles.subText}>Это займёт несколько секунд</Text>
          </View>
        )}

        {/* ШАГ 4: Успех */}
        {step === 'done' && importResult && (
          <>
            <View style={styles.card}>
              <View style={[styles.centerIconWrap, { backgroundColor: '#D1FAE5' }]}>
                <CheckCircle2 size={44} color="#1F7A52" strokeWidth={2} />
              </View>
              <Text style={styles.mainText}>Импорт завершён!</Text>
              <Text style={styles.subText}>Данные успешно сохранены</Text>

              <View style={styles.resultGrid}>
                <View style={styles.resultCard}>
                  <CheckCircle2 size={20} color="#1F7A52" />
                  <Text style={styles.resultValue}>{importResult.imported}</Text>
                  <Text style={styles.resultLabel}>Добавлено</Text>
                </View>
                <View style={styles.resultCard}>
                  <XCircle size={20} color="#6F6F73" />
                  <Text style={styles.resultValue}>{importResult.skipped}</Text>
                  <Text style={styles.resultLabel}>Пропущено</Text>
                </View>
                <View style={styles.resultCard}>
                  <TrendingUp size={20} color="#3B82F6" />
                  <Text style={styles.resultValue} numberOfLines={1}>
                    {formatMoney(importResult.totalAmount)}
                  </Text>
                  <Text style={styles.resultLabel}>Сумма</Text>
                </View>
              </View>
            </View>

            <TouchableOpacity
              onPress={() => navigation.goBack()}
              activeOpacity={0.85}
              style={styles.primaryBtn}
            >
              <Text style={styles.primaryBtnText}>Вернуться к статистике</Text>
            </TouchableOpacity>
          </>
        )}

        <View style={{ height: 80 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAF8' },
  scrollContent: { paddingHorizontal: 24, paddingTop: 4 },

  // ===== HEADER =====
  headerRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 12,
    backgroundColor: '#FAFAF8',
  },
  backBtn: {
    width: 44, height: 44, borderRadius: 14, backgroundColor: '#FFFFFF',
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.05, shadowRadius: 24, elevation: 4,
  },
  headerTitle: {
    fontSize: 17, fontWeight: '700', flex: 1, textAlign: 'center', color: '#141414',
    fontFamily: Platform.OS === 'ios' ? 'Montserrat' : 'sans-serif-medium',
  },

  // ===== HERO HEADER =====
  heroHeader: { marginBottom: 20, paddingTop: 8 },
  bigTitle: {
    fontFamily: Platform.OS === 'ios' ? 'Bebas Neue' : 'sans-serif-condensed',
    fontSize: 40, fontWeight: '900', color: '#141414', letterSpacing: -0.5, lineHeight: 44,
  },
  bigSubtitle: {
    fontFamily: Platform.OS === 'ios' ? 'Didot' : 'serif',
    fontSize: 18, fontStyle: 'italic', color: '#6F6F73', marginTop: 4,
  },

  // ===== CARD =====
  card: {
    backgroundColor: '#FFFFFF', borderRadius: 22, padding: 24, marginBottom: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.05, shadowRadius: 24, elevation: 4,
    alignItems: 'center',
  },
  centerIconWrap: {
    width: 88, height: 88, borderRadius: 24, backgroundColor: '#E8F5EE',
    justifyContent: 'center', alignItems: 'center', marginBottom: 20,
  },
  mainText: {
    fontSize: 20, fontWeight: '700', textAlign: 'center', color: '#141414', marginBottom: 8,
    fontFamily: Platform.OS === 'ios' ? 'Montserrat' : 'sans-serif-medium',
  },
  subText: {
    fontSize: 14, textAlign: 'center', color: '#6F6F73', marginBottom: 24, fontWeight: '500',
  },

  // ===== ERROR / WARNING =====
  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#FEE2E2', padding: 14, borderRadius: 14, marginBottom: 16, width: '100%',
  },
  errorText: { flex: 1, color: '#991B1B', fontSize: 13, fontWeight: '500' },
  warningBox: {
    backgroundColor: '#FEF3C7', padding: 16, borderRadius: 16, marginBottom: 16, width: '100%',
  },
  warningHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8,
  },
  warningTitle: { color: '#92400E', fontWeight: '700', fontSize: 14 },
  warningLine: { color: '#92400E', fontSize: 12, marginLeft: 26, marginTop: 2 },
  warningHint: { color: '#92400E', fontSize: 11, marginTop: 8, fontStyle: 'italic' },

  // ===== FILE NAME =====
  fileNameRow: {
    flexDirection: 'row', alignItems: 'center', marginBottom: 18, width: '100%',
  },
  fileNameIconWrap: {
    width: 40, height: 40, borderRadius: 12, backgroundColor: '#D1FAE5',
    justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  fileNameText: {
    fontSize: 15, fontWeight: '700', color: '#141414', flex: 1,
    fontFamily: Platform.OS === 'ios' ? 'Montserrat' : 'sans-serif-medium',
  },

  // ===== MINI STATS (в превью) =====
  statsRow: {
    flexDirection: 'row', width: '100%', backgroundColor: '#F9FAFB',
    borderRadius: 16, paddingVertical: 14, paddingHorizontal: 8,
  },
  miniStat: { flex: 1, alignItems: 'center' },
  miniStatLabel: { fontSize: 11, color: '#6F6F73', fontWeight: '600', marginBottom: 4 },
  miniStatValue: {
    fontSize: 14, fontWeight: '800', color: '#141414',
    fontFamily: Platform.OS === 'ios' ? 'Montserrat' : 'sans-serif-medium',
  },
  miniStatDivider: { width: 1, backgroundColor: '#E5E7EB' },

  // ===== SECTION TITLE =====
  sectionTitle: {
    fontSize: 18, fontWeight: '700', color: '#141414', marginBottom: 12,
    fontFamily: Platform.OS === 'ios' ? 'Montserrat' : 'sans-serif-medium',
  },

  // ===== TABLE =====
  tableCard: {
    backgroundColor: '#FFFFFF', borderRadius: 18, padding: 8, marginBottom: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.04, shadowRadius: 16, elevation: 3,
    overflow: 'hidden',
  },
  table: { borderRadius: 12, overflow: 'hidden' },
  tableRow: { flexDirection: 'row', backgroundColor: '#F9FAFB' },
  tableRowAlt: { backgroundColor: '#FFFFFF' },
  tableHeaderCell: {
    padding: 12, minWidth: 110, fontWeight: '700', fontSize: 12,
    color: '#141414', backgroundColor: '#F3F4F6',
    borderRightWidth: 1, borderRightColor: '#E5E7EB',
    fontFamily: Platform.OS === 'ios' ? 'Montserrat' : 'sans-serif-medium',
  },
  tableCell: {
    padding: 12, minWidth: 110, fontSize: 12, color: '#6F6F73',
    borderRightWidth: 1, borderRightColor: '#F3F4F6',
  },

  // ===== PRIMARY BUTTON =====
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    width: '100%', paddingVertical: 16, borderRadius: 18,
    backgroundColor: '#1F7A52', marginTop: 8,
    shadowColor: '#1F7A52', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 5,
  },
  primaryBtnText: {
    fontSize: 15, fontWeight: '700', color: '#FFFFFF',
    fontFamily: Platform.OS === 'ios' ? 'Montserrat' : 'sans-serif-medium',
  },

  // ===== RESULT GRID (после импорта) =====
  resultGrid: { flexDirection: 'row', gap: 8, width: '100%', marginTop: 16 },
  resultCard: {
    flex: 1, backgroundColor: '#F9FAFB', borderRadius: 14, padding: 12, alignItems: 'center',
  },
  resultValue: {
    fontSize: 16, fontWeight: '800', color: '#141414', marginTop: 6,
    fontFamily: Platform.OS === 'ios' ? 'Montserrat' : 'sans-serif-medium',
  },
  resultLabel: { fontSize: 10, color: '#6F6F73', fontWeight: '600', marginTop: 2 },
});
