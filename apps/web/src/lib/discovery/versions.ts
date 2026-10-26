// Version identifiers for the parts that determine suggestion quality.
//
// Bump these whenever the prompt, technique rules or validator changes. The
// trial's health endpoint and quality-matrix script record them, so a result can
// never be attributed to an older prompt or validator by accident.
export const PROMPT_VERSION = '2026-10-26.2';
export const VALIDATOR_VERSION = '2026-10-26.3';
export const TECHNIQUE_VERSION = '2026-10-26.2';
