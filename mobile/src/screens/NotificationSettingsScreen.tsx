import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Switch, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import notifee from '@notifee/react-native';
import { ChevronLeft, ChevronRight, CalendarClock, ClipboardCheck, MessageCircle, Volume2, BellRing, CheckCircle2, AlertTriangle } from 'lucide-react-native';
import { T, themed } from '../theme/runtime';
import { withAlpha } from '../theme/palettes';
import { NotifySettings, DEFAULT_SETTINGS, IMPORTANCE, getNotifySettings, setNotifySettings } from '../notifications/model';
import { CHANNEL_MESSAGES, CHANNEL_TASKS, showMessageNotification, showTaskNotification } from '../notifications/display';
import { getPushMode } from '../notifications';

/**
 * Уведомления: как они выглядят, что присылать и как звучать.
 * Сообщения оформлены как в Telegram, задачи — заметнее (цвет приоритета,
 * срок, кнопки «Взять в работу» / «Принять»).
 */
export default function NotificationSettingsScreen({ navigation }: any) {
  const [s, setS] = useState<NotifySettings>(DEFAULT_SETTINGS);
  const mode = getPushMode();

  useEffect(() => {
    getNotifySettings().then(setS);
  }, []);

  const update = async (patch: Partial<NotifySettings>) => setS(await setNotifySettings(patch));

  const test = async (kind: 'message' | 'task') => {
    try {
      const perm = await notifee.requestPermission();
      if (perm?.authorizationStatus === 0) {
        Alert.alert('Уведомления выключены', 'Разрешите уведомления для Offix в настройках телефона.', [
          { text: 'Отмена', style: 'cancel' },
          { text: 'Открыть настройки', onPress: () => notifee.openNotificationSettings() },
        ]);
        return;
      }
      if (kind === 'message') {
        await showMessageNotification({
          type: 'message',
          chatId: 'preview',
          chatName: 'Отдел продаж',
          chatAvatar: '',
          isGroup: true,
          topicId: null,
          topicName: '',
          messageId: Date.now(),
          senderId: 0,
          senderName: 'Анна',
          senderAvatar: '',
          text: 'Отчёт за квартал готов, посмотрите, пожалуйста',
          sentAt: Date.now(),
        });
      } else {
        await showTaskNotification({
          type: 'task',
          kind: 'assigned',
          taskId: 0,
          title: 'Подготовить коммерческое предложение',
          description: 'Для клиента «Север», с расчётом скидки',
          importance: 'red',
          deadline: new Date(Date.now() + 26 * 3600 * 1000).toISOString(),
          reviewDeadline: '',
          actorName: 'Иван Петров',
          actorAvatar: '',
          comment: '',
        });
      }
    } catch (e: any) {
      Alert.alert('Не удалось показать', e?.message || '');
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn} accessibilityLabel="Назад">
          <ChevronLeft size={26} color={T.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Уведомления</Text>
        <View style={styles.iconBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {/* Как доставляются */}
        <View style={[styles.status, { backgroundColor: mode === 'push' ? T.successSoft : T.warningSoft }]}>
          {mode === 'push' ? <CheckCircle2 size={20} color={T.success} /> : <AlertTriangle size={20} color={T.warning} />}
          <Text style={[styles.statusText, { color: mode === 'push' ? T.success : T.warning }]}>
            {mode === 'push'
              ? 'Уведомления приходят, даже когда приложение закрыто'
              : 'Уведомления приходят, пока приложение запущено или свёрнуто. Чтобы получать их и при закрытом приложении, администратору нужно подключить Firebase.'}
          </Text>
        </View>

        {/* Как выглядят */}
        <Text style={styles.section}>КАК ВЫГЛЯДЯТ</Text>
        <View style={styles.preview}>
          <View style={styles.shade}>
            <View style={styles.shadeHead}>
              <MessageCircle size={12} color="#1F7A52" />
              <Text style={styles.shadeApp}>Offix · Сообщения · сейчас</Text>
            </View>
            <View style={styles.shadeRow}>
              <View style={[styles.shadeAvatar, { backgroundColor: '#E0559B' }]}>
                <Text style={styles.shadeAvatarText}>А</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.shadeTitle}>Отдел продаж</Text>
                <Text style={styles.shadeText} numberOfLines={2}>
                  <Text style={{ fontWeight: '700' }}>Анна: </Text>Отчёт за квартал готов, посмотрите
                </Text>
              </View>
            </View>
            <View style={styles.shadeActions}>
              <Text style={styles.shadeAction}>Ответить</Text>
              <Text style={styles.shadeAction}>Прочитано</Text>
            </View>
          </View>

          <View style={[styles.shade, styles.shadeTask]}>
            <View style={[styles.shadeStripe, { backgroundColor: IMPORTANCE.red.color }]} />
            <View style={{ flex: 1 }}>
              <View style={styles.shadeHead}>
                <ClipboardCheck size={12} color={IMPORTANCE.red.color} />
                <Text style={[styles.shadeApp, { color: IMPORTANCE.red.color }]}>Offix · Задачи · {IMPORTANCE.red.label}</Text>
              </View>
              <Text style={[styles.shadeKind, { color: IMPORTANCE.red.color }]}>НОВАЯ ЗАДАЧА</Text>
              <Text style={styles.shadeTitle}>Подготовить коммерческое предложение</Text>
              <View style={styles.shadeMeta}>
                <CalendarClock size={12} color={T.textSecondary} />
                <Text style={styles.shadeText}>Срок: завтра, 18:00 · Поставил: Иван Петров</Text>
              </View>
              <View style={styles.shadeActions}>
                <Text style={[styles.shadeAction, { color: IMPORTANCE.red.color }]}>Взять в работу</Text>
                <Text style={[styles.shadeAction, { color: IMPORTANCE.red.color }]}>Открыть</Text>
              </View>
            </View>
          </View>
          <Text style={styles.previewHint}>
            Задачи отличаются цветом приоритета, своим значком, звуковым каналом и двойной вибрацией.
          </Text>
        </View>

        {/* Что присылать */}
        <Text style={styles.section}>ЧТО ПРИСЫЛАТЬ</Text>
        <View style={styles.card}>
          <Row title="Сообщения" hint="Личные чаты и группы" value={s.messages} onChange={(v) => update({ messages: v })} />
          <Row title="Задачи" hint="Назначения, проверка и её итоги" value={s.tasks} onChange={(v) => update({ tasks: v })} divider />
          <Row
            title="Показывать текст"
            hint="Иначе — просто «Новое сообщение»"
            value={s.preview}
            onChange={(v) => update({ preview: v })}
            divider
          />
          <Row title="Баннеры в приложении" hint="Всплывают сверху, когда Offix открыт" value={s.inApp} onChange={(v) => update({ inApp: v })} divider />
        </View>
        <Text style={styles.hint}>Чтобы выключить уведомления отдельного чата — «Без звука» в его меню или информации о чате.</Text>

        {/* Звук */}
        <Text style={styles.section}>ЗВУК И ВИБРАЦИЯ</Text>
        <View style={styles.card}>
          <LinkRow icon={<Volume2 size={19} color={T.accent} />} title="Сообщения" onPress={() => notifee.openNotificationSettings(CHANNEL_MESSAGES)} />
          <LinkRow icon={<Volume2 size={19} color={IMPORTANCE.yellow.color} />} title="Задачи" onPress={() => notifee.openNotificationSettings(CHANNEL_TASKS)} divider />
        </View>

        {/* Проверка */}
        <Text style={styles.section}>ПРОВЕРКА</Text>
        <View style={styles.card}>
          <LinkRow icon={<BellRing size={19} color={T.accent} />} title="Показать уведомление о сообщении" onPress={() => test('message')} />
          <LinkRow icon={<BellRing size={19} color={IMPORTANCE.red.color} />} title="Показать уведомление о задаче" onPress={() => test('task')} divider />
        </View>
        <Text style={styles.hint}>Уведомление появится в шторке телефона — так оно выглядит, когда Offix закрыт.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ title, hint, value, onChange, divider }: { title: string; hint: string; value: boolean; onChange: (v: boolean) => void; divider?: boolean }) {
  return (
    <View style={[styles.row, divider && styles.divider]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowHint}>{hint}</Text>
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: T.accent, false: T.surfaceActive }} thumbColor="#FFFFFF" />
    </View>
  );
}

function LinkRow({ icon, title, onPress, divider }: { icon: React.ReactNode; title: string; onPress: () => void; divider?: boolean }) {
  return (
    <TouchableOpacity style={[styles.row, divider && styles.divider]} onPress={onPress} activeOpacity={0.6}>
      <View style={styles.linkIcon}>{icon}</View>
      <Text style={[styles.rowTitle, { flex: 1 }]}>{title}</Text>
      <ChevronRight size={18} color={T.textMuted} />
    </TouchableOpacity>
  );
}

const styles = themed(() => ({
  container: { flex: 1, backgroundColor: T.background },
  header: { flexDirection: 'row', alignItems: 'center', height: 56, paddingHorizontal: 4, backgroundColor: T.card },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '700', color: T.textPrimary },
  body: { padding: 16, paddingBottom: 40 },
  status: { flexDirection: 'row', gap: 10, padding: 14, borderRadius: 16, alignItems: 'flex-start' },
  statusText: { flex: 1, fontSize: 13, lineHeight: 18, fontWeight: '600' },
  section: { fontSize: 12, fontWeight: '700', color: T.textSecondary, marginTop: 22, marginBottom: 8, marginLeft: 12 },
  preview: { gap: 10, padding: 14, borderRadius: 20, backgroundColor: withAlpha(T.textPrimary, 0.06) },
  shade: {
    borderRadius: 18,
    padding: 12,
    backgroundColor: T.card,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  shadeTask: { flexDirection: 'row', padding: 0, overflow: 'hidden' },
  shadeStripe: { width: 5, marginRight: 12 },
  shadeHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8, paddingTop: 0 },
  shadeApp: { fontSize: 11, color: T.textSecondary, fontWeight: '600' },
  shadeRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  shadeAvatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  shadeAvatarText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
  shadeTitle: { fontSize: 14, fontWeight: '700', color: T.textPrimary },
  shadeText: { fontSize: 13, color: T.textSecondary, marginTop: 1 },
  shadeKind: { fontSize: 10, fontWeight: '800', letterSpacing: 0.6, marginBottom: 2 },
  shadeMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  shadeActions: { flexDirection: 'row', gap: 22, marginTop: 10, paddingBottom: 2 },
  shadeAction: { fontSize: 13, fontWeight: '700', color: '#1F7A52' },
  previewHint: { fontSize: 12, color: T.textSecondary, lineHeight: 17, marginTop: 2 },
  card: { backgroundColor: T.card, borderRadius: 16, paddingHorizontal: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13 },
  divider: { borderTopWidth: 1, borderTopColor: T.border },
  rowTitle: { fontSize: 15, fontWeight: '600', color: T.textPrimary },
  rowHint: { fontSize: 12, color: T.textSecondary, marginTop: 2 },
  linkIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: T.inputBg },
  hint: { fontSize: 12, color: T.textSecondary, marginTop: 8, marginHorizontal: 12, lineHeight: 17 },
}));
