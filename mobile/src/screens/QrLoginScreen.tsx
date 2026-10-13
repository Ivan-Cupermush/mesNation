import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute } from '@react-navigation/native';
import { X, Laptop, ShieldAlert, Globe, Clock3, CheckCircle2, TimerOff, ScanLine, Ban } from 'lucide-react-native';
import { request } from '../services/http';
import { openQrScanner } from '../navigation/ref';
import { T, themed } from '../theme/runtime';
import { withAlpha } from '../theme/palettes';

/**
 * «Войти на сайте?» — после сканирования кода входа, как в Telegram
 * («Подключить устройство»): какое устройство просит вход, предупреждение
 * о мошенниках и явное подтверждение.
 */

interface Info {
  status: 'pending' | 'scanned' | 'approved' | 'declined' | 'used' | 'expired';
  device: { browser: string; os: string; label: string };
  ip: string | null;
  created_at: string;
}

type Phase = 'loading' | 'ask' | 'approving' | 'done' | 'declined' | 'expired' | 'error';

const ago = (iso: string) => {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'только что';
  const m = Math.round(s / 60);
  return `${m} мин назад`;
};

export default function QrLoginScreen({ navigation }: any) {
  const token: string = useRoute<any>().params?.token;
  const [info, setInfo] = useState<Info | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState('');

  useEffect(() => {
    request<Info>(`/api/auth/qr/${encodeURIComponent(token)}`)
      .then((i) => {
        setInfo(i);
        setPhase(i.status === 'pending' || i.status === 'scanned' ? 'ask' : i.status === 'declined' ? 'declined' : 'expired');
      })
      .catch((e: any) => {
        setError(e?.message || 'Не удалось проверить код');
        setPhase('error');
      });
  }, [token]);

  const approve = async () => {
    setPhase('approving');
    try {
      await request(`/api/auth/qr/${encodeURIComponent(token)}/approve`, { method: 'POST' });
      setPhase('done');
    } catch (e: any) {
      setError(e?.message || 'Не удалось подтвердить вход');
      setPhase(e?.status === 400 ? 'expired' : 'error');
    }
  };

  const decline = async () => {
    request(`/api/auth/qr/${encodeURIComponent(token)}/decline`, { method: 'POST' }).catch(() => undefined);
    navigation.goBack();
  };

  const rescan = () => {
    navigation.goBack();
    openQrScanner();
  };

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={phase === 'ask' ? decline : () => navigation.goBack()} accessibilityLabel="Закрыть">
          <X size={24} color={T.textPrimary} />
        </TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        {phase === 'loading' ? <ActivityIndicator color={T.accent} size="large" style={{ marginTop: 120 }} /> : null}

        {(phase === 'ask' || phase === 'approving') && info ? (
          <>
            <View style={styles.hero}>
              <View style={styles.heroCircle}>
                <Laptop size={52} color={T.accent} strokeWidth={1.6} />
              </View>
            </View>
            <Text style={styles.title}>Войти на сайте?</Text>
            <Text style={styles.subtitle}>Offix откроется в браузере на этом устройстве с вашим аккаунтом — чаты, задачи и заметки.</Text>

            <View style={styles.card}>
              <Row icon={<Laptop size={18} color={T.textSecondary} />} label="Устройство" value={info.device.label} />
              <View style={styles.divider} />
              {info.ip ? (
                <>
                  <Row icon={<Globe size={18} color={T.textSecondary} />} label="IP-адрес" value={info.ip.replace(/^::ffff:/, '')} />
                  <View style={styles.divider} />
                </>
              ) : null}
              <Row icon={<Clock3 size={18} color={T.textSecondary} />} label="Код показан" value={ago(info.created_at)} />
            </View>

            <View style={styles.warn}>
              <ShieldAlert size={20} color={T.warning} />
              <Text style={styles.warnText}>
                Подтверждайте, только если вы сами открыли сайт Offix на своём компьютере. Если код прислал кто-то другой — это мошенники: они получат доступ к вашей переписке.
              </Text>
            </View>

            <TouchableOpacity style={styles.primary} onPress={approve} disabled={phase === 'approving'} activeOpacity={0.88}>
              {phase === 'approving' ? <ActivityIndicator color={T.onAccent} /> : <Text style={styles.primaryText}>Войти</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondary} onPress={decline} disabled={phase === 'approving'}>
              <Text style={styles.secondaryText}>Это не я — отклонить</Text>
            </TouchableOpacity>
          </>
        ) : null}

        {phase === 'done' ? (
          <Final
            icon={<CheckCircle2 size={56} color={T.success} strokeWidth={1.8} />}
            tint={T.successSoft}
            title="Готово!"
            text={`Сайт открывается на устройстве «${info?.device.label || 'браузер'}». Выйти с него можно в профиле: «Выйти на всех устройствах».`}
            action="Закрыть"
            onAction={() => navigation.goBack()}
          />
        ) : null}
        {phase === 'expired' ? (
          <Final
            icon={<TimerOff size={52} color={T.warning} strokeWidth={1.8} />}
            tint={T.warningSoft}
            title="Код устарел"
            text="Коды входа действуют полторы минуты. Обновите страницу на компьютере и отсканируйте новый код."
            action="Сканировать снова"
            actionIcon={<ScanLine size={19} color={T.onAccent} />}
            onAction={rescan}
          />
        ) : null}
        {phase === 'declined' ? (
          <Final
            icon={<Ban size={52} color={T.danger} strokeWidth={1.8} />}
            tint={T.dangerSoft}
            title="Вход отклонён"
            text="Этот код уже отклонили. Чтобы войти, обновите страницу на компьютере и отсканируйте новый код."
            action="Сканировать снова"
            actionIcon={<ScanLine size={19} color={T.onAccent} />}
            onAction={rescan}
          />
        ) : null}
        {phase === 'error' ? (
          <Final
            icon={<TimerOff size={52} color={T.danger} strokeWidth={1.8} />}
            tint={T.dangerSoft}
            title="Не получилось"
            text={error}
            action="Сканировать снова"
            actionIcon={<ScanLine size={19} color={T.onAccent} />}
            onAction={rescan}
          />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <View style={styles.row}>
      {icon}
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function Final(props: { icon: React.ReactNode; tint: string; title: string; text: string; action: string; actionIcon?: React.ReactNode; onAction: () => void }) {
  return (
    <View style={styles.final}>
      <View style={[styles.heroCircle, { backgroundColor: props.tint }]}>{props.icon}</View>
      <Text style={styles.title}>{props.title}</Text>
      <Text style={styles.subtitle}>{props.text}</Text>
      <TouchableOpacity style={[styles.primary, { alignSelf: 'stretch' }]} onPress={props.onAction} activeOpacity={0.88}>
        {props.actionIcon}
        <Text style={styles.primaryText}>{props.action}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = themed(() => ({
  root: { flex: 1, backgroundColor: T.background },
  header: { flexDirection: 'row', paddingHorizontal: 8, paddingTop: 4 },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  body: { paddingHorizontal: 22, paddingBottom: 30 },
  hero: { alignItems: 'center', marginTop: 10 },
  heroCircle: { width: 112, height: 112, borderRadius: 56, alignItems: 'center', justifyContent: 'center', backgroundColor: withAlpha(T.accent, 0.12), alignSelf: 'center' },
  title: { marginTop: 18, fontSize: 25, fontWeight: '800', color: T.textPrimary, textAlign: 'center' },
  subtitle: { marginTop: 8, fontSize: 15, lineHeight: 21, color: T.textSecondary, textAlign: 'center' },
  card: { marginTop: 22, borderRadius: 18, backgroundColor: T.card, borderWidth: 1, borderColor: T.border, paddingHorizontal: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 50 },
  rowLabel: { fontSize: 14.5, color: T.textSecondary },
  rowValue: { flex: 1, textAlign: 'right', fontSize: 15, fontWeight: '600', color: T.textPrimary },
  divider: { height: 1, backgroundColor: T.border, marginLeft: 28 },
  warn: { flexDirection: 'row', gap: 10, marginTop: 14, padding: 14, borderRadius: 16, backgroundColor: T.warningSoft },
  warnText: { flex: 1, fontSize: 13.5, lineHeight: 19, color: T.textPrimary },
  primary: { marginTop: 22, height: 54, borderRadius: 17, backgroundColor: T.accent, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  primaryText: { fontSize: 17, fontWeight: '800', color: T.onAccent },
  secondary: { height: 50, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  secondaryText: { fontSize: 15.5, fontWeight: '700', color: T.danger },
  final: { alignItems: 'center', marginTop: 70 },
}));
