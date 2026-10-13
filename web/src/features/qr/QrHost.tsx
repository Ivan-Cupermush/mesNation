import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import jsQR from 'jsqr';
import { Check, Copy, Download, ExternalLink, ImageUp, Link2, QrCode as QrIcon, RotateCcw, ScanLine, Send, Share2, VideoOff, X } from 'lucide-react';
import { api } from '../../lib/http';
import { hashColor, initials } from '../../lib/format';
import { storage } from '../../lib/storage';
import type { Profile } from '../../lib/types';
import { Avatar } from '../../ui/Avatar';
import { Spinner } from '../../ui/Spinner';
import { useFeedback } from '../../ui/feedback';
import { useTheme } from '../../theme/ThemeProvider';
import { useAuth } from '../auth/AuthProvider';
import ChatPicker from '../chats/ChatPicker';
import { ContactCard } from '../contacts/ContactCard';
import { useContactNames } from '../contacts/names';
import { QrCode, renderPosterPng } from './QrCode';
import { BY_PALETTE, QR_THEMES, internalPath, parseOffixLink, profileLink, type QrTheme } from './qrCore';
import { closeQr, openQr, openScanner, useQrState } from './qrStore';
import cs from '../contacts/contacts.module.css';
import s from './qr.module.css';

const THEME_KEY = 'offix.qr.theme';

/** Окна QR поверх всего сайта: «Мой QR-код», QR-код контакта и сканер. */
export default function QrHost() {
  const st = useQrState();
  if (!st) return null;
  return createPortal(st.kind === 'scan' ? <ScannerOverlay /> : <ProfileOverlay userId={st.userId} />, document.body);
}

function useEsc(onClose: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);
}

// ---------- QR-код профиля ----------

function ProfileOverlay({ userId }: { userId?: number }) {
  const { user: me } = useAuth();
  const { paletteId } = useTheme();
  const { toast } = useFeedback();
  const { nameOf } = useContactNames();
  const [user, setUser] = useState<Profile | null>(!userId || userId === me?.id ? me : null);
  const [error, setError] = useState<string | null>(null);
  const [themeId, setThemeId] = useState(() => storage.get(THEME_KEY) || BY_PALETTE[paletteId] || 'emerald');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [toChat, setToChat] = useState(false);
  useEsc(closeQr);

  useEffect(() => {
    if (!userId || userId === me?.id) return;
    api
      .get<Profile>(`/api/users/${userId}`)
      .then(setUser)
      .catch((e) => setError(e?.message || 'Не удалось загрузить профиль'));
  }, [userId, me?.id]);

  const t: QrTheme = QR_THEMES.find((x) => x.id === themeId) || QR_THEMES[0];
  const mine = !!user && user.id === me?.id;
  const link = user ? profileLink(user.username) : '';
  const real = user ? user.display_name || user.username : '';
  const name = (user && !mine && nameOf(user.id)) || real;
  const handle = user ? `@${user.username}${user.role_name ? ` · ${user.role_name}` : ''}` : '';

  const pick = (id: string) => {
    setThemeId(id);
    storage.set(THEME_KEY, id);
  };

  const poster = () =>
    renderPosterPng({
      link,
      name,
      handle,
      avatarUrl: user?.avatar_url || null,
      initials: initials(real),
      avatarColor: hashColor(real),
      bg: t.bg,
      dots: t.dots,
    });

  const download = async () => {
    setBusy(true);
    try {
      const blob = await poster();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `offix-qr-${user?.username}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch (e) {
      toast.error(e, 'Не удалось сохранить картинку');
    } finally {
      setBusy(false);
    }
  };

  // «Поделиться» есть в браузерах телефонов и в части настольных (Edge, Safari).
  const canShare = typeof navigator.share === 'function';
  const share = async () => {
    setBusy(true);
    try {
      const blob = await poster();
      const file = new File([blob], `offix-qr-${user?.username}.png`, { type: 'image/png' });
      const data: ShareData = { files: [file], title: name, text: `${name} в Offix: ${link}` };
      if (navigator.canShare?.(data)) await navigator.share(data);
      else if (navigator.share) await navigator.share({ title: name, text: `${name} в Offix`, url: link });
      else await copy();
    } catch (e: any) {
      if (e?.name !== 'AbortError') toast.error(e, 'Не удалось поделиться');
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast.success('Ссылка скопирована');
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast('Не удалось скопировать — выделите ссылку вручную');
    }
  };

  return (
    <div className={s.overlay} style={{ background: `linear-gradient(160deg, ${t.bg[0]}, ${darken(t.bg[1])})` }} role="dialog" aria-modal="true" aria-label={mine ? 'Мой QR-код' : 'QR-код контакта'}>
      <span className={s.glow} style={{ background: `radial-gradient(circle, ${t.bg[2]}66, transparent 65%)` }} />
      <header className={s.top}>
        <button className={s.glass} onClick={closeQr} aria-label="Закрыть">
          <X size={22} />
        </button>
        <h2 className={s.topTitle}>{mine ? 'Мой QR-код' : 'QR-код контакта'}</h2>
        <button className={s.glass} onClick={openScanner} aria-label="Сканировать QR-код" title="Сканировать QR-код">
          <ScanLine size={21} />
        </button>
      </header>

      <div className={s.center}>
        {error ? (
          <p className={s.error}>{error}</p>
        ) : !user ? (
          <Spinner />
        ) : (
          <>
            <div className={s.poster} style={{ background: `linear-gradient(135deg, ${t.bg[1]}, ${t.bg[2]})` }}>
              <span className={s.avatarRing}>
                <Avatar name={real} src={user.avatar_url} size={88} />
              </span>
              <div className={s.card} title="Нажмите правой кнопкой или используйте «Ссылка», чтобы скопировать">
                <QrCode value={link} size={236} colors={t.dots} />
                <div className={s.name} style={{ color: t.dots[0] }}>
                  {name}
                </div>
                <div className={s.handle}>{handle}</div>
              </div>
              <div className={s.posterFoot}>Offix · наведите камеру телефона</div>
            </div>

            <p className={s.hint}>
              {mine
                ? 'Покажите код коллеге: камера телефона или сканер в Offix сразу откроют ваш профиль.'
                : `Покажите код другому коллеге — так удобно поделиться контактом ${name}.`}
            </p>

            <div className={s.swatches} role="radiogroup" aria-label="Тема QR-кода">
              {QR_THEMES.map((q) => (
                <button
                  key={q.id}
                  role="radio"
                  aria-checked={q.id === t.id}
                  aria-label={q.name}
                  title={q.name}
                  className={[s.swatch, q.id === t.id && s.swatchOn].filter(Boolean).join(' ')}
                  style={{ background: `linear-gradient(135deg, ${q.bg[1]}, ${q.bg[2]})` }}
                  onClick={() => pick(q.id)}
                >
                  {q.id === t.id && <Check size={16} strokeWidth={3} />}
                </button>
              ))}
            </div>

            <div className={s.actions}>
              {canShare ? (
                <Action icon={<Share2 size={20} />} label="Поделиться" onClick={share} disabled={busy} />
              ) : null}
              <Action icon={busy ? <Spinner size={18} inherit /> : <Download size={20} />} label="Скачать" onClick={download} disabled={busy} />
              <Action icon={copied ? <Check size={20} /> : <Link2 size={20} />} label={copied ? 'Готово' : 'Ссылка'} onClick={copy} />
              <Action icon={<Send size={19} />} label="В чат" onClick={() => setToChat(true)} />
            </div>
            <button className={s.scanBtn} style={{ color: t.bg[0] }} onClick={openScanner}>
              <ScanLine size={20} /> Сканировать QR-код
            </button>
          </>
        )}
      </div>

      {user && (
        <ChatPicker
          open={toChat}
          title={mine ? 'Отправить мой контакт' : 'Отправить контакт'}
          commentPlaceholder="Подпись (необязательно)"
          onClose={() => setToChat(false)}
          onSend={async (chatId, topicId, comment) => {
            await api.post(`/api/chats/${chatId}/contact`, { user_id: user.id, topic_id: topicId, comment: comment || undefined });
            toast.success('Контакт отправлен');
          }}
          preview={
            <span className={cs.previewBubble}>
              <ContactCard contact={user} mine />
            </span>
          }
        />
      )}
    </div>
  );
}

function Action({ icon, label, onClick, disabled }: { icon: React.ReactNode; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button className={s.action} onClick={onClick} disabled={disabled}>
      <span className={s.actionIcon}>{icon}</span>
      {label}
    </button>
  );
}

function darken(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v * 0.55).toString(16).padStart(2, '0')).join('')}`;
}

// ---------- Сканер ----------

type Found = { kind: 'url'; url: string } | { kind: 'text'; text: string };

interface Detector {
  detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]>;
}

function makeDetector(): Detector | null {
  const BD = (window as any).BarcodeDetector;
  if (!BD) return null;
  try {
    return new BD({ formats: ['qr_code'] });
  } catch {
    return null;
  }
}

function ScannerOverlay() {
  const navigate = useNavigate();
  const { toast } = useFeedback();
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [camera, setCamera] = useState<'starting' | 'on' | 'off'>('starting');
  const [found, setFound] = useState<Found | null>(null);
  const [hit, setHit] = useState(false);
  const handled = useRef(false);
  const detector = useMemo(makeDetector, []);
  useEsc(closeQr);

  const handle = useCallback(
    (raw: string) => {
      if (handled.current || !raw) return;
      handled.current = true;
      setHit(true);
      const link = parseOffixLink(raw);
      const path = internalPath(link);
      if (path) {
        closeQr();
        navigate(path);
        return;
      }
      setFound(link.kind === 'url' ? { kind: 'url', url: link.url } : { kind: 'text', text: link.kind === 'text' ? link.text : raw });
    },
    [navigate],
  );

  const decodeFrame = useCallback(
    async (src: HTMLVideoElement | HTMLImageElement, w: number, h: number): Promise<string | null> => {
      if (detector) {
        try {
          const codes = await detector.detect(src);
          if (codes[0]?.rawValue) return codes[0].rawValue;
          if (src instanceof HTMLVideoElement) return null;
        } catch {
          // упадём на jsQR
        }
      }
      const scale = Math.min(1, 800 / Math.max(w, h));
      const cw = Math.max(1, Math.round(w * scale));
      const ch = Math.max(1, Math.round(h * scale));
      const c = (canvas.current ||= document.createElement('canvas'));
      c.width = cw;
      c.height = ch;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      if (!ctx) return null;
      ctx.drawImage(src, 0, 0, cw, ch);
      const res = jsQR(ctx.getImageData(0, 0, cw, ch).data, cw, ch, { inversionAttempts: 'attemptBoth' });
      return res?.data || null;
    },
    [detector],
  );

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer = 0;
    let stopped = false;
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('no camera');
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false });
        if (stopped) return;
        const v = video.current!;
        v.srcObject = stream;
        await v.play().catch(() => undefined);
        setCamera('on');
        const tick = async () => {
          if (stopped) return;
          if (!handled.current && v.readyState >= 2 && v.videoWidth) {
            const value = await decodeFrame(v, v.videoWidth, v.videoHeight);
            if (value) handle(value);
          }
          timer = window.setTimeout(tick, 220);
        };
        tick();
      } catch {
        if (!stopped) setCamera('off');
      }
    })();
    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((tr) => tr.stop());
    };
  }, [decodeFrame, handle]);

  const fromFile = async (file: File | undefined) => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      const value = await decodeFrame(img, img.naturalWidth, img.naturalHeight);
      if (value) handle(value);
      else toast('На картинке не нашлось QR-кода');
    } catch {
      toast('Не удалось открыть картинку');
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  const again = () => {
    setFound(null);
    setHit(false);
    handled.current = false;
  };

  return (
    <div className={s.scanner} role="dialog" aria-modal="true" aria-label="Сканировать QR-код">
      <video ref={video} className={s.video} playsInline muted />
      <div className={s.shade} />
      <div className={[s.frame, hit && s.frameHit].filter(Boolean).join(' ')}>
        {camera === 'on' && !hit && <span className={s.scanLine} />}
        {camera === 'starting' && <Spinner />}
        {camera === 'off' && (
          <div className={s.noCam}>
            <VideoOff size={34} />
            <b>Камера недоступна</b>
            <span>Разрешите доступ к камере в браузере или загрузите картинку с QR-кодом.</span>
          </div>
        )}
      </div>
      <header className={s.top}>
        <button className={s.glass} onClick={closeQr} aria-label="Закрыть">
          <X size={22} />
        </button>
        <h2 className={s.topTitle}>Сканировать QR-код</h2>
        <span style={{ width: 42 }} />
      </header>
      <p className={s.scanHint}>Наведите камеру на QR-код профиля коллеги или на код входа Offix</p>

      {!found ? (
        <div className={s.scanBottom}>
          <button className={s.roundBtn} onClick={() => fileInput.current?.click()}>
            <span>
              <ImageUp size={22} />
            </span>
            Из файла
          </button>
          <button className={s.roundBtn} onClick={() => openQr()}>
            <span>
              <QrIcon size={22} />
            </span>
            Мой QR-код
          </button>
          <input ref={fileInput} type="file" accept="image/*" hidden onChange={(e) => fromFile(e.target.files?.[0])} />
        </div>
      ) : (
        <div className={s.result}>
          <div className={s.resultLabel}>{found.kind === 'url' ? 'Ссылка' : 'Текст'}</div>
          <div className={s.resultValue}>{found.kind === 'url' ? found.url : found.text}</div>
          <div className={s.resultRow}>
            {found.kind === 'url' && (
              <a className={s.resultPrimary} href={found.url} target="_blank" rel="noopener noreferrer nofollow">
                <ExternalLink size={18} /> Открыть
              </a>
            )}
            <button
              className={found.kind === 'url' ? s.resultSecondary : s.resultPrimary}
              onClick={() => navigator.clipboard.writeText(found.kind === 'url' ? found.url : found.text).then(() => toast.success('Скопировано'))}
            >
              <Copy size={18} /> Скопировать
            </button>
          </div>
          <button className={s.again} onClick={again}>
            <RotateCcw size={16} /> Сканировать ещё
          </button>
        </div>
      )}
    </div>
  );
}
