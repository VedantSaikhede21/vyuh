// Scenario builder (audit P1-17): errors shown next to their field.

/** Inline field errors the server's checks cannot give (they see only a valid request). */
export function fieldErrors(f: { name: string; swarmSize: string }): {
  name: string | null;
  swarmSize: string | null;
} {
  const swarm = f.swarmSize.trim();
  const n = Number(swarm);
  return {
    name: f.name.trim() ? null : 'Give the scenario a name.',
    swarmSize:
      swarm === '' || (Number.isInteger(n) && n >= 1 && n <= 50)
        ? null
        : 'A whole number from 1 to 50, or empty for Auto.',
  };
}
