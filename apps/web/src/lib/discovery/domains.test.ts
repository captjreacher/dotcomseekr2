import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  MAX_CHECK_DOMAINS,
  brandSummary,
  domainsFor,
  domainsForSelection,
  exactCheckPayload,
  joinLabel,
  matchesMode,
  parseCheckDomains,
  parseExactDomain,
  toCheckResult,
} from './domains.ts';
import type { BrandContext } from './types.ts';

describe('exact domain search', () => {
  it('checks one name only and never generates alternatives', () => {
    const payload = exactCheckPayload('clean.com');

    assert.ok('body' in payload);
    assert.deepEqual(payload.body.domains, ['clean.com']);
    assert.equal(payload.body.domains.length, 1);
    assert.equal(payload.body.action, 'check');
  });

  it('normalizes input without adding an extension', () => {
    assert.deepEqual(parseExactDomain('  HTTPS://www.Clean.com/path?x=1 '), {
      domain: 'clean.com',
    });
    assert.deepEqual(parseExactDomain('clean.com.'), { domain: 'clean.com' });
  });

  it('refuses to invent an extension', () => {
    const parsed = parseExactDomain('clean');

    assert.ok(parsed.error);
    assert.match(parsed.error, /extension/i);
    assert.equal(parsed.domain, '');
  });

  it('rejects extensions it cannot check', () => {
    assert.ok(parseExactDomain('clean.dev').error);
    assert.ok(parseExactDomain('clean.co.uk').error);
  });
});

describe('domain construction', () => {
  it('joins a phrase into one label', () => {
    assert.equal(joinLabel('Clean Ledger'), 'cleanledger');
    assert.equal(joinLabel('clean-ledger'), 'cleanledger');
  });

  it('uses only the extensions the user selected', () => {
    assert.deepEqual(domainsFor('clean', ['com', 'ai']), ['clean.com', 'clean.ai']);
    assert.deepEqual(domainsFor('clean', ['com']), ['clean.com']);
    assert.deepEqual(domainsFor('clean', ['bogus']), []);
  });

  it('never exceeds the shared check ceiling', () => {
    const spellings = ['one', 'two', 'three', 'four', 'five', 'six'];
    const domains = domainsForSelection(spellings, ['com', 'ai', 'io']);

    assert.equal(domains.length, MAX_CHECK_DOMAINS);
    assert.ok(domains.every((domain) => /\.(com|ai|io)$/.test(domain)));
  });

  it('rejects an oversized batch', () => {
    const many = Array.from({ length: MAX_CHECK_DOMAINS + 1 }, (_, index) => `name${index}.com`);
    const parsed = parseCheckDomains(many);

    assert.ok(parsed.error);
    assert.deepEqual(parsed.domains, []);
  });
});

describe('brand summary', () => {
  it('shows the anchor, the branch and the extensions', () => {
    const brand: BrandContext = {
      mode: 'word',
      original: 'clean',
      workingName: 'spotless',
      meaning: 'free from dirt',
      meaningSource: 'Free Dictionary API',
      commentary: 'calm, dependable',
      extensions: ['com', 'ai'],
    };

    const summary = brandSummary(brand);

    assert.match(summary, /clean/);
    assert.match(summary, /spotless/);
    assert.match(summary, /\.com/);
  });

  it('separates one word from a phrase', () => {
    assert.equal(matchesMode('clean', 'word'), true);
    assert.equal(matchesMode('clean ledger', 'word'), false);
    assert.equal(matchesMode('clean ledger', 'phrase'), true);
  });
});

describe('availability mapping', () => {
  it('turns an unverified answer into unknown, never available or taken', () => {
    const result = toCheckResult({
      domain: 'clean.com',
      status: 'available',
      verified: false,
      registrationUrl: 'https://example.test/register',
      reason: 'Registrar rate limit reached',
    });

    assert.equal(result?.status, 'unknown');
    assert.equal(result?.verified, false);
    assert.equal(result?.registrationUrl, null);
    assert.match(result?.reason ?? '', /rate limit/i);
  });

  it('keeps a verified answer with its price and link', () => {
    const result = toCheckResult({
      domain: 'clean.com',
      status: 'premium',
      verified: true,
      price: 499,
      currency: 'USD',
      registrationUrl: 'https://example.test/register',
      checkedAt: '2026-10-25T01:02:03.000Z',
    });

    assert.equal(result?.status, 'premium');
    assert.equal(result?.price, 499);
    assert.equal(result?.registrationUrl, 'https://example.test/register');
  });

  it('ignores answers without a domain', () => {
    assert.equal(toCheckResult({ status: 'available' }), null);
    assert.equal(toCheckResult(null), null);
  });
});
