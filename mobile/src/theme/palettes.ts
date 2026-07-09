export type ThemeMode = 'light' | 'dark';
export type PaletteId = 'linear' | 'telegram' | 'notion' | 'obsidian';

export interface PaletteColors {
  background: string;
  surface: string;
  surfaceHover: string;
  surfaceActive: string;
  elevated: string;
  border: string;
  divider: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textInverse: string;
  accent: string;
  accentHover: string;
  accentMuted: string;
  onAccent: string;
  success: string;
  warning: string;
  danger: string;
  info: string;
  myMessageBubble: string;
  otherMessageBubble: string;
  myMessageText: string;
  otherMessageText: string;
  tabBar: string;
  tabBarIcon: string;
  tabBarIconActive: string;
  header: string;
  shadow: string;
}

export interface Palette {
  id: PaletteId;
  name: string;
  description: string;
  emoji: string;
  colors: { light: PaletteColors; dark: PaletteColors };
}

export const PALETTES: Palette[] = [
  {
    id: 'linear',
    name: 'Linear',
    description: 'Бизнес-премиум. Индиго-акцент, современный',
    emoji: '💎',
    colors: {
      light: {
        background: '#FFFFFF', surface: '#F9FAFB', surfaceHover: '#F3F4F6',
        surfaceActive: '#E5E7EB', elevated: '#FFFFFF',
        border: '#E5E7EB', divider: '#F3F4F6',
        textPrimary: '#111827', textSecondary: '#6B7280', textMuted: '#9CA3AF', textInverse: '#FFFFFF',
        accent: '#6366F1', accentHover: '#4F46E5', accentMuted: '#EEF2FF', onAccent: '#FFFFFF',
        success: '#10B981', warning: '#F59E0B', danger: '#EF4444', info: '#3B82F6',
        myMessageBubble: '#EEF2FF', otherMessageBubble: '#F3F4F6',
        myMessageText: '#312E81', otherMessageText: '#111827',
        tabBar: '#FFFFFF', tabBarIcon: '#9CA3AF', tabBarIconActive: '#6366F1',
        header: '#FFFFFF', shadow: '#000000',
      },
      dark: {
        background: '#0A0A0B', surface: '#17181B', surfaceHover: '#1F2024',
        surfaceActive: '#27282C', elevated: '#1F2024',
        border: '#27282C', divider: '#1F2024',
        textPrimary: '#F9FAFB', textSecondary: '#9CA3AF', textMuted: '#6B7280', textInverse: '#0A0A0B',
        accent: '#818CF8', accentHover: '#A5B4FC', accentMuted: '#1E1B4B', onAccent: '#FFFFFF',
        success: '#34D399', warning: '#FBBF24', danger: '#F87171', info: '#60A5FA',
        myMessageBubble: '#312E81', otherMessageBubble: '#1F2024',
        myMessageText: '#E0E7FF', otherMessageText: '#F9FAFB',
        tabBar: '#0A0A0B', tabBarIcon: '#6B7280', tabBarIconActive: '#818CF8',
        header: '#0A0A0B', shadow: '#000000',
      },
    },
  },
  {
    id: 'telegram',
    name: 'Telegram Premium',
    description: 'Классический стиль Telegram',
    emoji: '✈️',
    colors: {
      light: {
        background: '#FFFFFF', surface: '#FFFFFF', surfaceHover: '#F4F4F5',
        surfaceActive: '#E6E6E8', elevated: '#FFFFFF',
        border: '#E6E6E8', divider: '#F4F4F5',
        textPrimary: '#000000', textSecondary: '#707579', textMuted: '#A2ACB0', textInverse: '#FFFFFF',
        accent: '#3390EC', accentHover: '#2B7BC9', accentMuted: '#E7F2FB', onAccent: '#FFFFFF',
        success: '#4CAF50', warning: '#FF9800', danger: '#E53935', info: '#2196F3',
        myMessageBubble: '#EEFFDE', otherMessageBubble: '#FFFFFF',
        myMessageText: '#000000', otherMessageText: '#000000',
        tabBar: '#FFFFFF', tabBarIcon: '#A2ACB0', tabBarIconActive: '#3390EC',
        header: '#FFFFFF', shadow: '#000000',
      },
      dark: {
        background: '#17212B', surface: '#182533', surfaceHover: '#1F2C37',
        surfaceActive: '#2B5278', elevated: '#242F37',
        border: '#2C3744', divider: '#1F2C37',
        textPrimary: '#FFFFFF', textSecondary: '#AAB2BA', textMuted: '#6C7883', textInverse: '#17212B',
        accent: '#64A8F6', accentHover: '#8BBCE8', accentMuted: '#2B5278', onAccent: '#FFFFFF',
        success: '#4CAF50', warning: '#FF9800', danger: '#E53935', info: '#2196F3',
        myMessageBubble: '#2B5278', otherMessageBubble: '#182533',
        myMessageText: '#FFFFFF', otherMessageText: '#FFFFFF',
        tabBar: '#17212B', tabBarIcon: '#6C7883', tabBarIconActive: '#64A8F6',
        header: '#242F37', shadow: '#000000',
      },
    },
  },
  {
    id: 'notion',
    name: 'Notion',
    description: 'Тёплый "бумажный" стиль',
    emoji: '📝',
    colors: {
      light: {
        background: '#FFFFFF', surface: '#F7F6F3', surfaceHover: '#EFEFEF',
        surfaceActive: '#E7E6E3', elevated: '#FFFFFF',
        border: '#EBEBEA', divider: '#F7F6F3',
        textPrimary: '#37352F', textSecondary: '#6B6B6B', textMuted: '#9B9A97', textInverse: '#FFFFFF',
        accent: '#2F80ED', accentHover: '#1E6BD6', accentMuted: '#E7F0FB', onAccent: '#FFFFFF',
        success: '#0F7B0F', warning: '#CB7C0C', danger: '#E03E3E', info: '#2383E2',
        myMessageBubble: '#E7F0FB', otherMessageBubble: '#F7F6F3',
        myMessageText: '#37352F', otherMessageText: '#37352F',
        tabBar: '#FFFFFF', tabBarIcon: '#9B9A97', tabBarIconActive: '#2F80ED',
        header: '#FFFFFF', shadow: '#37352F',
      },
      dark: {
        background: '#191919', surface: '#202020', surfaceHover: '#2F2F2F',
        surfaceActive: '#373737', elevated: '#252525',
        border: '#2F2F2F', divider: '#202020',
        textPrimary: '#E7E6E3', textSecondary: '#A7A6A3', textMuted: '#6B6B6B', textInverse: '#191919',
        accent: '#6AB0F3', accentHover: '#8BC2F7', accentMuted: '#1C3757', onAccent: '#FFFFFF',
        success: '#6BCB77', warning: '#E8A838', danger: '#F07178', info: '#6AB0F3',
        myMessageBubble: '#1C3757', otherMessageBubble: '#252525',
        myMessageText: '#E7E6E3', otherMessageText: '#E7E6E3',
        tabBar: '#191919', tabBarIcon: '#6B6B6B', tabBarIconActive: '#6AB0F3',
        header: '#191919', shadow: '#000000',
      },
    },
  },
  {
    id: 'obsidian',
    name: 'Obsidian',
    description: 'Тёмный графитовый',
    emoji: '🌑',
    colors: {
      light: {
        background: '#FAFAFA', surface: '#FFFFFF', surfaceHover: '#F0F0F0',
        surfaceActive: '#E0E0E0', elevated: '#FFFFFF',
        border: '#DCDCDC', divider: '#F0F0F0',
        textPrimary: '#1C1C1C', textSecondary: '#666666', textMuted: '#999999', textInverse: '#FFFFFF',
        accent: '#7C5AFF', accentHover: '#6A4CE0', accentMuted: '#EDE7FB', onAccent: '#FFFFFF',
        success: '#4CAF50', warning: '#FFB300', danger: '#F44336', info: '#2196F3',
        myMessageBubble: '#EDE7FB', otherMessageBubble: '#F5F5F5',
        myMessageText: '#1C1C1C', otherMessageText: '#1C1C1C',
        tabBar: '#FFFFFF', tabBarIcon: '#999999', tabBarIconActive: '#7C5AFF',
        header: '#FFFFFF', shadow: '#000000',
      },
      dark: {
        background: '#1E1E1E', surface: '#2A2A2A', surfaceHover: '#333333',
        surfaceActive: '#3C3C3C', elevated: '#333333',
        border: '#3C3C3C', divider: '#2A2A2A',
        textPrimary: '#E8E8E8', textSecondary: '#A0A0A0', textMuted: '#6C6C6C', textInverse: '#1E1E1E',
        accent: '#A78BFA', accentHover: '#C4B5FD', accentMuted: '#3C2C5C', onAccent: '#FFFFFF',
        success: '#7CE38B', warning: '#FFD166', danger: '#FF7B7B', info: '#6CB4EE',
        myMessageBubble: '#3C2C5C', otherMessageBubble: '#2A2A2A',
        myMessageText: '#E8E8E8', otherMessageText: '#E8E8E8',
        tabBar: '#1E1E1E', tabBarIcon: '#6C6C6C', tabBarIconActive: '#A78BFA',
        header: '#2A2A2A', shadow: '#000000',
      },
    },
  },
];

export const getPalette = (id: PaletteId): Palette =>
  PALETTES.find(p => p.id === id) || PALETTES[0];
