import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { AppHeader, SkipLink } from '@/components/app-header';
import { AuthProvider } from '@/lib/auth';
import { MotionAttribute } from '@/lib/settings';
import { UI } from '@/lib/theme/scene-colours';
import { archivo, plexMono } from './fonts';
import './globals.css';

const TITLE = 'VYUH — Counter-Drone Threat Trainer';
const DESCRIPTION =
  'Counter-drone decision training on real terrain, in a browser. SIH 2026 problem statement 26247, Ministry of Defence.';

// Judges may paste the link into a chat: title and description travel with it (audit P2-7).
export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: { title: TITLE, description: DESCRIPTION, type: 'website', siteName: 'VYUH' },
  twitter: { card: 'summary', title: TITLE, description: DESCRIPTION },
};

export const viewport: Viewport = { themeColor: UI.bg0, colorScheme: 'dark' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`dark ${archivo.variable} ${plexMono.variable}`}
    >
      <body className="min-h-screen overflow-x-clip">
        <SkipLink />
        <MotionAttribute />
        <AuthProvider>
          <AppHeader />
          <main
            id="main"
            tabIndex={-1}
            className="mx-auto w-full max-w-[1280px] px-6 py-6 outline-none min-[1600px]:max-w-[1440px] min-[1600px]:px-12"
          >
            {children}
          </main>
        </AuthProvider>
      </body>
    </html>
  );
}
