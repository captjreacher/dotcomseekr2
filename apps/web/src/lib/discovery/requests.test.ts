import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createRequestGate } from './requests.ts';

describe('latest request wins', () => {
  it('aborts the previous request when a newer one starts', () => {
    const gate = createRequestGate();
    const first = gate.begin();
    const second = gate.begin();

    assert.equal(first.isCurrent(), false);
    assert.equal(first.signal.aborted, true);
    assert.equal(second.isCurrent(), true);
    assert.equal(second.signal.aborted, false);
  });

  it('cancels on navigation so a late answer cannot be applied', () => {
    const gate = createRequestGate();
    const request = gate.begin();

    gate.cancel();

    assert.equal(request.isCurrent(), false);
    assert.equal(request.signal.aborted, true);
  });

  it('keeps gates independent', () => {
    const first = createRequestGate().begin();
    const second = createRequestGate().begin();

    assert.equal(first.isCurrent(), true);
    assert.equal(second.isCurrent(), true);
  });
});
