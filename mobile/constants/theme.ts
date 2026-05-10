import { Platform } from 'react-native';

export const theme = {
  colors: {
    brand: '#2563EB', // vivid blue
    brandDark: '#1D4ED8',
    brandSoft: '#E5EDFF',
    background: '#FFF7F0',
    surface: '#FFFFFF',
    surfaceMuted: '#FFF2E5',
    border: '#F3D2C1',
    text: '#1F2937',
    textMuted: '#6B7280',
    positive: '#16A34A',
    negative: '#EF4444',
    accent: '#F97316', // playful orange
    gold: '#F59E0B',
    purple: '#A855F7',
    dangerSoft: '#FFE5E5',
    successSoft: '#E7FCE5',
    warningSoft: '#FFF4D7',
  },
  radius: {
    sm: 12,
    md: 18,
    lg: 24,
    xl: 30,
  },
};

export const Colors = {
  light: {
    text: theme.colors.text,
    background: theme.colors.background,
    tint: theme.colors.brand,
    icon: theme.colors.textMuted,
    tabIconDefault: theme.colors.textMuted,
    tabIconSelected: theme.colors.brand,
  },
  dark: {
    text: theme.colors.text,
    background: theme.colors.background,
    tint: theme.colors.brand,
    icon: theme.colors.textMuted,
    tabIconDefault: theme.colors.textMuted,
    tabIconSelected: theme.colors.brand,
  },
};

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});

export const shadows = {
  card: Platform.select({
    ios: {
      shadowColor: '#0A3D86',
      shadowOpacity: 0.1,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
    },
    android: {
      elevation: 3,
    },
    default: {},
  }),
};
