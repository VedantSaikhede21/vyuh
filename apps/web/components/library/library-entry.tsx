import type { ContactClass } from '@vyuh/shared';
import Link from 'next/link';
import { ClassSilhouette, FactStrip } from '@/components/hud/primitives';
import { Badge } from '@/components/ui/badge';
import {
  GROUP_LABEL,
  LINK_LABEL,
  formatRcs,
  libraryEntry,
  type LibraryEntry,
} from '@/lib/library';
import { cn } from '@/lib/utils';

export const REPRESENTATIVE_NOTE =
  'Representative values for training, from public commercial-drone figures and textbook physics. Not product specifications.';

/** Group chip: wording, never colour alone (friendly is not drawn in affiliation colour). */
export function GroupBadge({ entry }: { entry: LibraryEntry }) {
  return (
    <Badge tone={entry.group === 'THREAT' ? 'strong' : 'default'} data-testid="library-group">
      {GROUP_LABEL[entry.group]}
    </Badge>
  );
}

/**
 * One threat-library entry. `onPick` (dialog) switches the entry in place for
 * "often confused with"; without it the names link to their pages.
 */
export function LibraryEntryView({
  entry,
  onPick,
  className,
}: {
  entry: LibraryEntry;
  onPick?: (cls: ContactClass) => void;
  className?: string;
}) {
  return (
    <article className={cn('space-y-4', className)} data-testid="library-entry">
      <div className="flex items-start gap-4">
        <div className="grid size-20 shrink-0 place-items-center border border-line-1 bg-bg-0 text-text-1">
          <ClassSilhouette cls={entry.cls} size={56} />
        </div>
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <GroupBadge entry={entry} />
            <span className="text-meta">{entry.cls}</span>
          </div>
          <p className="max-w-prose-ui text-body text-text-body">{entry.summary}</p>
        </div>
      </div>
      <FactStrip
        facts={[
          { label: 'Size', value: entry.sizeM, unit: 'm' },
          { label: 'RCS', value: formatRcs(entry.rcsM2), unit: 'm²' },
          { label: 'Max speed', value: entry.maxSpeedMps, unit: 'm/s' },
        ]}
      />
      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
        <dt className="text-label">Control links</dt>
        <dd className="text-body text-text-1">
          {entry.links.map((l) => LINK_LABEL[l]).join(' · ')}
        </dd>
        <dt className="text-label">RF behaviour</dt>
        <dd className="max-w-prose-ui text-body text-text-body">{entry.rf}</dd>
        <dt className="text-label">ID cues</dt>
        <dd>
          <ul className="max-w-prose-ui space-y-1">
            {entry.cues.map((c) => (
              <li key={c} className="flex gap-2 text-body text-text-body">
                <span aria-hidden className="text-text-2">
                  –
                </span>
                {c}
              </li>
            ))}
          </ul>
        </dd>
        <dt className="text-label">Often confused with</dt>
        <dd className="flex flex-wrap gap-x-4 gap-y-1">
          {entry.confusedWith.map((c) => {
            const other = libraryEntry(c);
            const cls =
              'text-body text-text-1 underline decoration-line-2 underline-offset-2 transition-colors duration-150 ease-ui hover:decoration-text-2';
            return onPick ? (
              <button key={c} type="button" className={cls} onClick={() => onPick(c)}>
                {other.name}
              </button>
            ) : (
              <Link key={c} href={`/library/${c}`} className={cls}>
                {other.name}
              </Link>
            );
          })}
        </dd>
      </dl>
      <p className="text-small text-text-2">{REPRESENTATIVE_NOTE}</p>
    </article>
  );
}
