import { useColorScheme } from 'react-native';
import type { ClaimStatus } from '@claims/shared';

const palette = {
  light: {
    background: '#F5F6F8',
    surface: '#FFFFFF',
    surfaceMuted: '#EEF1F5',
    border: '#DDE2EA',
    text: '#111827',
    textMuted: '#5B6474',
    primary: '#0B5FFF',
    primaryText: '#FFFFFF',
    danger: '#C62828',
    success: '#1B7F3B',
    warning: '#A15C00',
    banner: '#FFF4E0',
  },
  dark: {
    background: '#0E1116',
    surface: '#171B22',
    surfaceMuted: '#1F2530',
    border: '#2B3240',
    text: '#F3F5F8',
    textMuted: '#A3ACBA',
    primary: '#5B9BFF',
    primaryText: '#0E1116',
    danger: '#FF6B6B',
    success: '#4CC77A',
    warning: '#F2B04C',
    banner: '#3A2C12',
  },
} as const;

export type ThemeColors = { [K in keyof (typeof palette)['light']]: string };

const statusColors: Record<'light' | 'dark', Record<ClaimStatus, { bg: string; fg: string }>> = {
  light: {
    submitted: { bg: '#E6EEFF', fg: '#1E40AF' },
    in_review: { bg: '#EFE7FF', fg: '#5B21B6' },
    more_info_needed: { bg: '#FFF1D6', fg: '#8A4B00' },
    approved: { bg: '#DDF5E6', fg: '#14632F' },
    rejected: { bg: '#FDE2E2', fg: '#A01818' },
    paid: { bg: '#D9F2F2', fg: '#0B5F5F' },
  },
  dark: {
    submitted: { bg: '#1D2A4D', fg: '#A8C1FF' },
    in_review: { bg: '#2C2147', fg: '#CDB6FF' },
    more_info_needed: { bg: '#3D2B0C', fg: '#FFCB78' },
    approved: { bg: '#123222', fg: '#8BE0AA' },
    rejected: { bg: '#3D1616', fg: '#FF9C9C' },
    paid: { bg: '#0F3333', fg: '#86DEDE' },
  },
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 6, md: 10, lg: 16, pill: 999 } as const;

export function useTheme() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  return { scheme, colors: palette[scheme] as ThemeColors, status: statusColors[scheme] };
}
