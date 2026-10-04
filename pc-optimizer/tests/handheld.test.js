import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run } from './handheld-validation.mjs';
test('handheld predictions match published benchmarks (mean abs error < 12%)', () => {
  const { mae, rows } = run(false);
  assert.ok(mae < 0.12, `mean abs error ${(mae * 100).toFixed(1)}%`);
  assert.ok(rows.filter((r) => Math.abs(r[3]) > 0.35).length === 0, 'no single case off by more than 35%');
});
