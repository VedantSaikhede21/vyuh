'use client';

import type { ContactClass } from '@vyuh/shared';
import { useState } from 'react';
import { Dialog } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { LIBRARY, isContactClass, libraryEntry } from '@/lib/library';
import { LibraryEntryView } from './library-entry';

/**
 * A threat-library entry over the current screen (player track list, AAR rows),
 * so looking a class up never leaves the console; any class can be chosen from
 * the list. "Open full entry" opens the page in a new tab for the same reason.
 */
export function LibraryDialog({
  open,
  cls,
  onClose,
}: {
  open: boolean;
  /** The class to show first; null when the track is not classified yet. */
  cls: ContactClass | null;
  onClose: () => void;
}) {
  const [shown, setShown] = useState<ContactClass | null>(cls);
  // Reopening (or a new class) starts from that class; browsing inside keeps its pick.
  const [from, setFrom] = useState({ open, cls });
  if (from.open !== open || from.cls !== cls) {
    setFrom({ open, cls });
    if (open) setShown(cls);
  }
  const entry = shown ? libraryEntry(shown) : null;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={entry ? `Threat library · ${entry.name}` : 'Threat library'}
      testId="library-dialog"
      className="w-[min(42rem,calc(100vw-2rem))]"
      footer={
        entry && (
          <a
            href={`/library/${entry.cls}`}
            target="_blank"
            rel="noreferrer"
            className="text-label underline decoration-line-2 underline-offset-2 hover:text-text-1"
          >
            Open full entry (new tab)
          </a>
        )
      }
    >
      <div className="mb-4 flex items-center gap-3">
        <Label htmlFor="library-class">Class</Label>
        <Select
          id="library-class"
          value={shown ?? ''}
          onChange={(e) => setShown(isContactClass(e.target.value) ? e.target.value : null)}
          className="w-64"
        >
          {!shown && <option value="">Choose a class</option>}
          {LIBRARY.map((e) => (
            <option key={e.cls} value={e.cls}>
              {e.name}
            </option>
          ))}
        </Select>
      </div>
      {entry ? (
        <LibraryEntryView entry={entry} onPick={setShown} />
      ) : (
        <p className="text-body text-text-body">
          This track is not classified yet. Choose a class to compare what you see with its ID cues.
        </p>
      )}
    </Dialog>
  );
}
