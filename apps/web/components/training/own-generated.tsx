'use client';

import type { ScenarioListItem } from '@vyuh/shared';
import { useCallback, useEffect, useState } from 'react';
import { Panel, PanelHeader, Skeleton, StatusNotice } from '@/components/hud/primitives';
import { api } from '@/lib/api';
import { ScenarioRowsTable, useTimeOfDay } from './scenario-table';

// "My generated" (Phase 4a Step 1): the trainee's own generated scenarios, newest
// first, under the library table. Generated runs never appear in the library list.

export function OwnGeneratedTable() {
  const [items, setItems] = useState<ScenarioListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchList = useCallback((signal?: AbortSignal) => {
    api
      .listOwnGenerated(signal)
      .then((r) => setItems(r.items))
      .catch((err: unknown) => {
        if (!signal?.aborted) setError(err instanceof Error ? err.message : 'Network error');
      });
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    fetchList(ctrl.signal);
    return () => ctrl.abort();
  }, [fetchList]);

  const { timeOf, label } = useTimeOfDay(items);

  return (
    <Panel data-testid="own-generated">
      <PanelHeader title="My generated">
        {items && <span className="text-label">{items.length}</span>}
      </PanelHeader>
      {error && (
        <StatusNotice
          tone="error"
          title="Could not load your generated scenarios."
          onRetry={() => {
            setError(null);
            setItems(null);
            fetchList();
          }}
        >
          {error}. Check that the API is running, then retry.
        </StatusNotice>
      )}
      {items === null && !error && <Skeleton label="Loading your generated scenarios" />}
      {items?.length === 0 && (
        <StatusNotice title="No generated scenarios yet.">
          Use Generate to create one; it is listed here afterwards.
        </StatusNotice>
      )}
      {items && items.length > 0 && (
        <ScenarioRowsTable
          rows={items}
          ariaLabel="My generated scenarios"
          testId="own-generated-table"
          timeOf={timeOf}
          label={label}
        />
      )}
    </Panel>
  );
}
