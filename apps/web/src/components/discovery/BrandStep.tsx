import { FormEvent, useEffect, useRef, useState } from 'react';
import { ALLOWED_EXTENSIONS, matchesMode, normalizeOriginal } from '../../lib/discovery/domains';
import {
  DICTIONARY_SOURCE,
  lookupDefinitions,
  type DictionarySense,
} from '../../lib/discovery/dictionary';
import { createRequestGate } from '../../lib/discovery/requests';
import type { BrandContext, DiscoveryMode } from '../../lib/discovery/types';

interface BrandStepProps {
  mode: DiscoveryMode;
  initial: BrandContext | null;
  onContinue: (brand: BrandContext) => void;
}

type LookupState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; senses: DictionarySense[] }
  | { kind: 'none'; error?: string };

/**
 * Establish the brand: the original words, the intended meaning and the
 * extensions the user actually wants. Nothing here invents extensions or
 * definitions.
 */
export default function BrandStep({ mode, initial, onContinue }: BrandStepProps) {
  const [original, setOriginal] = useState(initial?.original ?? '');
  const [extensions, setExtensions] = useState<string[]>(initial?.extensions ?? []);
  const [lookup, setLookup] = useState<LookupState>({ kind: 'idle' });
  const [selectedSense, setSelectedSense] = useState<number | null>(null);
  const [manualMeaning, setManualMeaning] = useState(
    initial && !initial.meaningSource ? initial.meaning : ''
  );
  const [commentary, setCommentary] = useState(initial?.commentary ?? '');
  const [error, setError] = useState('');

  const gateRef = useRef(createRequestGate());

  useEffect(() => {
    const gate = gateRef.current;
    return () => gate.cancel();
  }, []);

  const wordCount = normalizeOriginal(original).split(' ').filter(Boolean).length;
  const modeError =
    normalizeOriginal(original) && !matchesMode(original, mode)
      ? mode === 'word'
        ? 'This journey explores one word. Switch to the phrase journey to use several words.'
        : 'The phrase journey needs at least two words. Switch to the one-word journey instead.'
      : '';

  async function findDefinitions() {
    const term = normalizeOriginal(original);
    if (!term || modeError) return;

    const request = gateRef.current.begin();
    setLookup({ kind: 'loading' });
    setSelectedSense(null);

    const result = await lookupDefinitions(term, {
      signal: request.signal,
      timeoutMs: 10_000,
    });

    if (!request.isCurrent()) return;

    setLookup(
      result.senses.length > 0
        ? { kind: 'ready', senses: result.senses }
        : { kind: 'none', error: result.error }
    );
  }

  function toggleExtension(extension: string) {
    setExtensions((current) =>
      current.includes(extension)
        ? current.filter((item) => item !== extension)
        : [...current, extension]
    );
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();

    if (!normalizeOriginal(original)) {
      setError('Enter the word or phrase you want to build on.');
      return;
    }

    if (modeError) {
      setError(modeError);
      return;
    }

    if (extensions.length === 0) {
      setError('Select the extensions you want to check. We never add them for you.');
      return;
    }

    const sense =
      selectedSense !== null && lookup.kind === 'ready' ? lookup.senses[selectedSense] : null;
    const meaning = sense?.definition ?? manualMeaning.trim();

    if (!meaning) {
      setError('Choose the meaning you intend, or describe it in your own words.');
      return;
    }

    setError('');
    onContinue({
      mode,
      original: normalizeOriginal(original),
      workingName: normalizeOriginal(original),
      meaning,
      meaningSource: sense ? `${DICTIONARY_SOURCE.name} — ${DICTIONARY_SOURCE.detail}` : null,
      commentary: commentary.trim(),
      extensions,
    });
  }

  return (
    <form className="discovery-form brand-form" onSubmit={handleSubmit}>
      <label htmlFor="brand-original">{mode === 'word' ? 'Your word' : 'Your phrase'}</label>
      <input
        id="brand-original"
        value={original}
        onChange={(event) => setOriginal(event.target.value)}
        placeholder={mode === 'word' ? 'clean' : 'clean ledger'}
        autoComplete="off"
        aria-invalid={Boolean(modeError)}
        aria-describedby="brand-original-hint"
      />
      <p className="field-hint" id="brand-original-hint">
        {mode === 'word'
          ? 'One word. The meaning you choose below anchors every suggestion.'
          : 'Two or more words. Each suggestion will name the word it replaces or modifies.'}
      </p>
      {modeError && <p className="form-error">{modeError}</p>}

      <div className="brand-meaning">
        <div className="brand-meaning-head">
          <h3>Intended meaning</h3>
          <button
            className="secondary-action compact"
            type="button"
            onClick={() => void findDefinitions()}
            disabled={
              !normalizeOriginal(original) || Boolean(modeError) || lookup.kind === 'loading'
            }
          >
            {lookup.kind === 'loading' ? 'Looking up…' : 'Look up definitions'}
          </button>
        </div>

        {lookup.kind === 'idle' && (
          <p className="field-hint">
            Definitions come from {DICTIONARY_SOURCE.name} ({DICTIONARY_SOURCE.detail}). You can
            also describe the meaning yourself.
          </p>
        )}

        {lookup.kind === 'loading' && <p className="field-hint">Looking for definitions…</p>}

        {lookup.kind === 'ready' && (
          <fieldset className="sense-list">
            <legend>
              Choose the meaning you intend ·{' '}
              <a href={DICTIONARY_SOURCE.url} target="_blank" rel="noopener noreferrer">
                {DICTIONARY_SOURCE.name}
              </a>
            </legend>
            {lookup.senses.map((sense, index) => (
              <label className="sense-option" key={`${sense.partOfSpeech}-${index}`}>
                <input
                  type="radio"
                  name="sense"
                  checked={selectedSense === index}
                  onChange={() => setSelectedSense(index)}
                />
                <span>
                  {sense.partOfSpeech && <strong>{sense.partOfSpeech}. </strong>}
                  {sense.definition}
                </span>
              </label>
            ))}
            <label className="sense-option">
              <input
                type="radio"
                name="sense"
                checked={selectedSense === null}
                onChange={() => setSelectedSense(null)}
              />
              <span>None of these — I will describe it myself.</span>
            </label>
          </fieldset>
        )}

        {lookup.kind === 'none' && (
          <div className="notice-panel" role="status">
            <p>
              The dictionary has no entry for this {mode === 'phrase' ? 'phrase' : 'word'}, so we
              will not invent one. Describe what it means to you below.
            </p>
            {lookup.error && <p className="field-hint">{lookup.error}</p>}
          </div>
        )}

        {(lookup.kind === 'none' || (lookup.kind === 'ready' && selectedSense === null)) && (
          <div className="brand-textarea">
            <label htmlFor="brand-meaning">What does it mean to your brand?</label>
            <textarea
              id="brand-meaning"
              value={manualMeaning}
              onChange={(event) => setManualMeaning(event.target.value)}
              rows={3}
              placeholder="In my own words…"
            />
          </div>
        )}
      </div>

      <div className="brand-commentary">
        <label htmlFor="brand-commentary">Brand commentary (optional)</label>
        <textarea
          id="brand-commentary"
          value={commentary}
          onChange={(event) => setCommentary(event.target.value)}
          rows={3}
          placeholder="Tone, audience, anything the suggestions must respect."
        />
      </div>

      <div className="chip-group" aria-label="Extensions">
        <span>Extensions</span>
        {ALLOWED_EXTENSIONS.map((extension) => (
          <button
            key={extension}
            type="button"
            className={extensions.includes(extension) ? 'active' : ''}
            aria-pressed={extensions.includes(extension)}
            onClick={() => toggleExtension(extension)}
          >
            .{extension}
          </button>
        ))}
      </div>
      <p className="field-hint">
        {extensions.length === 0
          ? 'Select at least one extension. None are added for you.'
          : `Only the selected extensions are checked. Words: ${wordCount}.`}
      </p>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <button className="primary-action" type="submit">
        Check the original name
      </button>
    </form>
  );
}
