'use client';

import type { SessionRemark } from '@vyuh/shared';
import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { FIELD_CLASS, FieldError } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { isStaff } from '@/lib/nav';
import { formatDateTime } from '@/lib/strings';
import { cn } from '@/lib/utils';

// Instructor remarks on a session (Phase 6C): everyone with the AAR reads them;
// instructors and admins add one, which reaches the trainee as a notice.

export const REMARK_MAX = 500;

export function Remarks({
  sessionId,
  initial,
  compact = false,
}: {
  sessionId: string;
  initial: readonly SessionRemark[];
  compact?: boolean;
}) {
  const { user } = useAuth();
  const staff = isStaff(user?.role);
  const [items, setItems] = useState<SessionRemark[]>([...initial]);
  const [text, setText] = useState('');
  const [state, setState] = useState<{ kind: 'idle' | 'busy' } | { kind: 'error'; text: string }>({
    kind: 'idle',
  });
  const id = useId();
  const over = text.length > REMARK_MAX;
  const blank = text.trim().length === 0;

  const send = () => {
    setState({ kind: 'busy' });
    api
      .addRemark(sessionId, text.trim())
      .then((r) => {
        setItems((xs) => [...xs, r]);
        setText('');
        setState({ kind: 'idle' });
      })
      .catch((err: unknown) =>
        setState({
          kind: 'error',
          text: err instanceof Error ? err.message : 'The remark was not saved.',
        }),
      );
  };

  return (
    <div className={cn('space-y-3', compact ? 'p-2' : '')} data-testid="remarks">
      {items.length === 0 ? (
        <p className="text-small text-text-2">
          {staff
            ? 'No remarks yet. A remark reaches the trainee as a notice.'
            : 'No remarks from your instructor on this session.'}
        </p>
      ) : (
        <ol className="space-y-2">
          {items.map((r) => (
            <li key={r.id} className="border-l-2 border-line-2 pl-2" data-testid="remark">
              <p className="text-meta">
                {r.authorName} · {formatDateTime(r.createdAt)}
              </p>
              <p className="max-w-prose-ui whitespace-pre-line text-body text-text-body [overflow-wrap:anywhere]">
                {r.body}
              </p>
            </li>
          ))}
        </ol>
      )}
      {staff && (
        <form
          className="space-y-2 border-t border-line-1 pt-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!blank && !over) send();
          }}
        >
          <Label htmlFor={`${id}-t`}>Add a remark</Label>
          <textarea
            id={`${id}-t`}
            rows={compact ? 3 : 4}
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-invalid={over || undefined}
            aria-describedby={`${id}-n ${id}-e`}
            className={cn(FIELD_CLASS, 'h-auto resize-y py-2')}
            placeholder="What to keep doing, what to change next time."
            data-testid="remark-input"
          />
          <div className="flex items-center justify-between gap-2">
            <span id={`${id}-n`} className={cn('text-readout', over ? 'text-crit' : 'text-text-2')}>
              {text.length} / {REMARK_MAX}
            </span>
            <Button
              type="submit"
              size="sm"
              variant="secondary"
              disabled={blank || over}
              loading={state.kind === 'busy'}
              title={blank ? 'Write a remark first' : over ? 'At most 500 characters' : undefined}
              data-testid="remark-send"
            >
              {state.kind === 'busy' ? 'Saving…' : 'Save remark'}
            </Button>
          </div>
          <FieldError id={`${id}-e`}>
            {over
              ? `At most ${REMARK_MAX} characters.`
              : state.kind === 'error'
                ? `Not saved: ${state.text}`
                : null}
          </FieldError>
        </form>
      )}
    </div>
  );
}
