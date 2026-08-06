import {
  Hash, MessageSquare, FileText, Briefcase, Target, Lightbulb,
  CalendarDays, ChartColumn, Users, Star, Heart, Zap, BookOpen,
  ShoppingBag, Rocket, Music, Code, Globe, Shield, Camera,
} from 'lucide-react-native';

// ===== Минималистичные иконки топиков (Lucide, stroke 2) =====
export const TOPIC_ICONS: Record<string, any> = {
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

// ===== Палитра цветов (из дизайн-системы) =====
export const TOPIC_COLORS = [
  '#1F7A52', // фирменный зелёный (default)
  '#3B82F6',
  '#8B5CF6',
  '#EC4899',
  '#F59E0B',
  '#0EA5E9',
  '#14B8A6',
  '#6B7280',
];

export const TOPIC_OPACITIES = [
  { value: 1, label: '100%' },
  { value: 0.7, label: '70%' },
  { value: 0.4, label: '40%' },
];

// ===== Идеальный default под дизайн приложения =====
export const DEFAULT_TOPIC_STYLE = {
  icon: 'hash',
  color: '#1F7A52',
  opacity: 1,
};

// ===== hex -> rgba (для мягкого фона иконок) =====
export const hexToRgba = (hex: string, alpha: number): string => {
  const h = (hex || '#1F7A52').replace('#', '');
  const r = parseInt(h.substring(0, 2), 16) || 31;
  const g = parseInt(h.substring(2, 4), 16) || 122;
  const b = parseInt(h.substring(4, 6), 16) || 82;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};
