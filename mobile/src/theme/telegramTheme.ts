export const TelegramColors = {
  light: {
    background: '#FFFFFF',
    secondaryBackground: '#F4F4F5',
    divider: '#E6E6E8',
    primaryText: '#000000',
    secondaryText: '#707579',
    accent: '#3390EC',
    unreadBadge: '#3390EC',
    success: '#4CAF50',
    myMessageBubble: '#D9FDD3',
    otherMessageBubble: '#FFFFFF',
  },
  dark: {
    background: '#18222D',
    secondaryBackground: '#212D3B',
    divider: '#2C3744',
    primaryText: '#FFFFFF',
    secondaryText: '#AAB2BA',
    accent: '#64A8F6',
    unreadBadge: '#64A8F6',
    success: '#4CAF50',
    myMessageBubble: '#2B5278',
    otherMessageBubble: '#182533',
  },
};

export const TelegramSizes = {
  baseUnit: 8,
  avatar: { default: 40, chatList: 40, chat: 36, profile: 96 },
  chatRowHeight: 72,
  headerHeight: 56,
  inputHeight: 52,
  messageBubbleMaxWidth: '78%',
  messageBubbleRadius: 18,
  unreadBadgeSize: 22,
  pinnedBarHeight: 48,
  icon: { small: 16, medium: 20, default: 24, large: 28 },
};

export const TelegramFonts = {
  family: 'Inter',
  fallback: 'System',
  sizes: { title: 20, name: 16, message: 14, time: 12, status: 12, button: 16, profileName: 24 },
  weights: { regular: '400', semiBold: '600', bold: '700' },
};
