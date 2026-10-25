'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ClassSilhouette, PageHeader, Panel, PanelHeader } from '@/components/hud/primitives';
import { GroupBadge, REPRESENTATIVE_NOTE } from '@/components/library/library-entry';
import { RequireAuth } from '@/components/require-auth';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Table, Td, Th, Tr } from '@/components/ui/table';
import {
  GROUP_LABEL,
  LIBRARY,
  LINK_LABEL,
  filterLibrary,
  formatRcs,
  type LibraryGroup,
} from '@/lib/library';

// Threat recognition library (Phase 6C): one entry per contact class.

type Filter = LibraryGroup | 'ALL';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'THREAT', label: GROUP_LABEL.THREAT },
  { value: 'NON_THREAT', label: GROUP_LABEL.NON_THREAT },
  { value: 'FRIENDLY', label: GROUP_LABEL.FRIENDLY },
];

function Library() {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>('ALL');
  const rows = filterLibrary(filter);
  return (
    <div className="space-y-6">
      <PageHeader
        reference={`Threat library · ${LIBRARY.length} contact classes`}
        title="Threat library"
        context="What each contact looks like on radar, camera and RF, and what it is mistaken for. Open an entry for its ID cues."
      />
      <Panel>
        <PanelHeader title="Contact classes">
          <SegmentedControl
            label="Show"
            size="strip"
            items={FILTERS}
            value={filter}
            onChange={setFilter}
          />
        </PanelHeader>
        <Table data-testid="library-table">
          <thead>
            <tr>
              <Th className="w-12">
                <span className="sr-only">Silhouette</span>
              </Th>
              <Th className="w-full">Class</Th>
              <Th>Group</Th>
              <Th align="right">Size</Th>
              <Th align="right">RCS</Th>
              <Th align="right">Max speed</Th>
              <Th>Control links</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <Tr
                key={e.cls}
                interactive
                data-testid="library-row"
                onClick={(ev) => {
                  if ((ev.target as HTMLElement).closest('a')) return;
                  router.push(`/library/${e.cls}`);
                }}
              >
                <Td className="text-text-1">
                  <ClassSilhouette cls={e.cls} size={24} />
                </Td>
                <Td className="text-body">
                  <Link href={`/library/${e.cls}`} className="hover:underline">
                    {e.name}
                  </Link>
                </Td>
                <Td>
                  <GroupBadge entry={e} />
                </Td>
                <Td align="right" className="text-readout">
                  {e.sizeM}
                  <span className="ml-1 text-text-2">m</span>
                </Td>
                <Td align="right" className="text-readout">
                  {formatRcs(e.rcsM2)}
                  <span className="ml-1 text-text-2">m²</span>
                </Td>
                <Td align="right" className="text-readout">
                  {e.maxSpeedMps}
                  <span className="ml-1 text-text-2">m/s</span>
                </Td>
                <Td className="text-small text-text-body">
                  {e.links.map((l) => LINK_LABEL[l]).join(' · ')}
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Panel>
      <p className="text-small text-text-2">{REPRESENTATIVE_NOTE}</p>
    </div>
  );
}

export default function LibraryPage() {
  return (
    <RequireAuth>
      <Library />
    </RequireAuth>
  );
}
