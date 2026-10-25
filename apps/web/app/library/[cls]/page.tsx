'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ErrorState, PageHeader, Panel, PanelBody } from '@/components/hud/primitives';
import { LibraryEntryView } from '@/components/library/library-entry';
import { RequireAuth } from '@/components/require-auth';
import { isContactClass, libraryEntry } from '@/lib/library';

function Entry() {
  const raw = useParams<{ cls: string }>().cls ?? '';
  if (!isContactClass(raw)) {
    return (
      <div className="space-y-6">
        <PageHeader
          crumbs={[{ label: 'Threat library', href: '/library' }, { label: 'Unknown class' }]}
          title="No such entry"
        />
        <Panel>
          <ErrorState
            tone="neutral"
            title="This class is not in the threat library."
            action={
              <Link href="/library" className="text-label hover:text-text-1">
                Back to the threat library
              </Link>
            }
          >
            Check the link, or choose the class from the list.
          </ErrorState>
        </Panel>
      </div>
    );
  }
  const entry = libraryEntry(raw);
  return (
    <div className="space-y-6">
      <PageHeader
        crumbs={[{ label: 'Threat library', href: '/library' }, { label: entry.name }]}
        title={entry.name}
      />
      <Panel className="max-w-4xl">
        <PanelBody>
          <LibraryEntryView entry={entry} />
        </PanelBody>
      </Panel>
    </div>
  );
}

export default function LibraryEntryPage() {
  return (
    <RequireAuth>
      <Entry />
    </RequireAuth>
  );
}
