import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AtSign, BarChart3, ChevronLeft, ChevronRight, Copy, KeyRound, Mail, MessageCircle, UserCheck, UserX, Users } from 'lucide-react';
import { useMe } from '../auth/AuthProvider';
import { api } from '../../lib/http';
import { displayName, lastSeenLabel, plural } from '../../lib/format';
import type { Profile } from '../../lib/types';
import { Avatar } from '../../ui/Avatar';
import { Button, IconButton } from '../../ui/Button';
import { Modal } from '../../ui/Modal';
import { TextField } from '../../ui/Field';
import { PageLoader } from '../../ui/Spinner';
import { EmptyState } from '../../ui/EmptyState';
import { useFeedback } from '../../ui/feedback';
import { chatKeys, useChats } from '../chats/queries';
import type { Chat } from '../chats/types';
import { usePresence, userKeys } from './queries';
import s from './UserProfile.module.css';

type UserProfileData = Profile & { can_manage: boolean; is_active: boolean };

/**
 * Профиль сотрудника — как в приложении: фото, должность, «в сети»,
 * контакты, «Написать», общие группы. Директору и руководителю — сброс
 * пароля и (де)активация учётной записи.
 */
export default function UserProfile() {
  const { id = '' } = useParams();
  const userId = Number(id);
  const me = useMe();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toast, confirm } = useFeedback();
  const { data: user, isLoading, error, refetch } = useQuery({
    queryKey: userKeys.one(userId),
    queryFn: () => api.get<UserProfileData>(`/api/users/${userId}`),
    enabled: userId > 0,
  });
  const { data: chats } = useChats();
  const presence = usePresence(userId > 0 ? [userId] : []).get(userId);
  const [busy, setBusy] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [manual, setManual] = useState('');
  const [issued, setIssued] = useState<string | null>(null);

  if (isLoading) return <PageLoader />;
  if (error || !user) {
    return (
      <EmptyState
        title="Профиль недоступен"
        text={error instanceof Error ? error.message : 'Сотрудник не найден'}
        action={<Button onClick={() => refetch()}>Повторить</Button>}
      />
    );
  }

  const name = displayName(user);
  const common = (chats || []).filter((c) => c.type !== 'private' && c.members?.some((m) => m.id === userId));
  const isMe = user.id === me.id;

  const write = async () => {
    try {
      const chat = await api.post<Chat>('/api/chats', { type: 'private', user_ids: [userId] });
      qc.invalidateQueries({ queryKey: chatKeys.list });
      navigate(`/chats/${chat.id}`);
    } catch (e) {
      toast.error(e, 'Не удалось открыть чат');
    }
  };

  const resetPassword = async (password?: string) => {
    if (password !== undefined && password.length < 8) {
      toast('Минимум 8 символов');
      return;
    }
    if (password === undefined && !(await confirm({ title: 'Сбросить пароль?', text: 'Будет создан новый случайный пароль. Старый перестанет работать, сотрудник выйдет на всех устройствах.', confirmText: 'Сбросить', danger: true }))) return;
    setBusy(true);
    try {
      const r = await api.post<{ password: string }>(`/api/users/${userId}/reset-password`, password ? { password } : {});
      setPasswordOpen(false);
      setManual('');
      setIssued(r.password);
    } catch (e) {
      toast.error(e, 'Не удалось сменить пароль');
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async () => {
    const activate = !user.is_active;
    const ok = await confirm({
      title: activate ? 'Вернуть доступ?' : 'Деактивировать сотрудника?',
      text: activate
        ? 'Сотрудник снова сможет входить и появится в списках.'
        : 'Сотрудник не сможет войти, пропадёт из списков участников и исполнителей. Его задачи, сообщения и история сохранятся.',
      confirmText: activate ? 'Активировать' : 'Деактивировать',
      danger: !activate,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api.patch(`/api/users/${userId}/active`, { is_active: activate });
      await refetch();
      qc.invalidateQueries({ queryKey: userKeys.all });
    } catch (e) {
      toast.error(e, 'Не удалось изменить статус');
    } finally {
      setBusy(false);
    }
  };

  const copyCredentials = async () => {
    const text = `Вход в Offix\nАдрес: ${window.location.origin}\nЛогин: ${user.username}\nПароль: ${issued}`;
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Скопировано');
    } catch {
      toast.error('Не удалось скопировать — выделите текст вручную');
    }
  };

  return (
    <div className={s.page}>
      <header className={s.header}>
        <IconButton label="Назад" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/chats'))}>
          <ChevronLeft size={26} />
        </IconButton>
        <div className={s.headerTitle}>Профиль</div>
      </header>
      <div className={s.scroll}>
        <div className={s.inner}>
          <section className={s.hero}>
            <Avatar name={name} src={user.avatar_url} size={110} online={presence?.online} />
            <h1 className={s.name}>{name}</h1>
            <div className={s.username}>@{user.username}</div>
            {user.role_name && (
              <div className={s.role} style={user.role_color ? { color: user.role_color } : undefined}>
                {user.role_name}
              </div>
            )}
            {!user.is_active ? (
              <span className={s.inactive}>Деактивирован</span>
            ) : (
              <div className={[s.presence, presence?.online && s.online].filter(Boolean).join(' ')}>{presence?.online ? 'в сети' : lastSeenLabel(presence?.last_seen_at)}</div>
            )}
            {!isMe && user.is_active && (
              <Button icon={<MessageCircle size={18} />} onClick={write}>
                Написать
              </Button>
            )}
          </section>

          <section className={s.card}>
            <div className={s.row}>
              <AtSign size={18} className={s.icon} />
              <span className={s.rowBody}>
                <span className={s.rowLabel}>Логин</span>
                <span className={s.rowValue}>@{user.username}</span>
              </span>
            </div>
            {user.email && (
              <a className={s.row} href={`mailto:${user.email}`}>
                <Mail size={18} className={s.icon} />
                <span className={s.rowBody}>
                  <span className={s.rowLabel}>Почта</span>
                  <span className={s.rowValue}>{user.email}</span>
                </span>
              </a>
            )}
          </section>

          {user.can_manage && !isMe && (
            <>
              <div className={s.section}>Учётная запись</div>
              <section className={s.card}>
                <button type="button" className={s.row} onClick={() => navigate(`/employee/${userId}`)}>
                  <BarChart3 size={18} className={s.icon} />
                  <span className={s.rowBody}>
                    <span className={s.rowValue}>Статистика сотрудника</span>
                  </span>
                  <ChevronRight size={18} className={s.chevron} />
                </button>
                <button type="button" className={s.row} onClick={() => resetPassword()} disabled={busy}>
                  <KeyRound size={18} className={s.icon} />
                  <span className={s.rowBody}>
                    <span className={s.rowValue}>Сбросить пароль</span>
                    <span className={s.rowLabel}>Новый случайный пароль</span>
                  </span>
                </button>
                <button type="button" className={s.row} onClick={() => setPasswordOpen(true)} disabled={busy}>
                  <KeyRound size={18} className={s.icon} />
                  <span className={s.rowBody}>
                    <span className={s.rowValue}>Задать пароль вручную</span>
                  </span>
                </button>
                <button type="button" className={s.row} onClick={toggleActive} disabled={busy}>
                  {user.is_active ? <UserX size={18} className={s.danger} /> : <UserCheck size={18} className={s.icon} />}
                  <span className={s.rowBody}>
                    <span className={[s.rowValue, user.is_active && s.danger].filter(Boolean).join(' ')}>
                      {user.is_active ? 'Деактивировать сотрудника' : 'Активировать сотрудника'}
                    </span>
                  </span>
                </button>
              </section>
            </>
          )}

          <div className={s.section}>
            {common.length ? `${common.length} ${plural(common.length, ['общая группа', 'общие группы', 'общих групп'])}` : 'Общие группы'}
          </div>
          <section className={s.card}>
            {common.length === 0 ? (
              <div className={s.empty}>Нет общих групп</div>
            ) : (
              common.map((c) => (
                <button key={c.id} type="button" className={s.row} onClick={() => navigate(`/chats/${c.id}`)}>
                  <Avatar name={c.name} src={c.avatar_url} size={36} />
                  <span className={s.rowBody}>
                    <span className={s.rowValue}>{c.name}</span>
                    <span className={s.rowLabel}>
                      <Users size={12} /> {c.members_count} {plural(c.members_count, ['участник', 'участника', 'участников'])}
                    </span>
                  </span>
                  <ChevronRight size={18} className={s.chevron} />
                </button>
              ))
            )}
          </section>
        </div>
      </div>

      <Modal
        open={passwordOpen}
        onClose={() => setPasswordOpen(false)}
        title="Новый пароль"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPasswordOpen(false)}>
              Отмена
            </Button>
            <Button onClick={() => resetPassword(manual)} loading={busy} disabled={manual.length < 8}>
              Задать
            </Button>
          </>
        }
      >
        <TextField
          label="Пароль для сотрудника"
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          placeholder="Минимум 8 символов"
          autoComplete="new-password"
          hint="Сотрудник выйдет на всех устройствах и войдёт с новым паролем."
          autoFocus
        />
      </Modal>

      <Modal
        open={!!issued}
        onClose={() => setIssued(null)}
        title="Пароль изменён"
        size="sm"
        footer={
          <>
            <Button variant="secondary" icon={<Copy size={17} />} onClick={copyCredentials}>
              Копировать
            </Button>
            <Button onClick={() => setIssued(null)}>Готово</Button>
          </>
        }
      >
        <p className={s.issuedHint}>Передайте данные сотруднику. После закрытия окна пароль больше не будет показан.</p>
        <div className={s.credentials}>
          <div>
            Логин: <b>{user.username}</b>
          </div>
          <div>
            Пароль: <b className={s.password}>{issued}</b>
          </div>
        </div>
      </Modal>
    </div>
  );
}
