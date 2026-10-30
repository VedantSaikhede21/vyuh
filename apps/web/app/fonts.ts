import localFont from 'next/font/local';

// Self-hosted, SIL OFL 1.1 (decisions 60, 164). Archivo (one variable file: wght
// 100-900, wdth 62-125, licence fonts/OFL-Archivo.txt) is every word; IBM Plex
// Mono (fonts/OFL.txt, subset by scripts/fonts) is HUD numbers, ids and seeds.

export const archivo = localFont({
  src: './fonts/Archivo-Variable.woff2',
  weight: '100 900',
  style: 'normal',
  variable: '--font-archivo',
  display: 'swap',
  declarations: [{ prop: 'font-stretch', value: '62% 125%' }],
});

export const plexMono = localFont({
  src: [
    { path: './fonts/IBMPlexMono-Regular.woff2', weight: '400', style: 'normal' },
    { path: './fonts/IBMPlexMono-Medium.woff2', weight: '500', style: 'normal' },
  ],
  variable: '--font-plex-mono',
  display: 'swap',
  preload: false,
});
