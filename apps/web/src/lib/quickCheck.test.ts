import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { AvailabilityCheckPayload } from '../services/api';
import {
  AVAILABILITY_ERROR_MESSAGE,
  QUICK_CHECK_TLDS,
  createLatestGate,
  formatPrice,
  interpretAvailability,
  parseDomainInput,
  quickCheckLabel,
  registrationUrlFor,
} from './quickCheck.ts';

const PROVIDER_NAMES = /dynadot|namecheap|godaddy|porkbun|cloudflare/i;
const REGISTRATION_URL = 'https://registrar.example/check?domain=agent.com';

function livePayload(overrides: AvailabilityCheckPayload = {}): AvailabilityCheckPayload {
  return {
    domain: 'agent.com',
    provider: 'dynadot',
    mode: 'live',
    checkedAt: '2026-10-10T00:00:00.000Z',
    ...overrides,
  };
}

describe('parseDomainInput', () => {
  it('normalizes case, surrounding whitespace and a trailing dot', () => {
    assert.deepEqual(parseDomainInput('  Agent.COM  '), {
      ok: true,
      value: { domain: 'agent.com', label: 'agent', tld: 'com' },
    });
    assert.deepEqual(parseDomainInput('agent.com.'), {
      ok: true,
      value: { domain: 'agent.com', label: 'agent', tld: 'com' },
    });
  });

  it('strips a scheme and path to the bare domain', () => {
    assert.deepEqual(parseDomainInput('https://agent.com/pricing?ref=1'), {
      ok: true,
      value: { domain: 'agent.com', label: 'agent', tld: 'com' },
    });
  });

  it('accepts hyphens inside a label', () => {
    const result = parseDomainInput('blue-sky.io');
    assert.equal(result.ok, true);
    assert.equal(result.ok && result.value.domain, 'blue-sky.io');
  });

  it('rejects empty or TLD-less input', () => {
    for (const value of ['', '   ', 'agent', 'https://']) {
      const result = parseDomainInput(value);
      assert.equal(result.ok, false);
    }
  });

  it('rejects subdomains and multi-label input', () => {
    for (const value of ['agent.com.au', 'www.agent.com', 'agent..com']) {
      const result = parseDomainInput(value);
      assert.equal(result.ok, false);
    }
  });

  it('rejects invalid label characters', () => {
    for (const value of ['-agent.com', 'agent-.com', 'ag ent.com', 'a@b.com', 'agent_.com']) {
      const result = parseDomainInput(value);
      assert.equal(result.ok, false);
    }
  });

  it('rejects TLDs the backend cannot check', () => {
    for (const value of ['agent.xyz', 'agent.com.au', 'agent.dev']) {
      const result = parseDomainInput(value);
      assert.equal(result.ok, false);
    }
    for (const tld of QUICK_CHECK_TLDS) {
      assert.equal(parseDomainInput(`agent.${tld}`).ok, true);
    }
  });
});

describe('interpretAvailability', () => {
  it('returns Available for a live available response', () => {
    const outcome = interpretAvailability(
      'agent.com',
      livePayload({ status: 'available', price: 14, currency: 'USD', registrationUrl: REGISTRATION_URL })
    );

    assert.equal(outcome.kind, 'result');
    assert.equal(outcome.kind === 'result' && outcome.result.status, 'available');
    assert.equal(outcome.kind === 'result' && outcome.result.price, 14);
    assert.equal(quickCheckLabel('available'), 'Available');
  });

  it('returns Premium available for a live premium response', () => {
    const outcome = interpretAvailability(
      'agent.com',
      livePayload({ status: 'premium', price: 499, currency: 'USD', registrationUrl: REGISTRATION_URL })
    );

    assert.equal(outcome.kind === 'result' && outcome.result.status, 'premium');
    assert.equal(quickCheckLabel('premium'), 'Premium available');
  });

  it('returns Not available for a live taken response', () => {
    const outcome = interpretAvailability(
      'agent.com',
      livePayload({ status: 'taken', price: null, registrationUrl: null })
    );

    assert.equal(outcome.kind === 'result' && outcome.result.status, 'taken');
    assert.equal(quickCheckLabel('taken'), 'Not available');
  });

  it('treats a mock/fallback response as an error, never as a real answer', () => {
    for (const payload of [
      livePayload({ status: 'available', provider: 'mock', mode: 'mock' }),
      livePayload({ status: 'taken', provider: 'mock', mode: 'mock' }),
      livePayload({ status: 'unknown', provider: 'mock', mode: 'mock', fallbackReason: 'no key' }),
    ]) {
      const outcome = interpretAvailability('agent.com', payload);
      assert.equal(outcome.kind, 'error');
      assert.equal(outcome.kind === 'error' && outcome.error.message, AVAILABILITY_ERROR_MESSAGE);
    }
  });

  it('treats provider failures and timeouts as errors', () => {
    const failure = interpretAvailability(
      'agent.com',
      livePayload({ status: 'unknown', error: 'Live availability could not be established.' })
    );
    const timeout = interpretAvailability('agent.com', null);

    assert.equal(failure.kind, 'error');
    assert.equal(timeout.kind, 'error');
    assert.equal(timeout.kind === 'error' && timeout.error.message, AVAILABILITY_ERROR_MESSAGE);
  });

  it('treats ambiguous or unsupported responses as errors', () => {
    // No status and no boolean — nothing conclusive to report.
    assert.equal(interpretAvailability('agent.com', livePayload({})).kind, 'error');
    // Unknown state must never be shown as available or taken.
    assert.equal(interpretAvailability('agent.com', livePayload({ status: 'unknown' })).kind, 'error');
    assert.equal(interpretAvailability('agent.com', livePayload({ status: 'pending' })).kind, 'error');
    // A response missing live provider metadata (e.g. the local mock route).
    assert.equal(
      interpretAvailability('agent.com', { domain: 'agent.com', available: true, premium: false })
        .kind,
      'error'
    );
  });

  it('keeps the error message registrar-neutral', () => {
    const outcome = interpretAvailability('agent.com', null);
    assert.equal(outcome.kind, 'error');
    assert.doesNotMatch(AVAILABILITY_ERROR_MESSAGE, PROVIDER_NAMES);
    for (const status of ['available', 'premium', 'taken'] as const) {
      assert.doesNotMatch(quickCheckLabel(status), PROVIDER_NAMES);
    }
  });
});

describe('registration links', () => {
  const available = interpretAvailability(
    'agent.com',
    livePayload({ status: 'available', registrationUrl: REGISTRATION_URL })
  );
  const premium = interpretAvailability(
    'agent.com',
    livePayload({ status: 'premium', registrationUrl: REGISTRATION_URL })
  );
  const taken = interpretAvailability(
    'agent.com',
    livePayload({ status: 'taken', registrationUrl: REGISTRATION_URL })
  );
  const error = interpretAvailability('agent.com', null);

  it('is offered for available and premium states', () => {
    assert.equal(registrationUrlFor(available), REGISTRATION_URL);
    assert.equal(registrationUrlFor(premium), REGISTRATION_URL);
  });

  it('is withheld for taken and error states even when a URL is present', () => {
    assert.equal(taken.kind === 'result' && taken.result.registrationUrl, REGISTRATION_URL);
    assert.equal(registrationUrlFor(taken), null);
    assert.equal(registrationUrlFor(error), null);
  });
});

describe('formatPrice', () => {
  it('renders a currency amount and omits missing prices', () => {
    const priced = interpretAvailability('agent.com', livePayload({ status: 'available', price: 14 }));
    assert.equal(priced.kind === 'result' && formatPrice(priced.result), '$14.00');

    const unpriced = interpretAvailability('agent.com', livePayload({ status: 'available' }));
    assert.equal(unpriced.kind === 'result' && formatPrice(unpriced.result), null);
  });

  it('falls back to priceCents from the local route shape', () => {
    const outcome = interpretAvailability(
      'agent.com',
      livePayload({ status: 'available', priceCents: 7900 })
    );
    assert.equal(outcome.kind === 'result' && outcome.result.price, 79);
  });
});

describe('createLatestGate', () => {
  it('only treats the most recently started check as current', () => {
    const gate = createLatestGate();
    const first = gate.begin();
    const second = gate.begin();

    assert.equal(gate.isCurrent(first), false);
    assert.equal(gate.isCurrent(second), true);
  });

  it('ignores a slow response that resolves after a newer check', async () => {
    const gate = createLatestGate();
    const applied: string[] = [];

    async function check(domain: string, delay: number) {
      const token = gate.begin();
      await new Promise<void>((resolve) => setTimeout(resolve, delay));
      if (!gate.isCurrent(token)) return;
      applied.push(domain);
    }

    await Promise.all([check('slow.com', 30), check('fast.com', 5)]);

    assert.deepEqual(applied, ['fast.com']);
  });
});
