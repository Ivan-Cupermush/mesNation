import { MessageCircle } from 'lucide-react';
import { EmptyState } from '../../ui/EmptyState';

export default function ChatsRoutes() {
  return <EmptyState icon={<MessageCircle size={44} />} title="Чаты" text="Раздел в разработке" />;
}
