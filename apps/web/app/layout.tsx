import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { AppHeader } from '@/components/app-header';
import { AuthProvider } from '@/lib/auth';
import { UI } from '@/lib/theme/scene-colours';
import { plexCondensed, plexMono, plexSans } from './fonts';
import './globals.css';

export const metadata: Metadata = {
  title: 'VYUH — Counter-Drone Threat Trainer',
  description: 'Browser-based drone and counter-drone threat simulation trainer.',
};

export const viewport: Viewport = { themeColor: UI.bg0, colorScheme: 'dark' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`dark ${plexSans.variable} ${plexCondensed.variable} ${plexMono.variable}`}
    >
      <body className="min-h-screen">
        <AuthProvider>
          <AppHeader />
          <main className="mx-auto w-full max-w-6xl px-4 py-6">{children}</main>
        </AuthProvider>
      </body>
    </html>
  );
}
