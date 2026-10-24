import { Skeleton } from '@/components/hud/primitives';

// Route loading state (DESIGN §9): labelled, never a bare spinner.
export default function Loading() {
  return <Skeleton label="Loading after-action review" className="px-0 py-6" />;
}
