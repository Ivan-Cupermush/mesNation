import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { AtSign, Contact, MessageCircle, UserRound } from 'lucide-react';
import { api } from '../../lib/http';
import { Avatar } from '../../ui/Avatar';
import { Button } from '../../ui/Button';
import { Modal } from '../../ui/Modal';
import { useFeedback } from '../../ui/feedback';
import { useContactNames } from './names';
import s from './contacts.module.css';

/** Сотрудник, которым поделились в чате. */
export interface SharedContact {
  id: number;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  role_name?: string | null;
  is_active?: boolean;
}

const realName = (c: SharedContact) => c.display_name || c.username;

/** Карточка контакта — в сообщении и в предпросмотре перед отправкой. */
export function ContactCard({ contact, mine }: { contact: SharedContact; mine: boolean }) {
  const { nameOf } = useContactNames();
  return (
    <span className={[s.card, mine && s.cardMine].filter(Boolean).join(' ')}>
      <span className={s.cardRow}>
        <Avatar name={realName(contact)} src={contact.avatar_url} size={46} />
        <span className={s.cardBody}>
          <span className={s.cardName}>{nameOf(contact.id) || realName(contact)}</span>
          <span className={s.cardSub}>{contact.role_name || `@${contact.username}`}</span>
        </span>
      </span>
      <span className={s.cardKind}>
        <Contact size={13} /> Контакт сотрудника
      </span>
    </span>
  );
}

/**
 * Контакт в ленте, как в Telegram: нажатие открывает профиль «в чатах» —
 * написать (личный чат, даже пустой) или перейти в профиль сотрудника.
 */
export default function ContactBubble({ contact, mine, meId }: { contact: SharedContact; mine: boolean; meId: number }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className={s.cardBtn}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        aria-label={`Контакт ${realName(contact)}`}
      >
        <ContactCard contact={contact} mine={mine} />
      </button>
      <span className={s.isolate} onClick={(e) => e.stopPropagation()} onContextMenu={(e) => e.stopPropagation()}>
        {open && <ContactSheet contact={contact} meId={meId} onClose={() => setOpen(false)} />}
      </span>
    </>
  );
}

export function ContactSheet({ contact, meId, onClose }: { contact: SharedContact; meId: number; onClose: () => void }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toast } = useFeedback();
  const { nameOf } = useContactNames();
  const [busy, setBusy] = useState(false);
  const alias = nameOf(contact.id);
  const inactive = contact.is_active === false;

  const write = async () => {
    setBusy(true);
    try {
      const chat = await api.post<{ id: number }>('/api/chats', { type: 'private', user_ids: [contact.id] });
      qc.invalidateQueries({ queryKey: ['chats'] });
      onClose();
      navigate(`/chats/${chat.id}`);
    } catch (e) {
      toast.error(e, 'Не удалось открыть чат');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} size="sm">
      <div className={s.sheet}>
        <Avatar name={realName(contact)} src={contact.avatar_url} size={92} />
        <h3 className={s.sheetName}>{alias || realName(contact)}</h3>
        {alias && <div className={s.sheetReal}>{realName(contact)}</div>}
        <div className={s.sheetMeta}>
          <AtSign size={13} /> {contact.username}
          {contact.role_name ? ` · ${contact.role_name}` : ''}
        </div>
        {inactive && <div className={s.sheetInactive}>Больше не работает в компании</div>}
        <div className={s.sheetActions}>
          {contact.id !== meId && !inactive && (
            <Button block size="lg" icon={<MessageCircle size={18} />} loading={busy} onClick={write}>
              Написать
            </Button>
          )}
          <Button
            block
            size="lg"
            variant="soft"
            icon={<UserRound size={18} />}
            onClick={() => {
              onClose();
              navigate(`/users/${contact.id}`);
            }}
          >
            Профиль сотрудника
          </Button>
        </div>
      </div>
    </Modal>
  );
}
