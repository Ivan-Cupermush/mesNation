import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Check, MessageCircle, Share2, UserPen, UserPlus, Users } from 'lucide-react';
import { api } from '../../lib/http';
import { fuzzyMatch } from '../../lib/fuzzy';
import { plural } from '../../lib/format';
import { ActionMenu, type MenuItem } from '../../ui/ActionMenu';
import { Avatar } from '../../ui/Avatar';
import { Button } from '../../ui/Button';
import { Modal } from '../../ui/Modal';
import { SearchField, TextField } from '../../ui/Field';
import { Spinner } from '../../ui/Spinner';
import { useFeedback } from '../../ui/feedback';
import type { MenuAnchor } from '../../ui/menuAnchor';
import ChatPicker from '../chats/ChatPicker';
import { ContactCard, type SharedContact } from './ContactCard';
import { useContactNames, useSaveContactName } from './names';
import s from './contacts.module.css';

/**
 * Меню ⋯ в профиле сотрудника и в информации о личном чате — как в Telegram:
 * поделиться контактом, изменить контакт (своё имя, видно только мне),
 * добавить в группу.
 */
export default function ContactMenu({
  anchor,
  onClose,
  user,
  onWrite,
}: {
  anchor: MenuAnchor | null;
  onClose: () => void;
  user: SharedContact;
  onWrite?: () => void;
}) {
  const { toast } = useFeedback();
  const [share, setShare] = useState(false);
  const [edit, setEdit] = useState(false);
  const [groups, setGroups] = useState(false);
  const name = user.display_name || user.username;

  const items: MenuItem[] = [
    ...(onWrite ? [{ key: 'write', label: 'Написать', icon: <MessageCircle size={18} />, onSelect: onWrite }] : []),
    { key: 'share', label: 'Поделиться контактом', icon: <Share2 size={18} />, onSelect: () => setShare(true) },
    { key: 'edit', label: 'Изменить контакт', icon: <UserPen size={18} />, onSelect: () => setEdit(true) },
    { key: 'group', label: 'Добавить в группу', icon: <UserPlus size={18} />, onSelect: () => setGroups(true) },
  ];

  return (
    <>
      <ActionMenu open={!!anchor} anchor={anchor} items={items} title={name} onClose={onClose} />
      <ChatPicker
        open={share}
        title="Поделиться контактом"
        commentPlaceholder="Подпись (необязательно)"
        onClose={() => setShare(false)}
        onSend={async (chatId, topicId, comment) => {
          await api.post(`/api/chats/${chatId}/contact`, { user_id: user.id, topic_id: topicId, comment: comment || undefined });
          toast.success('Контакт отправлен');
        }}
        preview={
          <span className={s.previewBubble}>
            <ContactCard contact={user} mine />
          </span>
        }
      />
      {edit && <EditContact user={user} onClose={() => setEdit(false)} />}
      {groups && <AddToGroup user={user} onClose={() => setGroups(false)} />}
    </>
  );
}

function EditContact({ user, onClose }: { user: SharedContact; onClose: () => void }) {
  const { toast } = useFeedback();
  const { map } = useContactNames();
  const save = useSaveContactName();
  const real = user.display_name || user.username;
  const rec = map.get(user.id);
  const [first, setFirst] = useState(rec?.first_name ?? real.split(' ')[0] ?? '');
  const [last, setLast] = useState(rec?.last_name ?? real.split(' ').slice(1).join(' '));
  const [busy, setBusy] = useState(false);

  const submit = async (f: string, l: string) => {
    setBusy(true);
    try {
      await save(user.id, f.trim(), l.trim());
      toast.success(f.trim() || l.trim() ? 'Имя контакта сохранено' : 'Показывается настоящее имя');
      onClose();
    } catch (e) {
      toast.error(e, 'Не удалось сохранить');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Изменить контакт"
      size="sm"
      footer={
        <>
          {rec && (
            <Button variant="ghost" className={s.reset} disabled={busy} onClick={() => submit('', '')}>
              Вернуть настоящее имя
            </Button>
          )}
          <Button loading={busy} onClick={() => submit(first, last)}>
            Сохранить
          </Button>
        </>
      }
    >
      <form
        className={s.edit}
        onSubmit={(e) => {
          e.preventDefault();
          submit(first, last);
        }}
      >
        <div className={s.editHero}>
          <Avatar name={real} src={user.avatar_url} size={72} />
          <div className={s.editPreview}>{`${first} ${last}`.trim() || real}</div>
          <div className={s.editReal}>в профиле: {real}</div>
        </div>
        <TextField label="Имя" value={first} onChange={(e) => setFirst(e.target.value)} maxLength={100} autoFocus />
        <TextField label="Фамилия" value={last} onChange={(e) => setLast(e.target.value)} maxLength={100} />
        <p className={s.hint}>Это имя видите только вы — в списке чатов, в чате и в подписях сообщений. Настоящие данные сотрудника остаются в его профиле.</p>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

interface GroupRow {
  id: number;
  name: string;
  avatar_url: string | null;
  members_count: number;
  is_member: boolean;
  can_add: boolean;
}

function AddToGroup({ user, onClose }: { user: SharedContact; onClose: () => void }) {
  const { toast, confirm } = useFeedback();
  const qc = useQueryClient();
  const [list, setList] = useState<GroupRow[] | null>(null);
  const [q, setQ] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);
  const name = user.display_name || user.username;

  useEffect(() => {
    api
      .get<GroupRow[]>(`/api/contacts/${user.id}/groups`)
      .then(setList)
      .catch((e) => {
        setList([]);
        toast.error(e, 'Не удалось загрузить группы');
      });
  }, [user.id, toast]);

  const shown = useMemo(() => (list || []).filter((g) => !q.trim() || fuzzyMatch(g.name || '', q).match), [list, q]);

  const add = async (g: GroupRow) => {
    if (!(await confirm({ title: 'Добавить в группу?', text: `${name} появится в «${g.name}» и увидит новые сообщения.`, confirmText: 'Добавить' }))) return;
    setBusyId(g.id);
    try {
      await api.post(`/api/chats/${g.id}/members`, { user_ids: [user.id] });
      setList((prev) => (prev || []).map((x) => (x.id === g.id ? { ...x, is_member: true, members_count: x.members_count + 1 } : x)));
      qc.invalidateQueries({ queryKey: ['chats'] });
      toast.success(`${name} — в «${g.name}»`);
    } catch (e) {
      toast.error(e, 'Не удалось добавить');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Modal open onClose={onClose} title={`Добавить в группу · ${name}`} size="md" flush>
      <div className={s.groupSearch}>
        <SearchField value={q} onChange={setQ} placeholder="Поиск группы" autoFocus />
      </div>
      <div className={s.groupList}>
        {list === null ? (
          <div className={s.center}>
            <Spinner />
          </div>
        ) : !shown.length ? (
          <div className={s.center}>
            <Users size={36} strokeWidth={1.5} />
            {list.length ? 'Ничего не найдено' : 'У вас пока нет групп'}
          </div>
        ) : (
          shown.map((g) => {
            const disabled = g.is_member || !g.can_add || busyId !== null;
            return (
              <button key={g.id} type="button" className={s.groupRow} disabled={disabled} onClick={() => add(g)}>
                <Avatar name={g.name} src={g.avatar_url} size={44} rounded />
                <span className={s.groupBody}>
                  <span className={s.groupName}>{g.name}</span>
                  <span className={s.groupSub}>
                    {g.is_member
                      ? 'уже в группе'
                      : !g.can_add
                        ? 'нет прав приглашать'
                        : `${g.members_count} ${plural(g.members_count, ['участник', 'участника', 'участников'])}`}
                  </span>
                </span>
                {busyId === g.id ? <Spinner size={18} /> : g.is_member ? <Check size={20} className={s.ok} /> : g.can_add ? <UserPlus size={19} className={s.ok} /> : null}
              </button>
            );
          })
        )}
      </div>
    </Modal>
  );
}
