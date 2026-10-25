'use client';

import type { NoticeListResponse } from '@vyuh/shared';
import Link from 'next/link';
import { useEffect, useRef } from 'react';
import {
  EmptyState,
  ErrorState,
  PageHeader,
  Panel,
  PanelHeader,
  SkeletonRows,
} from '@/components/hud/primitives';
import { RequireAuth } from '@/components/require-auth';
import { api } from '@/lib/api';
import { NOTICE_KIND_LABEL, useNoticeStore } from '@/lib/notices';
import { formatCount, formatDateTime } from '@/lib/strings';
import { useApiData } from '@/lib/use-api-data';
import { cn } from '@/lib/utils';

// Notices (Phase 6C): assignments, instructor remarks, sign-offs and library
// updates. Opening the page marks them read; this visit still shows which were new.

function NoticeList({ data }: { data: NoticeListResponse }) {
  if (data.items.length === 0) {
    return (
      <EmptyState title="No notices yet.">
        Assignments, instructor remarks and sign-offs appear here.
      </EmptyState>
    );
  }
  return (
    <ol data-testid="notice-list">
      {data.items.map((n) => (
        <li
          key={n.id}
          data-testid="notice"
          data-unread={n.unread || undefined}
          className={cn(
            'grid grid-cols-[9rem_minmax(0,1fr)_auto] items-baseline gap-x-4 border-t border-l-2 border-t-line-1 px-3 py-2.5 first:border-t-0',
            n.unread ? 'border-l-select bg-bg-2' : 'border-l-transparent',
          )}
        >
          <span className="text-label">
            {NOTICE_KIND_LABEL[n.kind]}
            {n.unread && <span className="ml-1.5 text-text-1">· New</span>}
          </span>
          <div className="min-w-0 space-y-0.5">
            {n.href ? (
              <Link
                href={n.href}
                className="block text-body text-text-1 [overflow-wrap:anywhere] hover:underline"
              >
                {n.title}
              </Link>
            ) : (
              <p className="text-body text-text-1 [overflow-wrap:anywhere]">{n.title}</p>
            )}
            {n.body && (
              <p className="max-w-prose-ui text-small text-text-body [overflow-wrap:anywhere]">
                {n.body}
              </p>
            )}
          </div>
          <time dateTime={n.createdAt} className="text-readout whitespace-nowrap text-text-2">
            {formatDateTime(n.createdAt)}
          </time>
        </li>
      ))}
    </ol>
  );
}

function Notices() {
  const { data, error, reload } = useApiData('notices', (signal) => api.notices(signal));
  const markSeen = useNoticeStore((s) => s.markSeen);
  const marked = useRef(false);
  useEffect(() => {
    if (!data || marked.current || data.unreadCount === 0) return;
    marked.current = true;
    void markSeen().catch(() => undefined);
  }, [data, markSeen]);
  return (
    <div className="space-y-6">
      <PageHeader
        reference="Notices"
        title="Notices"
        context="Assignments, remarks from your instructor, sign-offs and threat-library updates."
        {...(data
          ? {
              facts: [
                {
                  label: 'Unread',
                  value: formatCount(data.unreadCount),
                  muted: data.unreadCount === 0,
                },
                { label: 'Shown', value: data.items.length },
              ],
            }
          : {})}
      />
      <Panel className="max-w-4xl">
        <PanelHeader title="Newest first" />
        {error !== null ? (
          <ErrorState error={error} subject="notices" onRetry={reload} />
        ) : !data ? (
          <SkeletonRows rows={4} label="Loading notices" />
        ) : (
          <NoticeList data={data} />
        )}
      </Panel>
    </div>
  );
}

export default function NoticesPage() {
  return (
    <RequireAuth>
      <Notices />
    </RequireAuth>
  );
}
