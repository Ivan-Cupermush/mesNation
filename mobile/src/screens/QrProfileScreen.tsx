import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, useWindowDimensions, StatusBar, ScrollView, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRoute } from '@react-navigation/native';
import Svg, { Defs, LinearGradient, RadialGradient, Stop, Rect, Circle } from 'react-native-svg';
import Clipboard from '@react-native-clipboard/clipboard';
import { CameraRoll } from '@react-native-camera-roll/camera-roll';
import { captureRef } from 'react-native-view-shot';
import { X, ScanLine, Share2, Download, Link2, Send, Check } from 'lucide-react-native';
import { request } from '../services/http';
import { contactName, useContactNames } from '../services/contacts';
import { profileLink } from '../services/links';
import { shareFiles } from '../native/share';
import { useTheme } from '../theme/ThemeContext';
import { T, themed } from '../theme/runtime';
import QrCode from '../components/qr/QrCode';
import { QR_THEMES, QrTheme, loadQrTheme, saveQrTheme } from '../components/qr/qrThemes';
import UserAvatar from '../components/ui/UserAvatar';
import ShareToChatModal, { sentToLabel } from '../components/ShareToChatModal';
import { ContactCard, SharedContact } from '../components/contacts/ContactCard';
import { requestSavePermission } from '../components/chat/chatUtils';
import { showToast } from '../components/ui/toast';
import { openQrScanner } from '../navigation/ref';

/**
 * QR-код профиля, как в Telegram: постер с градиентом, аватар над карточкой,
 * код с фирменным знаком; темы оформления; поделиться картинкой или ссылкой,
 * сохранить в галерею, отправить контакт в чат и сканировать чужой код.
 * Код ведёт на https://offixcrm.ru/u/логин — его читает и обычная камера телефона.
 */

interface Person extends SharedContact {
  email?: string | null;
}

export default function QrProfileScreen({ navigation }: any) {
  const route = useRoute<any>();
  const userId: number | undefined = route.params?.userId;
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { paletteId } = useTheme();
  const [user, setUser] = useState<Person | null>(null);
  const [meId, setMeId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [theme, setTheme] = useState<QrTheme | null>(null);
  const [busy, setBusy] = useState<'share' | 'save' | null>(null);
  const [toChat, setToChat] = useState(false);
  const [copied, setCopied] = useState(false);
  const poster = useRef<View>(null);
  useContactNames();

  useEffect(() => {
    loadQrTheme(paletteId).then(setTheme);
  }, [paletteId]);

  useEffect(() => {
    (async () => {
      try {
        const me = await request<any>('/api/auth/me');
        setMeId(Number(me.id));
        if (!userId || userId === Number(me.id)) setUser(me);
        else setUser(await request<Person>(`/api/users/${userId}`));
      } catch (e: any) {
        setError(e?.message || 'Не удалось загрузить профиль');
      }
    })();
  }, [userId]);

  const mine = !!user && user.id === meId;
  const link = user ? profileLink(user.username) : '';
  const realName = user ? user.display_name || user.username : '';
  const name = (user && !mine && contactName(user.id)) || realName;
  const posterW = Math.min(width - 40, 380);
  // На низких экранах код чуть меньше, чтобы кнопки помещались без прокрутки.
  const qrSize = Math.round(Math.min(posterW - 92, height * 0.3));

  const pickTheme = (t: QrTheme) => {
    setTheme(t);
    saveQrTheme(t.id);
  };

  const snapshot = () => captureRef(poster, { format: 'png', quality: 1, result: 'tmpfile', fileName: `offix-qr-${user?.username || 'profile'}` });

  const share = async () => {
    if (!user) return;
    setBusy('share');
    try {
      const uri = await snapshot();
      await shareFiles([{ path: uri, mime: 'image/png', name: `offix-${user.username}.png` }], {
        text: `${name} в Offix: ${link}`,
        title: mine ? 'Поделиться моим QR-кодом' : 'Поделиться QR-кодом',
      });
    } catch (e: any) {
      Alert.alert('Не удалось поделиться', e?.message || '');
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    if (!user) return;
    setBusy('save');
    try {
      if (!(await requestSavePermission())) throw new Error('Нет доступа к галерее');
      const uri = await snapshot();
      await CameraRoll.saveAsset(uri.startsWith('file://') ? uri : `file://${uri}`, { type: 'photo', album: 'Offix' });
      showToast('QR-код сохранён в галерею');
    } catch (e: any) {
      Alert.alert('Не удалось сохранить', e?.message || '');
    } finally {
      setBusy(null);
    }
  };

  const copy = () => {
    Clipboard.setString(link);
    setCopied(true);
    showToast('Ссылка скопирована');
    setTimeout(() => setCopied(false), 1800);
  };

  const sendContact = (chatId: number, comment: string, topicId: number | null) =>
    request(`/api/chats/${chatId}/contact`, { method: 'POST', body: { user_id: user!.id, topic_id: topicId ?? undefined, comment: comment || undefined } }).then(() => undefined);

  const t = theme || QR_THEMES[0];

  return (
    <View style={[styles.root, { backgroundColor: t.bg[0] }]}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <Svg style={styles.fill} width={width} height={height + insets.top + insets.bottom}>
        <Defs>
          <LinearGradient id="screenBg" x1="0" y1="0" x2="0.4" y2="1">
            <Stop offset="0" stopColor={t.bg[0]} />
            <Stop offset="1" stopColor={mixDark(t.bg[1])} />
          </LinearGradient>
          <RadialGradient id="glow" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={t.bg[2]} stopOpacity={0.45} />
            <Stop offset="1" stopColor={t.bg[2]} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width="100%" height="100%" fill="url(#screenBg)" />
        <Circle cx={width * 0.85} cy={height * 0.12} r={width * 0.55} fill="url(#glow)" />
        <Circle cx={width * 0.1} cy={height * 0.78} r={width * 0.6} fill="url(#glow)" />
      </Svg>

      {/* ===== Шапка ===== */}
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <TouchableOpacity style={styles.glassBtn} onPress={() => navigation.goBack()} accessibilityLabel="Закрыть">
          <X size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{mine ? 'Мой QR-код' : 'QR-код контакта'}</Text>
        <TouchableOpacity
          style={styles.glassBtn}
          onPress={() => {
            navigation.goBack();
            openQrScanner();
          }}
          accessibilityLabel="Сканировать QR-код"
        >
          <ScanLine size={21} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 20 }]} showsVerticalScrollIndicator={false} bounces={false}>
        {error ? (
          <Text style={styles.error}>{error}</Text>
        ) : !user || !theme ? (
          <ActivityIndicator color="#FFFFFF" size="large" style={{ marginTop: 120 }} />
        ) : (
          <>
            {/* ===== Постер: то, что уходит картинкой в «Поделиться» и галерею ===== */}
            <View ref={poster} collapsable={false} style={[styles.poster, { width: posterW }]}>
              <Svg style={styles.fill} width="100%" height="100%">
                <Defs>
                  <LinearGradient id="posterBg" x1="0" y1="0" x2="1" y2="1">
                    <Stop offset="0" stopColor={t.bg[1]} />
                    <Stop offset="1" stopColor={t.bg[2]} />
                  </LinearGradient>
                </Defs>
                <Rect x={0} y={0} width="100%" height="100%" fill="url(#posterBg)" />
                <Circle cx={posterW * 0.92} cy={40} r={70} fill="#FFFFFF" opacity={0.08} />
                <Circle cx={posterW * 0.05} cy={posterW * 1.1} r={110} fill="#FFFFFF" opacity={0.07} />
              </Svg>
              <View style={styles.avatarRing}>
                <UserAvatar name={realName} url={user.avatar_url} size={84} />
              </View>
              <TouchableOpacity activeOpacity={0.9} onLongPress={copy} style={styles.card}>
                <QrCode value={link} size={qrSize} colors={t.dots} logoColor={t.dots[0]} />
                <Text style={[styles.name, { color: t.dots[0] }]} numberOfLines={2}>
                  {name}
                </Text>
                <Text style={styles.handle} numberOfLines={1}>
                  @{user.username}
                  {user.role_name ? ` · ${user.role_name}` : ''}
                </Text>
              </TouchableOpacity>
              <Text style={styles.posterFoot}>Offix · наведите камеру телефона</Text>
            </View>

            <Text style={styles.hint}>
              {mine
                ? 'Покажите код коллеге: обычная камера телефона или сканер в Offix сразу откроют ваш профиль.'
                : `Покажите код другому коллеге — так удобно поделиться контактом ${name}.`}
            </Text>

            {/* ===== Темы ===== */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.themes}>
              {QR_THEMES.map((q) => {
                const on = q.id === t.id;
                return (
                  <TouchableOpacity key={q.id} onPress={() => pickTheme(q)} style={[styles.swatchWrap, on && styles.swatchOn]} accessibilityLabel={`Тема ${q.name}`}>
                    <Svg width={34} height={34}>
                      <Defs>
                        <LinearGradient id={`sw-${q.id}`} x1="0" y1="0" x2="1" y2="1">
                          <Stop offset="0" stopColor={q.bg[1]} />
                          <Stop offset="1" stopColor={q.bg[2]} />
                        </LinearGradient>
                      </Defs>
                      <Circle cx={17} cy={17} r={17} fill={`url(#sw-${q.id})`} />
                    </Svg>
                    {on ? (
                      <View style={styles.swatchCheck}>
                        <Check size={16} color="#FFFFFF" strokeWidth={3} />
                      </View>
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* ===== Действия ===== */}
            <View style={styles.actions}>
              <Action icon={busy === 'share' ? null : <Share2 size={21} color="#FFFFFF" />} label="Поделиться" onPress={share} disabled={!!busy} />
              <Action icon={busy === 'save' ? null : <Download size={21} color="#FFFFFF" />} label="Сохранить" onPress={save} disabled={!!busy} />
              <Action icon={copied ? <Check size={21} color="#FFFFFF" /> : <Link2 size={21} color="#FFFFFF" />} label={copied ? 'Готово' : 'Ссылка'} onPress={copy} />
              <Action icon={<Send size={20} color="#FFFFFF" />} label="В чат" onPress={() => setToChat(true)} />
            </View>

            <TouchableOpacity
              style={styles.scanBtn}
              activeOpacity={0.88}
              onPress={() => {
                navigation.goBack();
                openQrScanner();
              }}
            >
              <ScanLine size={20} color={t.bg[0]} />
              <Text style={[styles.scanText, { color: t.bg[0] }]}>Сканировать QR-код</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>

      {user ? (
        <ShareToChatModal
          visible={toChat}
          title={mine ? 'Отправить мой контакт' : 'Отправить контакт'}
          onClose={() => setToChat(false)}
          onSend={sendContact}
          onDone={(n) => {
            setToChat(false);
            showToast(n === 1 ? 'Контакт отправлен' : sentToLabel(n));
          }}
          commentPlaceholder="Добавить подпись…"
          preview={
            <View style={styles.previewBubble}>
              <ContactCard contact={user} mine width={236} />
            </View>
          }
        />
      ) : null}
    </View>
  );
}

function Action({ icon, label, onPress, disabled }: { icon: React.ReactNode | null; label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <TouchableOpacity style={styles.action} onPress={onPress} disabled={disabled} activeOpacity={0.75} accessibilityLabel={label}>
      <View style={styles.actionIcon}>{icon ?? <ActivityIndicator color="#FFFFFF" />}</View>
      <Text style={styles.actionLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

/** Нижняя часть фона — темнее, чтобы белые кнопки читались. */
function mixDark(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.round(v * 0.55);
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => f(v).toString(16).padStart(2, '0')).join('')}`;
}

const styles = themed(() => ({
  root: { flex: 1 },
  fill: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingBottom: 6 },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: '#FFFFFF' },
  glassBtn: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.16)' },
  body: { alignItems: 'center', paddingTop: 14 },
  error: { marginTop: 120, fontSize: 16, color: '#FFFFFF', textAlign: 'center', paddingHorizontal: 30 },

  poster: { borderRadius: 30, overflow: 'hidden', alignItems: 'center', paddingTop: 22, paddingBottom: 16, paddingHorizontal: 22 },
  avatarRing: { zIndex: 2, marginBottom: -44, padding: 4, borderRadius: 50, backgroundColor: '#FFFFFF' },
  card: {
    alignSelf: 'stretch',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 26,
    // Отступ под аватаром — «тихая зона» над кодом, чтобы сканер его не путал.
    paddingTop: 68,
    paddingBottom: 20,
    paddingHorizontal: 18,
  },
  name: { marginTop: 14, fontSize: 21, fontWeight: '800', textAlign: 'center', letterSpacing: 0.2 },
  handle: { marginTop: 3, fontSize: 14, color: '#6B7280', fontWeight: '500' },
  posterFoot: { marginTop: 12, fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.82)', letterSpacing: 0.4 },

  hint: { marginTop: 14, marginHorizontal: 34, fontSize: 13.5, lineHeight: 19, color: 'rgba(255,255,255,0.82)', textAlign: 'center' },
  themes: { paddingHorizontal: 20, paddingVertical: 16, gap: 10 },
  swatchWrap: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent' },
  swatchOn: { borderColor: '#FFFFFF' },
  swatchCheck: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },

  actions: { flexDirection: 'row', gap: 10, paddingHorizontal: 20 },
  action: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.14)' },
  actionIcon: { height: 26, alignItems: 'center', justifyContent: 'center' },
  actionLabel: { marginTop: 4, fontSize: 12.5, fontWeight: '600', color: '#FFFFFF' },
  scanBtn: {
    marginTop: 14,
    alignSelf: 'stretch',
    marginHorizontal: 20,
    height: 52,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  scanText: { fontSize: 16, fontWeight: '800' },
  previewBubble: { padding: 5, borderRadius: 18, borderBottomRightRadius: 6, backgroundColor: T.myMessageBubble },
}));
