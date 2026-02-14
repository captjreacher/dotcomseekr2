# Lexicon Data Files

This directory contains JSON lexicon files used for deterministic phrase expansion.

## Files

- **synonyms.json**: Word synonyms for expansion
- **related.json**: Related terms and concepts
- **tech-terms.json**: Technology-specific vocabulary (prefixes, suffixes, actions)

## Schema

### synonyms.json
```json
{
  "word": ["synonym1", "synonym2", ...]
}
```

### related.json
```json
{
  "word": ["related1", "related2", ...]
}
```

### tech-terms.json
```json
{
  "category": ["term1", "term2", ...]
}
```

## Usage

These files are loaded by the `LexiconLoader` in the engine package and used for deterministic expansion before LLM enrichment.
