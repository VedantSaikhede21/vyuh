// The product's own pictures (DESIGN §3.8): stills of each scenario's place from
// scripts/render-stills.ts. Generated scenarios have no still of their own, so
// they use their preset's.

const PRESET_STILL: Record<string, string> = {
  JK_MOUNTAIN: 'S05',
  PUNJAB_PLAINS: 'S14',
  URBAN_GENERIC: 'S06',
};
const DEFAULT_STILL = 'S14';
const LIBRARY = /^S(0[1-9]|1[0-5])$/;

export interface RenderSrc {
  w640: string;
  w1920: string;
}

export function renderFor(
  code: string | null | undefined,
  preset?: string | null | undefined,
): RenderSrc {
  const id =
    code && LIBRARY.test(code) ? code : ((preset && PRESET_STILL[preset]) ?? DEFAULT_STILL);
  return {
    w640: `/renders/${id}-establishing-640.jpg`,
    w1920: `/renders/${id}-establishing-1920.jpg`,
  };
}
