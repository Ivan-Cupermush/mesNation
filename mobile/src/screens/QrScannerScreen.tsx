import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Animated, Easing, Vibration, Linking, ActivityIndicator, useWindowDimensions, StatusBar, AppState } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsFocused } from '@react-navigation/native';
import Svg, { Path } from 'react-native-svg';
import Clipboard from '@react-native-clipboard/clipboard';
import { Camera } from 'react-native-vision-camera';
import { useBarcodeScannerOutput, createBarcodeScanner } from 'react-native-vision-camera-barcode-scanner';
import { loadImage } from 'react-native-nitro-image';
import { launchImageLibrary } from 'react-native-image-picker';
import { X, Flashlight, FlashlightOff, Image as ImageIcon, QrCode as QrIcon, Copy, ExternalLink, RotateCcw, UserX, CameraOff } from 'lucide-react-native';
import { parseOffixLink } from '../services/links';
import { openOffixLink } from '../services/openLink';
import { requestCameraPermission } from '../components/chat/chatUtils';
import { showToast } from '../components/ui/toast';
import { openQrProfile } from '../navigation/ref';
import { T, themed } from '../theme/runtime';

/**
 * Сканер QR-кодов, как в Telegram: рамка с уголками и бегущей линией,
 * фонарик, код из галереи. Профиль коллеги открывается сразу, вход на сайт —
 * через экран подтверждения; прочие ссылки и текст — карточкой с действиями.
 */

type Result = { kind: 'url'; url: string } | { kind: 'text'; text: string } | { kind: 'not_found' };

export default function QrScannerScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const focused = useIsFocused();
  const [permission, setPermission] = useState<'unknown' | 'granted' | 'denied'>('unknown');
  const [torch, setTorch] = useState(false);
  const [found, setFound] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [appActive, setAppActive] = useState(true);
  const handled = useRef(false);
  const line = useRef(new Animated.Value(0)).current;

  const box = Math.min(width * 0.7, 290);
  const boxTop = Math.max(insets.top + 90, (height - box) / 2 - 60);
  const boxLeft = (width - box) / 2;

  const askPermission = useCallback(async () => {
    setPermission((await requestCameraPermission()) ? 'granted' : 'denied');
  }, []);

  useEffect(() => {
    askPermission();
  }, [askPermission]);

  // Вернулись из настроек — проверим разрешение снова; в фоне камеру выключаем.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      setAppActive(st === 'active');
      if (st === 'active' && permission === 'denied') askPermission();
    });
    return () => sub.remove();
  }, [permission, askPermission]);

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(line, { toValue: 1, duration: 1700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(line, { toValue: 0, duration: 1700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [line]);

  const handle = useCallback(
    async (raw: string) => {
      if (handled.current || !raw) return;
      handled.current = true;
      setFound(true);
      Vibration.vibrate(35);
      const link = parseOffixLink(raw);
      try {
        if (link.kind === 'url' || link.kind === 'text') {
          setResult(link.kind === 'url' ? { kind: 'url', url: link.url } : { kind: 'text', text: link.text });
          return;
        }
        if (link.kind === 'qr_login') {
          navigation.replace('QrLogin', { token: link.token });
          return;
        }
        setBusy(true);
        // Сканер закрывается, профиль/чат/задача открываются на его месте.
        const res = await openOffixLink(link);
        if (res === 'not_found') setResult({ kind: 'not_found' });
      } catch (e: any) {
        showToast(e?.message || 'Не удалось открыть');
        handled.current = false;
        setFound(false);
      } finally {
        setBusy(false);
      }
    },
    [navigation],
  );

  const scanner = useBarcodeScannerOutput({
    barcodeFormats: ['qr-code'],
    onBarcodeScanned(codes) {
      const value = codes.find((c) => c.rawValue)?.rawValue;
      if (value) handle(value);
    },
    onError() {
      // Отдельный кадр не распознался — сканер продолжает работу.
    },
  });

  const fromGallery = async () => {
    const picked = await launchImageLibrary({ mediaType: 'photo', selectionLimit: 1 });
    const uri = picked.assets?.[0]?.uri;
    if (!uri) return;
    setBusy(true);
    const reader = createBarcodeScanner({ barcodeFormats: ['qr-code'] });
    try {
      const image = await loadImage({ filePath: uri.replace(/^file:\/\//, '') });
      try {
        const codes = await reader.scanCodesInImageAsync(image);
        const value = codes.find((c) => c.rawValue)?.rawValue;
        if (value) {
          setBusy(false);
          await handle(value);
        } else {
          showToast('На фото не нашлось QR-кода');
        }
      } finally {
        image.dispose();
      }
    } catch {
      showToast('Не удалось прочитать фото');
    } finally {
      reader.dispose();
      setBusy(false);
    }
  };

  const again = () => {
    setResult(null);
    setFound(false);
    handled.current = false;
  };

  const lineY = line.interpolate({ inputRange: [0, 1], outputRange: [10, box - 12] });
  const cameraOn = permission === 'granted' && focused && appActive && !result;

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      {permission === 'granted' ? (
        <Camera
          style={styles.fill}
          device="back"
          isActive={cameraOn}
          outputs={[scanner]}
          implementationMode="compatible"
          resizeMode="cover"
          torchMode={torch && cameraOn ? 'on' : 'off'}
        />
      ) : null}

      {/* Затемнение с окном и уголками */}
      <Svg style={styles.fill} width={width} height={height + insets.top + insets.bottom} pointerEvents="none">
        <Path
          fillRule="evenodd"
          fill="rgba(0,0,0,0.58)"
          d={`M0 0H${width}V${height + 200}H0Z ${roundRectPath(boxLeft, boxTop, box, box, 28)}`}
        />
        <Path d={cornersPath(boxLeft, boxTop, box, 28, 34)} stroke={found ? T.success : '#FFFFFF'} strokeWidth={5} strokeLinecap="round" fill="none" />
      </Svg>
      {!found && permission === 'granted' ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.scanLine, { left: boxLeft + 18, width: box - 36, top: boxTop, transform: [{ translateY: lineY }] }]}
        />
      ) : null}

      {/* Шапка */}
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <TouchableOpacity style={styles.glassBtn} onPress={() => navigation.goBack()} accessibilityLabel="Закрыть">
          <X size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.title}>Сканировать QR-код</Text>
        <TouchableOpacity style={[styles.glassBtn, torch && styles.glassOn]} onPress={() => setTorch((v) => !v)} accessibilityLabel={torch ? 'Выключить фонарик' : 'Включить фонарик'}>
          {torch ? <Flashlight size={20} color="#111" /> : <FlashlightOff size={20} color="#FFFFFF" />}
        </TouchableOpacity>
      </View>

      <Text style={[styles.hint, { top: boxTop + box + 22 }]}>
        {permission === 'denied' ? '' : 'Наведите камеру на QR-код профиля коллеги или на код входа на сайте Offix'}
      </Text>

      {permission === 'denied' ? (
        <View style={[styles.denied, { top: boxTop + 20, left: boxLeft, width: box }]}>
          <CameraOff size={36} color="#FFFFFF" />
          <Text style={styles.deniedTitle}>Нет доступа к камере</Text>
          <Text style={styles.deniedText}>Разрешите камеру в настройках — или выберите фото с QR-кодом из галереи.</Text>
          <TouchableOpacity style={styles.deniedBtn} onPress={() => Linking.openSettings()}>
            <Text style={styles.deniedBtnText}>Открыть настройки</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {busy ? (
        <View style={[styles.busy, { top: boxTop + box / 2 - 24, left: width / 2 - 24 }]}>
          <ActivityIndicator color="#FFFFFF" size="large" />
        </View>
      ) : null}

      {/* Низ: галерея и свой код */}
      {!result ? (
        <View style={[styles.bottom, { paddingBottom: insets.bottom + 18 }]}>
          <TouchableOpacity style={styles.bottomBtn} onPress={fromGallery} disabled={busy} activeOpacity={0.8}>
            <View style={styles.bottomIcon}>
              <ImageIcon size={22} color="#FFFFFF" />
            </View>
            <Text style={styles.bottomLabel}>Из галереи</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.bottomBtn}
            onPress={() => {
              navigation.goBack();
              openQrProfile();
            }}
            activeOpacity={0.8}
          >
            <View style={styles.bottomIcon}>
              <QrIcon size={22} color="#FFFFFF" />
            </View>
            <Text style={styles.bottomLabel}>Мой QR-код</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          {result.kind === 'not_found' ? (
            <>
              <View style={styles.sheetIcon}>
                <UserX size={26} color={T.danger} />
              </View>
              <Text style={styles.sheetTitle}>Сотрудник не найден</Text>
              <Text style={styles.sheetText}>Этот QR-код ведёт на профиль, которого нет в вашей компании Offix.</Text>
            </>
          ) : (
            <>
              <Text style={styles.sheetLabel}>{result.kind === 'url' ? 'Ссылка' : 'Текст'}</Text>
              <Text style={styles.sheetValue} numberOfLines={6} selectable>
                {result.kind === 'url' ? result.url : result.text}
              </Text>
              <View style={styles.sheetRow}>
                {result.kind === 'url' ? (
                  <SheetBtn icon={<ExternalLink size={19} color={T.onAccent} />} label="Открыть" primary onPress={() => Linking.openURL(result.url).catch(() => showToast('Не удалось открыть ссылку'))} />
                ) : null}
                <SheetBtn
                  icon={<Copy size={19} color={result.kind === 'url' ? T.accent : T.onAccent} />}
                  label="Скопировать"
                  primary={result.kind !== 'url'}
                  onPress={() => {
                    Clipboard.setString(result.kind === 'url' ? result.url : result.text);
                    showToast('Скопировано');
                  }}
                />
              </View>
            </>
          )}
          <TouchableOpacity style={styles.againBtn} onPress={again}>
            <RotateCcw size={17} color={T.accent} />
            <Text style={styles.againText}>Сканировать ещё</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

function SheetBtn({ icon, label, onPress, primary }: { icon: React.ReactNode; label: string; onPress: () => void; primary?: boolean }) {
  return (
    <TouchableOpacity style={[styles.sheetBtn, primary && styles.sheetBtnPrimary]} onPress={onPress} activeOpacity={0.85}>
      {icon}
      <Text style={[styles.sheetBtnText, primary && { color: T.onAccent }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function roundRectPath(x: number, y: number, w: number, h: number, r: number) {
  return `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`;
}

/** Четыре скруглённых уголка рамки. */
function cornersPath(x: number, y: number, s: number, r: number, len: number) {
  const x2 = x + s;
  const y2 = y + s;
  return [
    `M${x} ${y + len}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}H${x + len}`,
    `M${x2 - len} ${y}H${x2 - r}A${r} ${r} 0 0 1 ${x2} ${y + r}V${y + len}`,
    `M${x2} ${y2 - len}V${y2 - r}A${r} ${r} 0 0 1 ${x2 - r} ${y2}H${x2 - len}`,
    `M${x + len} ${y2}H${x + r}A${r} ${r} 0 0 1 ${x} ${y2 - r}V${y2 - len}`,
  ].join(' ');
}

const styles = themed(() => ({
  root: { flex: 1, backgroundColor: '#000000' },
  fill: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 },
  scanLine: { position: 'absolute', height: 3, borderRadius: 2, backgroundColor: T.accent, opacity: 0.9, shadowColor: T.accent, shadowOpacity: 0.9, shadowRadius: 8, elevation: 6 },
  header: { position: 'absolute', left: 0, right: 0, top: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14 },
  title: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: '#FFFFFF' },
  glassBtn: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.18)' },
  glassOn: { backgroundColor: '#FFFFFF' },
  hint: { position: 'absolute', left: 36, right: 36, textAlign: 'center', fontSize: 14.5, lineHeight: 20, color: 'rgba(255,255,255,0.9)' },
  denied: { position: 'absolute', alignItems: 'center', gap: 8 },
  deniedTitle: { marginTop: 6, fontSize: 18, fontWeight: '800', color: '#FFFFFF' },
  deniedText: { fontSize: 14, lineHeight: 19, color: 'rgba(255,255,255,0.8)', textAlign: 'center' },
  deniedBtn: { marginTop: 8, paddingHorizontal: 18, height: 42, borderRadius: 21, backgroundColor: '#FFFFFF', justifyContent: 'center' },
  deniedBtnText: { fontSize: 15, fontWeight: '700', color: '#111111' },
  busy: { position: 'absolute', width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', justifyContent: 'center', gap: 40 },
  bottomBtn: { alignItems: 'center', gap: 8 },
  bottomIcon: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.18)' },
  bottomLabel: { fontSize: 13, fontWeight: '600', color: '#FFFFFF' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: T.elevated, borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: 20, paddingTop: 20 },
  sheetIcon: { alignSelf: 'center', width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: T.dangerSoft },
  sheetTitle: { marginTop: 12, fontSize: 19, fontWeight: '800', color: T.textPrimary, textAlign: 'center' },
  sheetText: { marginTop: 6, fontSize: 14.5, lineHeight: 20, color: T.textSecondary, textAlign: 'center' },
  sheetLabel: { fontSize: 12.5, fontWeight: '700', color: T.textMuted, letterSpacing: 0.4, textTransform: 'uppercase' },
  sheetValue: { marginTop: 6, fontSize: 16, lineHeight: 22, color: T.textPrimary },
  sheetRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  sheetBtn: { flex: 1, height: 48, borderRadius: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: T.accentMuted },
  sheetBtnPrimary: { backgroundColor: T.accent },
  sheetBtnText: { fontSize: 15, fontWeight: '700', color: T.accent },
  againBtn: { marginTop: 10, height: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  againText: { fontSize: 15, fontWeight: '700', color: T.accent },
}));
