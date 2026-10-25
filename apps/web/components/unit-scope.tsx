'use client';

import type { UnitSummary } from '@vyuh/shared';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Select } from '@/components/ui/select';
import { api } from '@/lib/api';
import { useApiData } from '@/lib/use-api-data';

/** The units list and the chosen unit (?unit=, else the first), for the unit views. */
export function useUnitScope(): {
  units: UnitSummary[] | null;
  unitId: string | null;
  unit: UnitSummary | null;
  error: unknown;
  reload: () => void;
} {
  const params = useSearchParams();
  const { data, error, reload } = useApiData('units', (signal) => api.listUnits(signal));
  const units = data?.items ?? null;
  const unitId = params.get('unit') ?? units?.[0]?.id ?? null;
  return { units, unitId, unit: units?.find((u) => u.id === unitId) ?? null, error, reload };
}

/** Unit chooser for the page header; hidden with a single unit. */
export function UnitSelect({
  units,
  unitId,
  onChange,
}: {
  units: readonly UnitSummary[] | null;
  unitId: string | null;
  onChange?: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  if (!units || units.length < 2) return null;
  return (
    <label className="flex items-center gap-2">
      <span className="text-label">Unit</span>
      <Select
        className="h-7 w-auto py-0 pr-7 text-small"
        value={unitId ?? ''}
        onChange={(e) => {
          onChange?.();
          router.replace(`${pathname}?unit=${e.target.value}`, { scroll: false });
        }}
      >
        {units.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
          </option>
        ))}
      </Select>
    </label>
  );
}
