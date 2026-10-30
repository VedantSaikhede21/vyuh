import type { ReactNode } from 'react';

/** Route change outside the player: a short fade (DESIGN §7 MO-05). Remounts per navigation. */
export default function Template({ children }: { children: ReactNode }) {
  return <div className="animate-fade-in-slow">{children}</div>;
}
