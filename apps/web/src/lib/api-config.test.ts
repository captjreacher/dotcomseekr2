import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

test('production web config uses the hosted Edge API', () => {
  const productionEnv = readFileSync(new URL('../../.env.production', import.meta.url), 'utf8');

  assert.match(productionEnv, /^VITE_API_MODE=edge$/m);
  assert.match(
    productionEnv,
    /^VITE_SUPABASE_FUNCTIONS_URL=https:\/\/jqfodlzcsgfocyuawzyx\.supabase\.co\/functions\/v1$/m
  );
  assert.doesNotMatch(productionEnv, /localhost/);
});
