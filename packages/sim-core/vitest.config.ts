import { defineConfig } from 'vitest/config';

// At most 4 workers: each one decodes and indexes the file presets (URBAN_GENERIC
// has 13.6 k footprints), and one worker per core exhausted a 6 GB laptop (paging
// turned the suite into timeouts). CI runners have 4 cores anyway.
// 20 s per test: the preset-heavy tests take 1–6 s on an idle machine and could
// pass the 5 s default when dev servers and Playwright share it (decision 154).
// The ceiling only catches hangs; it does not hide slow tests (see the durations).
export default defineConfig({
  test: { maxWorkers: 4, testTimeout: 20_000 },
});
