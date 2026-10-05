import {
  BookOpen,
  Briefcase,
  Camera,
  CalendarDays,
  ChartColumn,
  Code,
  FileText,
  Globe,
  Hash,
  Heart,
  Lightbulb,
  MessageSquare,
  Music,
  Rocket,
  Shield,
  ShoppingBag,
  Star,
  Target,
  Users,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { withAlpha } from '../../theme/palettes';
import type { Topic } from './types';

/** Иконки и цвета тем — те же, что в приложении (mobile/src/theme/topicIcons.ts). */
export const TOPIC_ICONS: Record<string, LucideIcon> = {
  hash: Hash,
  message: MessageSquare,
  file: FileText,
  briefcase: Briefcase,
  target: Target,
  bulb: Lightbulb,
  calendar: CalendarDays,
  chart: ChartColumn,
  users: Users,
  star: Star,
  heart: Heart,
  zap: Zap,
  book: BookOpen,
  shop: ShoppingBag,
  rocket: Rocket,
  music: Music,
  code: Code,
  globe: Globe,
  shield: Shield,
  camera: Camera,
};

export const TOPIC_COLORS = ['#1F7A52', '#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B', '#0EA5E9', '#14B8A6', '#6B7280'];

export const TOPIC_OPACITIES = [
  { value: 1, label: '100%' },
  { value: 0.7, label: '70%' },
  { value: 0.4, label: '40%' },
];

/** Значок темы: цветная иконка на мягком фоне. topic = null — «Общий». */
export function TopicIcon({ topic, size = 44 }: { topic: Pick<Topic, 'icon' | 'icon_color' | 'icon_opacity'> | null; size?: number }) {
  const Icon = topic ? TOPIC_ICONS[topic.icon] || Hash : MessageSquare;
  const color = topic?.icon_color || 'var(--c-accent)';
  const bg = topic?.icon_color ? withAlpha(topic.icon_color, 0.14) : 'var(--c-accent-muted)';
  return (
    <span
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: '50%',
        background: bg,
        color,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon size={Math.round(size * 0.5)} strokeWidth={2.2} style={{ opacity: topic?.icon_opacity ?? 1 }} />
    </span>
  );
}
