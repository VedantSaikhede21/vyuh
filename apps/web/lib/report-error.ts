// Client error reports (system plan S9): no third-party service. One report per
// message per page load, trimmed, with no names or e-mails; failure to report is
// ignored, because this runs when something is already wrong.

const seen = new Set<string>();
const MAX_MESSAGE = 500;
const MAX_STACK = 2000;

export function shouldReport(message: string): boolean {
  if (seen.has(message)) return false;
  seen.add(message);
  return true;
}

export function reportError(error: unknown, route?: string): void {
  try {
    const err = error instanceof Error ? error : new Error(String(error));
    if (!shouldReport(err.message)) return;
    const base = process.env.NEXT_PUBLIC_API_URL;
    if (!base) return;
    void fetch(`${base}/client-errors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({
        route: (route ?? window.location.pathname).slice(0, 200),
        message: err.message.slice(0, MAX_MESSAGE),
        stack: (err.stack ?? '').slice(0, MAX_STACK),
        userAgent: navigator.userAgent.slice(0, 200),
        webBuild: process.env.NEXT_PUBLIC_WEB_BUILD ?? 'dev',
        simVersion: '',
      }),
    }).catch(() => undefined);
  } catch {
    // Reporting must never add a second failure.
  }
}

/** Report uncaught errors for the page's life; returns the uninstall. */
export function installErrorReporting(): () => void {
  const onError = (e: ErrorEvent) => reportError(e.error ?? e.message);
  const onRejection = (e: PromiseRejectionEvent) => reportError(e.reason);
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);
  return () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
  };
}
