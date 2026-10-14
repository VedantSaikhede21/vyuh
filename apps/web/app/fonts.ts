import localFont from 'next/font/local';

// IBM Plex, self-hosted (decision 60): committed woff2 files from IBM's npm
// packages (@ibm/plex-sans 1.1.0, @ibm/plex-sans-condensed 2.0.0,
// @ibm/plex-mono 2.5.0), SIL OFL 1.1 — see fonts/OFL.txt. Weights are only
// those the DESIGN §4 scale uses.

export const plexSans = localFont({
  src: [
    { path: './fonts/IBMPlexSans-Regular.woff2', weight: '400', style: 'normal' },
    { path: './fonts/IBMPlexSans-SemiBold.woff2', weight: '600', style: 'normal' },
  ],
  variable: '--font-plex-sans',
  display: 'swap',
});

export const plexCondensed = localFont({
  src: [
    { path: './fonts/IBMPlexSansCondensed-Medium.woff2', weight: '500', style: 'normal' },
    { path: './fonts/IBMPlexSansCondensed-SemiBold.woff2', weight: '600', style: 'normal' },
  ],
  variable: '--font-plex-condensed',
  display: 'swap',
});

export const plexMono = localFont({
  src: [
    { path: './fonts/IBMPlexMono-Regular.woff2', weight: '400', style: 'normal' },
    { path: './fonts/IBMPlexMono-Medium.woff2', weight: '500', style: 'normal' },
  ],
  variable: '--font-plex-mono',
  display: 'swap',
});
