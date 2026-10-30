'use client';

import { useEffect } from 'react';
import { env } from '@/lib/env';
import { installErrorReporting } from '@/lib/report-error';

/**
 * Page-wide effects with no UI: report uncaught errors (S9) and wake the API on
 * the first page, so a judge's first click doesn't wait out a cold start (S5).
 */
export function AppEffects() {
  useEffect(() => installErrorReporting(), []);
  useEffect(() => {
    void fetch(`${env.apiUrl}/health`).catch(() => undefined);
  }, []);
  return null;
}
