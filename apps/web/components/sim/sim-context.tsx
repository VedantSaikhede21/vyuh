'use client';

import { createContext, useContext } from 'react';
import type { SimRuntime } from '@/lib/sim/runtime';

export const SimRuntimeContext = createContext<SimRuntime | null>(null);

export function useSimRuntime(): SimRuntime {
  const rt = useContext(SimRuntimeContext);
  if (!rt) throw new Error('useSimRuntime must be used inside SimRuntimeContext');
  return rt;
}
