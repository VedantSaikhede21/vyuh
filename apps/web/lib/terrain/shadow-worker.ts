import { sunShadowMask, type ShadowInput } from './shadow';

// One job per view start (0.3-0.8 s), off the main thread.
self.onmessage = (e: MessageEvent<ShadowInput>) => {
  const mask = sunShadowMask(e.data);
  (self as unknown as Worker).postMessage(mask, [mask.buffer]);
};
