/** Split simple briefing markdown into `## Heading` sections. */
export function sections(md: string): { title: string; lines: string[] }[] {
  const out: { title: string; lines: string[] }[] = [];
  for (const line of md.split('\n')) {
    if (line.startsWith('## ')) out.push({ title: line.slice(3).trim(), lines: [] });
    else if (line.trim()) {
      let last = out.at(-1);
      if (last === undefined) {
        last = { title: '', lines: [] };
        out.push(last);
      }
      last.lines.push(line);
    }
  }
  return out;
}
