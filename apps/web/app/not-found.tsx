import Link from 'next/link';
import { ErrorState, PageHeader } from '@/components/hud/primitives';
import { Button } from '@/components/ui/button';

// System-styled 404 (audit P1-7): neutral, says what to do next.
export default function NotFound() {
  return (
    <div className="space-y-6">
      <PageHeader reference="Error 404" title="Page not found" />
      <ErrorState
        title="There is no page at this address."
        tone="neutral"
        action={
          <Button asChild variant="secondary" size="sm">
            <Link href="/train">Open training</Link>
          </Button>
        }
      >
        The link may be mistyped or out of date. Training lists every scenario; after-action reviews
        open from your results.
      </ErrorState>
    </div>
  );
}
