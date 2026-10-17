import { defineConfig } from 'vitest/config';

// At most 4 workers: each one decodes and indexes the file presets (URBAN_GENERIC
// has 13.6 k footprints), and one worker per core exhausted a 6 GB laptop (paging
// turned the suite into timeouts). CI runners have 4 cores anyway.
export default defineConfig({
  test: { maxWorkers: 4 },
});
