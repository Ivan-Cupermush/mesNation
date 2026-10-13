import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Link2, Share2 } from 'lucide-react';
import { api } from '../../lib/http';
import { useFeedback } from '../../ui/feedback';
import { EmptyState } from '../../ui/EmptyState';
import ChatPicker from '../chats/ChatPicker';

/**
 * /share — сайт, установленный как приложение, в системном «Поделиться»
 * (текст и ссылки): выбираем чат, при желании добавляем комментарий.
 */
export default function SharePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useFeedback();
  const [open, setOpen] = useState(true);
  const shared = useMemo(
    () => [params.get('title'), params.get('text'), params.get('url')].map((x) => (x || '').trim()).filter((x, i, all) => x && all.indexOf(x) === i).join('\n'),
    [params],
  );
  const isLink = /^https?:\/\/\S+$/.test(shared);

  if (!shared) {
    return (
      <div style={{ paddingTop: 60 }}>
        <EmptyState icon={<Share2 size={32} />} title="Нечего отправлять" text="Поделитесь текстом или ссылкой из другого приложения — Offix предложит выбрать чат." />
      </div>
    );
  }

  return (
    <ChatPicker
      open={open}
      title="Отправить в…"
      commentPlaceholder="Комментарий (необязательно)"
      onClose={() => {
        setOpen(false);
        navigate('/chats', { replace: true });
      }}
      preview={
        <span style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 12px', borderRadius: 14, background: 'var(--c-input-bg)', overflowWrap: 'anywhere' }}>
          {isLink && <Link2 size={18} style={{ flexShrink: 0, marginTop: 2, color: 'var(--c-accent)' }} />}
          <span style={{ whiteSpace: 'pre-wrap', maxHeight: 160, overflow: 'auto' }}>{shared}</span>
        </span>
      }
      onSend={async (chatId, topicId, comment) => {
        const text = (comment ? `${comment}\n${shared}` : shared).slice(0, 4000);
        await api.post(`/api/chats/${chatId}/messages`, { text, topic_id: topicId ?? undefined });
        toast.success('Отправлено');
        setOpen(false);
        navigate(topicId ? `/chats/${chatId}/topic/${topicId}` : `/chats/${chatId}`, { replace: true });
      }}
    />
  );
}
