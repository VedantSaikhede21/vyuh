'use client';

import { archivo, plexMono } from './fonts';
import './globals.css';

// Last-resort boundary when the root layout itself fails: replaces the whole
// document, so it carries its own <html> and fonts. No stack trace (audit P1-7).
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html
      lang="en"
      className={`dark ${archivo.variable} ${plexMono.variable}`}
    >
      <body className="min-h-screen">
        <main className="mx-auto w-full max-w-md space-y-3 px-6 py-16">
          <p className="text-meta">VYUH · Error</p>
          <h1 className="text-h1">The trainer failed to start</h1>
          <p className="text-body text-text-body">
            Reload the page. If it repeats, tell your instructor
            {error.digest ? ` and quote reference ${error.digest}` : ''}.
          </p>
          <button
            type="button"
            onClick={reset}
            className="h-9 rounded-sm border border-line-2 bg-bg-2 px-4 text-panel-title text-text-1 hover:bg-bg-3"
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
