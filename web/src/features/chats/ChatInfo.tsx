import { useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BarChart3,
  Bell,
  BellOff,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  Crown,
  FileText,
  Image as ImageIcon,
  Layers,
  Link2,
  LogOut,
  MessageCircle,
  Pencil,
  Shield,
  ShieldOff,
  Trash2,
  UserMinus,
  UserPlus,
  UserRound,
} from 'lucide-react';
import { useMe } from '../auth/AuthProvider';
import { api, uploadFile } from '../../lib/http';
import { displayName, lastSeenLabel, plural } from '../../lib/format';
import { Avatar } from '../../ui/Avatar';
import { Button, IconButton } from '../../ui/Button';
import { Modal } from '../../ui/Modal';
import { Switch } from '../../ui/Field';
import { PageLoader, Spinner } from '../../ui/Spinner';
import { EmptyState } from '../../ui/EmptyState';
import { ActionMenu, type MenuItem } from '../../ui/ActionMenu';
import { anchorFrom, type MenuAnchor } from '../../ui/menuAnchor';
import { useFeedback } from '../../ui/feedback';
import { usePresence } from '../users/queries';
import { UserPicker } from '../users/UserPicker';
import { chatKeys, isMuted, useChatDetail, useTopics } from './queries';
import { MUTE_OPTIONS, muteLabel, removeChat, setChatMute } from './chatActions';
import { TopicIcon } from './topicIcons';
import TopicEditor from './TopicEditor';
import type { AdminPermission, Chat, ChatMember, Topic } from './types';
import s from './ChatInfo.module.css';

const PERMS: { key: AdminPermission; label: string }[] = [
  { key: 'change_info', label: 'Изменение названия, фото и тем' },
  { key: 'delete_messages', label: 'Удаление чужих сообщений' },
  { key: 'ban_users', label: 'Исключение участников' },
  { key: 'add_users', label: 'Добавление участников' },
  { key: 'pin_messages', label: 'Закрепление сообщений' },
  { key: 'add_admins', label: 'Назначение администраторов' },
];
const DEFAULT_PERMS: AdminPermission[] = ['change_info', 'delete_messages', 'ban_users', 'add_users', 'pin_messages'];

interface Stats {
  media: number;
  files: number;
  links: number;
  polls: number;
}

interface AdminRow {
  id: number;
  permissions: AdminPermission[];
}

/**
 * Информация о чате — как в приложении. Группа: фото и название, медиа,
 * уведомления, темы, участники с ролями, права администраторов, выход и
 * удаление. Личный чат: собеседник, общие медиа, удаление. Тема: значок,
 * название, медиа темы, изменение и удаление.
 */
export default function ChatInfo() {
  const { topicId } = useParams();
  return topicId !== undefined && Number(topicId) > 0 ? <TopicInfo topicId={Number(topicId)} /> : <GroupOrPrivateInfo />;
}

function GroupOrPrivateInfo() {
  const { chatId = '' } = useParams();
  const me = useMe();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toast, confirm, prompt } = useFeedback();
  const { data: chat, isLoading, error } = useChatDetail(chatId);
  const isGroup = chat?.type === 'group';
  const { data: stats } = useQuery({ queryKey: ['chat-stats', chatId], queryFn: () => api.get<Stats>(`/api/chats/${chatId}/stats`), staleTime: 30_000 });
  const { data: admins } = useQuery({
    queryKey: ['chat-admins', chatId],
    queryFn: () => api.get<AdminRow[]>(`/api/chats/${chatId}/admins`),
    enabled: isGroup,
    staleTime: 30_000,
  });
  const members = useMemo(() => chat?.members || [], [chat]);
  const presence = usePresence(members.map((m) => m.id));
  const [memberMenu, setMemberMenu] = useState<{ m: ChatMember; anchor: MenuAnchor } | null>(null);
  const [muteAnchor, setMuteAnchor] = useState<MenuAnchor | null>(null);
  const [adminEditor, setAdminEditor] = useState<{ user: ChatMember; perms: AdminPermission[]; existing: boolean } | null>(null);
  const [adding, setAdding] = useState(false);
  const [topicsOff, setTopicsOff] = useState(false);
  const [uploading, setUploading] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);

  if (isLoading) return <PageLoader />;
  if (error || !chat) {
    return <EmptyState title="Чат недоступен" text="Его удалили или вы больше не участник." action={<Button onClick={() => navigate('/chats')}>К списку чатов</Button>} />;
  }

  const rights = chat.my_rights;
  const name = chat.name || 'Чат';
  const peer = chat.peer;
  const onlineCount = members.filter((m) => presence.get(m.id)?.online).length;
  const muted = isMuted(chat.muted_until);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: chatKeys.detail(chatId) });
    qc.invalidateQueries({ queryKey: chatKeys.list });
    qc.invalidateQueries({ queryKey: ['chat-admins', chatId] });
  };
  const fail = (e: unknown) => toast.error(e);
  const back = () => navigate(`/chats/${chatId}`);

  // ===== Действия =====
  const rename = async () => {
    const value = await prompt({ title: 'Название группы', initialValue: name, required: true, maxLength: 255, confirmText: 'Сохранить' });
    if (!value || value === name) return;
    api.patch(`/api/chats/${chatId}`, { name: value }).then(refresh, fail);
  };

  const changePhoto = async (file: File) => {
    setUploading(true);
    try {
      await uploadFile(`/api/chats/${chatId}/avatar`, 'avatar', file);
      refresh();
    } catch (e) {
      toast.error(e, 'Не удалось загрузить фото');
    } finally {
      setUploading(false);
    }
  };

  const toggleTopics = async (value: boolean) => {
    if (!value) {
      setTopicsOff(true);
      return;
    }
    if (!(await confirm({ title: 'Включить темы?', text: 'Переписка разделится на темы. Текущие сообщения останутся в «Общем» чате, ничего не удалится.', confirmText: 'Включить' }))) return;
    try {
      await api.patch(`/api/chats/${chatId}`, { is_supergroup: true });
      refresh();
      navigate(`/chats/${chatId}`);
    } catch (e) {
      fail(e);
    }
  };

  const changeMute = (ms: number | null | 0) => setChatMute(chatId, ms).then(refresh, fail);

  const writePrivately = async (m: ChatMember) => {
    try {
      const c = await api.post<Chat>('/api/chats', { type: 'private', user_ids: [m.id] });
      qc.invalidateQueries({ queryKey: chatKeys.list });
      navigate(`/chats/${c.id}`);
    } catch (e) {
      fail(e);
    }
  };

  const removeMember = async (m: ChatMember) => {
    if (!(await confirm({ title: 'Исключить участника?', text: `${displayName(m)} больше не увидит новые сообщения группы.`, confirmText: 'Исключить', danger: true }))) return;
    api.delete(`/api/chats/${chatId}/members/${m.id}`).then(refresh, fail);
  };

  const dismissAdmin = async (m: ChatMember) => {
    if (!(await confirm({ title: 'Снять администратора?', text: `${displayName(m)} останется участником без особых прав.`, confirmText: 'Снять', danger: true }))) return;
    api.delete(`/api/chats/${chatId}/admins/${m.id}`).then(refresh, fail);
  };

  const saveAdmin = async () => {
    if (!adminEditor) return;
    const { user, perms, existing } = adminEditor;
    try {
      if (existing) await api.patch(`/api/chats/${chatId}/admins/${user.id}`, { permissions: perms });
      else await api.post(`/api/chats/${chatId}/admins`, { user_id: user.id, permissions: perms });
      setAdminEditor(null);
      refresh();
    } catch (e) {
      toast.error(e, 'Не удалось сохранить');
    }
  };

  const leave = async () => {
    const ok = await confirm({
      title: 'Покинуть группу?',
      text: rights.is_creator ? 'Вы владелец: права перейдут администратору или самому давнему участнику.' : `Вы перестанете получать сообщения «${name}».`,
      confirmText: 'Покинуть',
      danger: true,
    });
    if (!ok) return;
    try {
      await removeChat(chatId, true);
      qc.invalidateQueries({ queryKey: chatKeys.list });
      navigate('/chats', { replace: true });
    } catch (e) {
      fail(e);
    }
  };

  const deleteChat = async () => {
    const ok = await confirm({
      title: isGroup ? 'Удалить группу для всех?' : 'Удалить чат?',
      text: isGroup
        ? 'Группа исчезнет у всех участников. Переписка сохранится в архиве компании.'
        : 'Чат исчезнет из вашего списка. У собеседника он останется; если он напишет, чат вернётся.',
      confirmText: 'Удалить',
      danger: true,
    });
    if (!ok) return;
    try {
      await removeChat(chatId);
      qc.invalidateQueries({ queryKey: chatKeys.list });
      navigate('/chats', { replace: true });
    } catch (e) {
      fail(e);
    }
  };

  const memberItems = (m: ChatMember): MenuItem[] => {
    const list: MenuItem[] = [
      { key: 'profile', label: 'Профиль', icon: <UserRound size={19} />, onSelect: () => navigate(`/users/${m.id}`) },
    ];
    if (m.id === me.id) return list;
    list.push({ key: 'write', label: 'Написать лично', icon: <MessageCircle size={19} />, onSelect: () => writePrivately(m) });
    if (m.role === 'creator') return list;
    const admin = admins?.find((a) => a.id === m.id);
    if (rights.can_add_admins) {
      list.push({
        key: 'admin',
        label: admin ? 'Изменить права администратора' : 'Назначить администратором',
        icon: <Shield size={19} />,
        onSelect: () => setAdminEditor({ user: m, perms: admin?.permissions || DEFAULT_PERMS, existing: !!admin }),
      });
      if (admin) list.push({ key: 'unadmin', label: 'Снять администратора', icon: <ShieldOff size={19} />, onSelect: () => dismissAdmin(m) });
    }
    if (rights.can_ban_users && (!admin || rights.is_creator)) {
      list.push({ key: 'kick', label: 'Исключить из группы', danger: true, icon: <UserMinus size={19} />, onSelect: () => removeMember(m) });
    }
    return list;
  };

  const peerPresence = peer ? presence.get(peer.id) : undefined;

  return (
    <div className={s.page}>
      <header className={s.header}>
        <IconButton label="Назад" onClick={back}>
          <ChevronLeft size={26} />
        </IconButton>
        <div className={s.headerTitle}>{isGroup ? 'Группа' : 'Информация'}</div>
        {isGroup && rights.can_change_info && (
          <IconButton label="Изменить название" onClick={rename}>
            <Pencil size={19} />
          </IconButton>
        )}
      </header>

      <div className={s.scroll}>
        <div className={s.inner}>
          <section className={s.hero}>
            <div className={s.heroAvatar}>
              <Avatar name={name} src={chat.avatar_url} size={104} />
              {isGroup && rights.can_change_info && (
                <button type="button" className={s.camera} onClick={() => photoInput.current?.click()} disabled={uploading} aria-label="Сменить фото группы">
                  {uploading ? <Spinner size={16} inherit /> : <Camera size={17} />}
                </button>
              )}
              <input
                ref={photoInput}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  const f = e.currentTarget.files?.[0];
                  e.currentTarget.value = '';
                  if (f) changePhoto(f);
                }}
              />
            </div>
            <h1 className={s.heroName}>{name}</h1>
            <div className={[s.heroSub, !isGroup && peerPresence?.online && s.accent].filter(Boolean).join(' ')}>
              {isGroup
                ? `${chat.is_supergroup ? 'Группа с темами' : 'Группа'} · ${members.length} ${plural(members.length, ['участник', 'участника', 'участников'])}${onlineCount > 1 ? `, ${onlineCount} в сети` : ''}`
                : peerPresence?.online
                  ? 'в сети'
                  : lastSeenLabel(peerPresence?.last_seen_at)}
            </div>
            {!isGroup && peer && (
              <Button variant="soft" icon={<UserRound size={18} />} onClick={() => navigate(`/users/${peer.id}`)}>
                Профиль сотрудника
              </Button>
            )}
          </section>

          <MediaRows stats={stats} base={`/chats/${chatId}`} />

          <section className={s.card}>
            <Row
              icon={muted ? <BellOff size={19} /> : <Bell size={19} />}
              tone={muted ? 'muted' : 'accent'}
              title="Уведомления"
              hint={muteLabel(chat.muted_until)}
              right={muted ? <span className={s.accent}>Включить</span> : <ChevronRight size={18} />}
              onClick={(e) => (muted ? changeMute(0) : setMuteAnchor(anchorFrom(e.currentTarget)))}
            />
          </section>

          {isGroup && rights.can_change_info && (
            <section className={s.card}>
              <label className={s.row}>
                <span className={[s.rowIcon, s.toneAccent].join(' ')}>
                  <Layers size={19} />
                </span>
                <span className={s.rowBody}>
                  <span className={s.rowTitle}>Темы</span>
                  <span className={s.rowHint}>Разделить переписку на отдельные ветки</span>
                </span>
                <Switch checked={!!chat.is_supergroup} onChange={toggleTopics} label="Темы" />
              </label>
            </section>
          )}

          {isGroup && (
            <>
              <div className={s.section}>
                {members.length} {plural(members.length, ['участник', 'участника', 'участников'])}
              </div>
              <section className={s.card}>
                {rights.can_add_users && (
                  <Row icon={<UserPlus size={19} />} tone="accent" title={<span className={s.accent}>Добавить участников</span>} onClick={() => setAdding(true)} />
                )}
                {members.map((m) => {
                  const p = presence.get(m.id);
                  return (
                    <button key={m.id} type="button" className={s.member} onClick={(e) => setMemberMenu({ m, anchor: anchorFrom(e.currentTarget) })}>
                      <Avatar name={displayName(m)} src={m.avatar_url} size={44} online={p?.online} />
                      <span className={s.rowBody}>
                        <span className={s.rowTitle}>
                          {displayName(m)}
                          {m.id === me.id ? ' (вы)' : ''}
                        </span>
                        <span className={[s.rowHint, p?.online && s.accent].filter(Boolean).join(' ')}>{p?.online ? 'в сети' : lastSeenLabel(p?.last_seen_at)}</span>
                      </span>
                      {m.role === 'creator' ? (
                        <span className={[s.badge, s.badgeOwner].join(' ')}>
                          <Crown size={11} /> владелец
                        </span>
                      ) : m.role === 'admin' ? (
                        <span className={[s.badge, s.badgeAdmin].join(' ')}>
                          <Shield size={11} /> админ
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </section>
            </>
          )}

          <section className={s.card}>
            {isGroup && <Row icon={<LogOut size={19} />} tone="danger" title={<span className={s.danger}>Покинуть группу</span>} onClick={leave} />}
            {(!isGroup || rights.is_creator) && (
              <Row icon={<Trash2 size={19} />} tone="danger" title={<span className={s.danger}>{isGroup ? 'Удалить группу' : 'Удалить чат'}</span>} onClick={deleteChat} />
            )}
          </section>
        </div>
      </div>

      <ActionMenu
        open={!!memberMenu}
        anchor={memberMenu?.anchor ?? null}
        title={memberMenu ? displayName(memberMenu.m) : undefined}
        items={memberMenu ? memberItems(memberMenu.m) : []}
        onClose={() => setMemberMenu(null)}
      />
      <ActionMenu
        open={!!muteAnchor}
        anchor={muteAnchor}
        title="Уведомления этого чата"
        items={MUTE_OPTIONS.map((o) => ({ key: o.key, label: o.label, icon: <BellOff size={19} />, onSelect: () => changeMute(o.ms) }))}
        onClose={() => setMuteAnchor(null)}
      />

      <Modal
        open={!!adminEditor}
        onClose={() => setAdminEditor(null)}
        title={adminEditor?.existing ? 'Права администратора' : 'Назначить администратором'}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAdminEditor(null)}>
              Отмена
            </Button>
            <Button onClick={saveAdmin}>{adminEditor?.existing ? 'Сохранить права' : 'Назначить'}</Button>
          </>
        }
      >
        {adminEditor && (
          <>
            <div className={s.adminUser}>
              <Avatar name={displayName(adminEditor.user)} src={adminEditor.user.avatar_url} size={44} />
              <span className={s.rowBody}>
                <span className={s.rowTitle}>{displayName(adminEditor.user)}</span>
                <span className={s.rowHint}>{adminEditor.existing ? 'Администратор' : 'Станет администратором'}</span>
              </span>
            </div>
            <div className={s.section}>Что может администратор</div>
            {PERMS.map((p) => {
              const on = adminEditor.perms.includes(p.key);
              const locked = p.key === 'add_admins' && !rights.is_creator;
              return (
                <button
                  key={p.key}
                  type="button"
                  className={s.perm}
                  disabled={locked}
                  onClick={() => setAdminEditor((ed) => ed && { ...ed, perms: on ? ed.perms.filter((x) => x !== p.key) : [...ed.perms, p.key] })}
                >
                  <span>{p.label}</span>
                  <span className={[s.checkbox, on && s.checkboxOn].filter(Boolean).join(' ')}>{on && <Check size={14} strokeWidth={3} />}</span>
                </button>
              );
            })}
          </>
        )}
      </Modal>

      <AddMembers open={adding} chatId={chatId} exclude={members.map((m) => m.id)} onClose={() => setAdding(false)} onAdded={refresh} />
      <TopicsOffDialog open={topicsOff} chatId={chatId} onClose={() => setTopicsOff(false)} onDone={() => (refresh(), navigate(`/chats/${chatId}`))} />
    </div>
  );
}

// ===== Тема супергруппы =====

function TopicInfo({ topicId }: { topicId: number }) {
  const { chatId = '' } = useParams();
  const me = useMe();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toast, confirm } = useFeedback();
  const { data: chat } = useChatDetail(chatId);
  const { data: topics, isLoading } = useTopics(chatId);
  const topic = topics?.find((t) => t.id === topicId);
  const { data: stats } = useQuery({
    queryKey: ['topic-stats', chatId, topicId],
    queryFn: () => api.get<Stats>(`/api/chats/${chatId}/topics/${topicId}/stats`),
    staleTime: 30_000,
  });
  const [editing, setEditing] = useState(false);

  if (isLoading) return <PageLoader />;
  if (!topic) {
    return <EmptyState title="Тема не найдена" text="Возможно, её удалили." action={<Button onClick={() => navigate(`/chats/${chatId}`)}>К темам группы</Button>} />;
  }

  const canManage = topic.created_by === me.id || !!chat?.my_rights.can_change_info;
  const base = `/chats/${chatId}/topic/${topicId}`;

  const remove = async () => {
    if (!(await confirm({ title: 'Удалить тему?', text: 'Тема исчезнет у всех участников. Сообщения не удаляются — они остаются в архиве группы.', confirmText: 'Удалить', danger: true }))) return;
    try {
      await api.delete(`/api/topics/${topic.id}`);
      qc.invalidateQueries({ queryKey: chatKeys.topics(chatId) });
      navigate(`/chats/${chatId}`, { replace: true });
    } catch (e) {
      toast.error(e, 'Не удалось удалить тему');
    }
  };

  return (
    <div className={s.page}>
      <header className={s.header}>
        <IconButton label="Назад" onClick={() => navigate(base)}>
          <ChevronLeft size={26} />
        </IconButton>
        <div className={s.headerTitle}>Тема</div>
        {canManage && (
          <IconButton label="Изменить тему" onClick={() => setEditing(true)}>
            <Pencil size={19} />
          </IconButton>
        )}
      </header>
      <div className={s.scroll}>
        <div className={s.inner}>
          <section className={s.hero}>
            <TopicIcon topic={topic} size={96} />
            <h1 className={s.heroName}>{topic.title}</h1>
            <div className={s.heroSub}>Тема · {chat?.name || 'группа'}</div>
          </section>
          <MediaRows stats={stats} base={base} />
          {canManage && (
            <section className={s.card}>
              <Row icon={<Pencil size={19} />} tone="accent" title="Изменить название и значок" onClick={() => setEditing(true)} />
              <Row icon={<Trash2 size={19} />} tone="danger" title={<span className={s.danger}>Удалить тему</span>} onClick={remove} />
            </section>
          )}
        </div>
      </div>
      <TopicEditor open={editing} chatId={chatId} topic={topic} onClose={() => setEditing(false)} onSaved={() => qc.invalidateQueries({ queryKey: chatKeys.topics(chatId) })} />
    </div>
  );
}

// ===== Общие части =====

function MediaRows({ stats, base }: { stats?: Stats; base: string }) {
  const navigate = useNavigate();
  const rows = [
    { key: 'media', label: 'Фото и видео', icon: <ImageIcon size={19} />, tone: 'violet' as const, count: stats?.media },
    { key: 'files', label: 'Файлы', icon: <FileText size={19} />, tone: 'accent' as const, count: stats?.files },
    { key: 'links', label: 'Ссылки', icon: <Link2 size={19} />, tone: 'info' as const, count: stats?.links },
    { key: 'polls', label: 'Опросы', icon: <BarChart3 size={19} />, tone: 'warning' as const, count: stats?.polls },
  ];
  return (
    <section className={s.card}>
      {rows.map((r) => (
        <Row
          key={r.key}
          icon={r.icon}
          tone={r.tone}
          title={r.label}
          right={
            <>
              <span className={s.count}>{r.count ?? ''}</span>
              <ChevronRight size={18} />
            </>
          }
          onClick={() => navigate(`${base}/media?type=${r.key}`)}
        />
      ))}
    </section>
  );
}

type Tone = 'accent' | 'violet' | 'info' | 'warning' | 'danger' | 'muted';
const TONES: Record<Tone, string> = { accent: s.toneAccent, violet: s.toneViolet, info: s.toneInfo, warning: s.toneWarning, danger: s.toneDanger, muted: s.toneMuted };

function Row({
  icon,
  tone,
  title,
  hint,
  right,
  onClick,
}: {
  icon: ReactNode;
  tone: Tone;
  title: ReactNode;
  hint?: ReactNode;
  right?: ReactNode;
  onClick: (e: MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button type="button" className={s.row} onClick={onClick}>
      <span className={[s.rowIcon, TONES[tone]].join(' ')}>{icon}</span>
      <span className={s.rowBody}>
        <span className={s.rowTitle}>{title}</span>
        {hint && <span className={s.rowHint}>{hint}</span>}
      </span>
      {right && <span className={s.rowRight}>{right}</span>}
    </button>
  );
}

function AddMembers({ open, chatId, exclude, onClose, onAdded }: { open: boolean; chatId: string; exclude: number[]; onClose: () => void; onAdded: () => void }) {
  const { toast } = useFeedback();
  const [selected, setSelected] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const add = async () => {
    setBusy(true);
    try {
      await api.post(`/api/chats/${chatId}/members`, { user_ids: selected });
      toast.success(selected.length > 1 ? 'Участники добавлены' : 'Участник добавлен');
      setSelected([]);
      onAdded();
      onClose();
    } catch (e) {
      toast.error(e, 'Не удалось добавить');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Добавить участников"
      size="md"
      flush
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button onClick={add} loading={busy} disabled={!selected.length}>
            Добавить{selected.length ? ` (${selected.length})` : ''}
          </Button>
        </>
      }
    >
      <div className={s.pickerBox}>
        <UserPicker exclude={exclude} multiple selected={selected} onToggle={(id) => setSelected((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))} autoFocus />
      </div>
    </Modal>
  );
}

function TopicsOffDialog({ open, chatId, onClose, onDone }: { open: boolean; chatId: string; onClose: () => void; onDone: () => void }) {
  const { toast } = useFeedback();
  const { data: topics } = useTopics(chatId, { enabled: open });
  const [keep, setKeep] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const off = async () => {
    setBusy(true);
    try {
      await api.patch(`/api/chats/${chatId}`, { is_supergroup: false, keep_topic_id: keep, merge: true });
      onClose();
      onDone();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };
  const options: (Topic | null)[] = [null, ...(topics || [])];
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Выключить темы?"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button variant="danger" onClick={off} loading={busy}>
            Выключить темы
          </Button>
        </>
      }
    >
      <p className={s.dialogText}>Сообщения тем не удаляются — они сохранятся и вернутся, если включить темы снова. Можно перенести одну тему в общий чат.</p>
      <div className={s.topicChoices}>
        {options.map((t) => (
          <button key={t?.id ?? 0} type="button" className={[s.topicChoice, keep === (t?.id ?? null) && s.topicChoiceOn].filter(Boolean).join(' ')} onClick={() => setKeep(t?.id ?? null)}>
            {t ? <TopicIcon topic={t} size={28} /> : <span className={s.topicNone} />}
            <span className={s.rowBody}>{t ? `Перенести «${t.title}» в общий чат` : 'Ничего не переносить'}</span>
            {keep === (t?.id ?? null) && <Check size={18} className={s.accent} />}
          </button>
        ))}
      </div>
    </Modal>
  );
}
