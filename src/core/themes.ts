export interface ThemeColors {
  bg: string | null; // null = 透明
  strings: string;
  frets: string;
  bars: string;
  ruler: string;
  trackName: string;
  accent: string;
  measureNum: string;
  section: string;
  wash: string; // 当前小节高亮
  beatBand: string; // 当前拍高亮
  stem: string;
}

export type ThemeMode = 'light' | 'dark' | 'transparent';

function hexToRgba(hex: string, alpha: number): string {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

export function resolveTheme(mode: ThemeMode, foreground: string): ThemeColors {
  if (mode === 'light') {
    return {
      bg: '#ffffff',
      strings: '#8f959e',
      frets: '#1a1c20',
      bars: '#5c636d',
      ruler: '#6b7280',
      trackName: '#4b5563',
      accent: '#2e6fd8',
      measureNum: '#d43a3a',
      section: '#274a80',
      wash: 'rgba(66,133,244,0.12)',
      beatBand: 'rgba(66,133,244,0.20)',
      stem: '#1a1c20',
    };
  }
  if (mode === 'dark') {
    return {
      bg: '#0c0e12',
      strings: '#414855',
      frets: '#f3f5f8',
      bars: '#69707c',
      ruler: '#98a0ac',
      trackName: '#b6bdca',
      accent: '#5b9bff',
      measureNum: '#ff7b7b',
      section: '#9db8e8',
      wash: 'rgba(91,155,255,0.14)',
      beatBand: 'rgba(91,155,255,0.22)',
      stem: '#f3f5f8',
    };
  }
  return {
    bg: null,
    strings: hexToRgba(foreground, 0.55),
    frets: foreground,
    bars: hexToRgba(foreground, 0.8),
    ruler: hexToRgba(foreground, 0.85),
    trackName: hexToRgba(foreground, 0.9),
    accent: '#3b82f6',
    measureNum: hexToRgba(foreground, 0.95),
    section: hexToRgba(foreground, 0.92),
    wash: 'rgba(59,130,246,0.14)',
    beatBand: 'rgba(59,130,246,0.22)',
    stem: foreground,
  };
}
