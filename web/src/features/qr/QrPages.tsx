import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { Ban, CheckCircle2, Clock3, Globe, KeyRound, Laptop, ScanLine, ShieldAlert, Smartphone, TimerOff, UserX } from 'lucide-react';
import { ApiError, api, request } from '../../lib/http';
import { Avatar } from '../../ui/Avatar';
import { Button } from '../../ui/Button';
import { EmptyState } from '../../ui/EmptyState';
import { PageLoader, Spinner } from '../../ui/Spinner';
import { useAuth } from '../auth/AuthProvider';
import { QrCode } from './QrCode';
import { appIntentUrl } from './qrCore';
import { openScanner } from './qrStore';
import s from './qr.module.css';

/** /u/логин — ссылка из QR-кода профиля: открывает карточку сотрудника. */
export function UserByUsername() {
  const { username = '' } = useParams();
  const [state, setState] = useState<{ id?: number; missing?: boolean }>({});
  useEffect(() => {
    api
      .get<{ id: number }>(`/api/users/by-username/${encodeURIComponent(username)}`)
      .then((u) => setState({ id: u.id }))
      .catch(() => setState({ missing: true }));
  }, [username]);
  if (state.id) return <Navigate to={`/users/${state.id}`} replace />;
  if (state.missing)
    return (
      <div style={{ paddingTop: 60 }}>
        <EmptyState icon={<UserX size={34} />} title="Сотрудник не найден" text={`В вашей компании нет сотрудника с логином @${username}.`} />
      </div>
    );
  return <PageLoader />;
}

interface QrInfo {
  status: 'pending' | 'scanned' | 'approved' | 'declined' | 'used' | 'expired';
  device: { label: string };
  ip: string | null;
  created_at: string;
}

const ago = (iso: string) => {
  const sec = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  return sec < 60 ? 'только что' : `${Math.round(sec / 60)} мин назад`;
};

/**
 * /qr/код — подтверждение входа на другом устройстве с уже открытого сайта.
 * Так входят и с iPhone: камера читает код с компьютера и открывает эту
 * страницу в браузере, где вы уже вошли.
 */
export function QrConfirmPage() {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const [info, setInfo] = useState<QrInfo | null>(null);
  const [phase, setPhase] = useState<'loading' | 'ask' | 'approving' | 'done' | 'declined' | 'expired' | 'error'>('loading');
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get<QrInfo>(`/api/auth/qr/${encodeURIComponent(token)}`)
      .then((i) => {
        setInfo(i);
        setPhase(i.status === 'pending' || i.status === 'scanned' ? 'ask' : i.status === 'declined' ? 'declined' : 'expired');
      })
      .catch((e) => {
        setError(e?.message || 'Не удалось проверить код');
        setPhase('error');
      });
  }, [token]);

  const approve = async () => {
    setPhase('approving');
    try {
      await api.post(`/api/auth/qr/${encodeURIComponent(token)}/approve`);
      setPhase('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось подтвердить вход');
      setPhase(e instanceof ApiError && e.status === 400 ? 'expired' : 'error');
    }
  };

  const decline = async () => {
    await api.post(`/api/auth/qr/${encodeURIComponent(token)}/decline`).catch(() => undefined);
    navigate('/', { replace: true });
  };

  if (phase === 'loading') return <PageLoader />;
  if (phase === 'ask' || phase === 'approving') {
    return (
      <div className={s.confirm}>
        <span className={s.confirmIcon}>
          <Laptop size={50} strokeWidth={1.6} />
        </span>
        <h1>Войти на другом устройстве?</h1>
        <p>Offix откроется там с вашим аккаунтом — чаты, задачи и заметки.</p>
        <div className={s.infoCard}>
          <div className={s.infoRow}>
            <Laptop size={18} /> Устройство <b>{info?.device.label}</b>
          </div>
          {info?.ip && (
            <div className={s.infoRow}>
              <Globe size={18} /> IP-адрес <b>{info.ip.replace(/^::ffff:/, '')}</b>
            </div>
          )}
          <div className={s.infoRow}>
            <Clock3 size={18} /> Код показан <b>{info ? ago(info.created_at) : ''}</b>
          </div>
        </div>
        <div className={s.warn}>
          <ShieldAlert size={20} />
          <span>
            Подтверждайте, только если вы сами открыли Offix на этом устройстве. Если код прислал кто-то другой — это мошенники: они получат доступ к вашей переписке.
          </span>
        </div>
        <div className={s.confirmActions}>
          <Button size="lg" block onClick={approve} loading={phase === 'approving'}>
            Войти
          </Button>
          <Button size="lg" block variant="ghost" onClick={decline} disabled={phase === 'approving'}>
            Это не я — отклонить
          </Button>
        </div>
      </div>
    );
  }
  const final =
    phase === 'done'
      ? { icon: <CheckCircle2 size={52} />, title: 'Готово!', text: `Offix открывается на устройстве «${info?.device.label || 'браузер'}».` }
      : phase === 'declined'
        ? { icon: <Ban size={50} />, title: 'Вход отклонён', text: 'Чтобы войти, обновите страницу на том устройстве и отсканируйте новый код.' }
        : phase === 'expired'
          ? { icon: <TimerOff size={50} />, title: 'Код устарел', text: 'Коды входа действуют полторы минуты. Обновите страницу на том устройстве и отсканируйте новый.' }
          : { icon: <TimerOff size={50} />, title: 'Не получилось', text: error };
  return (
    <div className={s.confirm}>
      <span className={s.confirmIcon}>{final.icon}</span>
      <h1>{final.title}</h1>
      <p>{final.text}</p>
      <div className={s.confirmActions}>
        {phase !== 'done' && (
          <Button size="lg" block icon={<ScanLine size={19} />} onClick={openScanner}>
            Сканировать снова
          </Button>
        )}
        <Button size="lg" block variant={phase === 'done' ? 'primary' : 'ghost'} onClick={() => navigate('/', { replace: true })}>
          На главную
        </Button>
      </div>
    </div>
  );
}

type LoginState =
  | { st: 'loading' }
  | { st: 'pending'; token: string; secret: string }
  | { st: 'scanned'; token: string; secret: string; user: { display_name: string; avatar_url: string | null } }
  | { st: 'declined' }
  | { st: 'error'; message: string };

/**
 * Вход по QR-коду на странице входа (как в Telegram Web и WhatsApp Web):
 * код обновляется сам, после сканирования показывается, чей телефон
 * подтверждает вход.
 */
export function QrLoginPanel({ onPassword }: { onPassword: () => void }) {
  const { loginWithToken } = useAuth();
  const [state, setState] = useState<LoginState>({ st: 'loading' });
  const alive = useRef(true);

  const fresh = useCallback(async () => {
    setState({ st: 'loading' });
    try {
      const r = await request<{ token: string; secret: string }>('/api/auth/qr', { method: 'POST', anonymous: true, body: {} });
      if (alive.current) setState({ st: 'pending', token: r.token, secret: r.secret });
    } catch (e) {
      if (alive.current) setState({ st: 'error', message: e instanceof Error ? e.message : 'Нет связи с сервером' });
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    fresh();
    return () => {
      alive.current = false;
    };
  }, [fresh]);

  const token = state.st === 'pending' || state.st === 'scanned' ? state.token : null;
  const secret = state.st === 'pending' || state.st === 'scanned' ? state.secret : null;

  useEffect(() => {
    if (!token || !secret) return;
    let stop = false;
    let timer = 0;
    const poll = async () => {
      if (stop) return;
      try {
        const r = await request<any>('/api/auth/qr/poll', { method: 'POST', anonymous: true, body: { token, secret } });
        if (stop) return;
        if (r.status === 'approved' && r.token) {
          await loginWithToken(r.token);
          return;
        }
        if (r.status === 'expired') return fresh();
        if (r.status === 'declined') return setState({ st: 'declined' });
        if (r.status === 'scanned') setState((p) => (p.st === 'pending' || p.st === 'scanned' ? { st: 'scanned', token, secret, user: r.user } : p));
      } catch {
        // сеть мигнула — следующий опрос
      }
      timer = window.setTimeout(poll, 1500);
    };
    timer = window.setTimeout(poll, 1200);
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [token, secret, fresh, loginWithToken]);

  const link = token ? `${window.location.origin}/qr/${token}` : '';

  return (
    <div className={s.login}>
      <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>Вход по QR-коду</h1>
      <div className={s.loginCode}>
        <div className={state.st === 'scanned' || state.st === 'declined' || state.st === 'error' ? s.loginCodeDim : undefined}>
          {link ? <QrCode value={link} size={232} colors={['#14714A', '#2BAE73']} /> : <div style={{ width: 232, height: 232 }} />}
        </div>
        {state.st === 'loading' && (
          <div className={s.loginOverlay}>
            <Spinner />
          </div>
        )}
        {state.st === 'scanned' && (
          <div className={s.loginOverlay}>
            <Avatar name={state.user.display_name} src={state.user.avatar_url} size={64} />
            <span>{state.user.display_name}</span>
            <span style={{ fontWeight: 500, color: 'var(--c-text-secondary)' }}>Подтвердите вход на телефоне</span>
          </div>
        )}
        {state.st === 'declined' && (
          <div className={s.loginOverlay}>
            <Ban size={30} />
            <span>Вход отклонён на телефоне</span>
            <Button size="sm" onClick={fresh}>
              Показать новый код
            </Button>
          </div>
        )}
        {state.st === 'error' && (
          <div className={s.loginOverlay}>
            <span>{state.message}</span>
            <Button size="sm" onClick={fresh}>
              Повторить
            </Button>
          </div>
        )}
      </div>
      <ol className={s.steps}>
        <li>
          <span>
            Откройте <b>Offix</b> на телефоне
          </span>
        </li>
        <li>
          <span>
            <b>Профиль → Сканировать QR-код</b> (или обычная камера телефона)
          </span>
        </li>
        <li>
          <span>Наведите камеру на код и подтвердите вход</span>
        </li>
      </ol>
      <button type="button" className={s.switchLink} onClick={onPassword}>
        <KeyRound size={16} /> Войти по логину и паролю
      </button>
    </div>
  );
}

/** Ссылка из QR открыта в браузере телефона без входа: «Открыть в приложении». */
export function OpenInAppHint() {
  const path = window.location.pathname;
  if (!/^\/(u|qr)\//.test(path)) return null;
  const intent = appIntentUrl(path);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
      {intent && (
        <a className={s.openApp} href={intent}>
          <Smartphone size={18} /> Открыть в приложении Offix
        </a>
      )}
      <p style={{ margin: 0, fontSize: 13.5, color: 'var(--c-text-secondary)', textAlign: 'center' }}>
        {path.startsWith('/qr/') ? 'Войдите, чтобы подтвердить вход на другом устройстве.' : 'Войдите, чтобы открыть профиль сотрудника.'}
      </p>
    </div>
  );
}
