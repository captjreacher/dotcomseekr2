import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearTrialKey,
  newTurnId,
  readTrialKey,
  saveTrialKey,
  trialEndpoint,
  trialHeaders,
  trialSessionId,
  type StorageLike,
} from './trial.ts';

function memoryStorage(initial: Record<string, string> = {}): StorageLike & {
  values: Record<string, string>;
} {
  const values = { ...initial };

  return {
    values,
    getItem: (key) => values[key] ?? null,
    setItem: (key, value) => {
      values[key] = value;
    },
    removeItem: (key) => {
      delete values[key];
    },
  };
}

const SESSION = '6f9619ff-8b86-4d01-b4d0-00c04fc964ff';

test('the trial endpoint is opt-in and refuses cleartext remote URLs', () => {
  assert.equal(trialEndpoint(''), null);
  assert.equal(trialEndpoint(), null);
  assert.equal(trialEndpoint('not a url'), null);
  assert.equal(trialEndpoint('http://trial.example.com'), null);
  assert.equal(
    trialEndpoint('https://dotcomseekr-discovery-trial.example.workers.dev/'),
    'https://dotcomseekr-discovery-trial.example.workers.dev'
  );
  assert.equal(trialEndpoint('http://localhost:8787/'), 'http://localhost:8787');
  assert.equal(trialEndpoint('http://127.0.0.1:8787'), 'http://127.0.0.1:8787');
});

test('a tester code lives only in the provided session storage and trims input', () => {
  const storage = memoryStorage();

  assert.equal(readTrialKey(storage), '');
  assert.equal(saveTrialKey('  dcs_trial_abc  ', storage), 'dcs_trial_abc');
  assert.equal(readTrialKey(storage), 'dcs_trial_abc');

  clearTrialKey(storage);
  assert.equal(readTrialKey(storage), '');
});

test('one pseudonymous session id is reused per tab', () => {
  const storage = memoryStorage();
  let created = 0;

  const first = trialSessionId(storage, () => {
    created += 1;
    return SESSION;
  });
  const second = trialSessionId(storage, () => {
    created += 1;
    return 'ffffffff-ffff-4fff-8fff-ffffffffffff';
  });

  assert.equal(first, SESSION);
  assert.equal(second, SESSION);
  assert.equal(created, 1);
});

test('a malformed stored session is replaced', () => {
  const storage = memoryStorage({ 'dotcomseekr:discovery:trial-session': 'stale' });

  assert.equal(trialSessionId(storage, () => SESSION), SESSION);
  assert.equal(storage.values['dotcomseekr:discovery:trial-session'], SESSION);
});

test('trial headers carry the code and session but never a provider credential', () => {
  const storage = memoryStorage();
  saveTrialKey('dcs_trial_abc', storage);

  const headers = trialHeaders(storage);

  assert.equal(headers['x-trial-key'], 'dcs_trial_abc');
  assert.equal(headers['x-trial-session'], trialSessionId(storage));
  assert.equal(headers.authorization, undefined);
});

test('each explicit request gets its own turn id', () => {
  assert.equal(newTurnId(() => 'turn-one'), 'turn-one');
  assert.equal(newTurnId(() => 'turn-two'), 'turn-two');
});
