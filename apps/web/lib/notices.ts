'use client';

import type { NoticeKind } from '@vyuh/shared';
import { create } from 'zustand';

// Unread notices count for the top bar (DESIGN §11.0). Refreshed on navigation
// and set to 0 when the notices page marks everything seen.

interface NoticeStore {
  unread: number | null;
  refresh: () => void;
  markSeen: () => Promise<void>;
}

export const useNoticeStore = create<NoticeStore>((set) => ({
  unread: null,
  refresh: () => {
    // The API client loads lazily so the top bar does not carry zod on public pages.
    import('@/lib/api')
      .then(({ api }) => api.noticeCount())
      .then((r) => set({ unread: r.unreadCount }))
      .catch(() => undefined); // the count is a convenience: keep the last value
  },
  markSeen: async () => {
    const { api } = await import('@/lib/api');
    await api.markNoticesSeen();
    set({ unread: 0 });
  },
}));

export const NOTICE_KIND_LABEL: Record<NoticeKind, string> = {
  ASSIGNMENT: 'Assignment',
  REMARK: 'Remark',
  SIGNOFF: 'Sign-off',
  LIBRARY: 'Library',
};

/** "12" up to 99, then "99+" so the top bar never grows. */
export const unreadLabel = (n: number): string => (n > 99 ? '99+' : String(n));
