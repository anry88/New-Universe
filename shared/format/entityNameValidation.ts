/**
 * Shared validation for player-supplied entity names (planet / system renames
 * and player nicknames).
 *
 * Frontend uses the same module so the UI can mirror the exact reasons the
 * backend will reject the request — there must be no drift between the
 * client-side warning and the server-side enforcement.
 *
 * Rules:
 *   1. Trimmed length in [MIN_ENTITY_NAME_LENGTH, MAX_ENTITY_NAME_LENGTH].
 *   2. Allowed characters: `A-Z`, `a-z`, `А-Я`, `а-я`, `Ё`, `ё`, `0-9`,
 *      space, hyphen.
 *   3. Profanity filter that catches common Russian (Cyrillic and
 *      transliterated to Latin) and English vulgar roots. The list is small
 *      on purpose — it covers the obvious cases and is easy to extend.
 */

export const MIN_ENTITY_NAME_LENGTH = 3;
export const MAX_ENTITY_NAME_LENGTH = 30;

export type EntityNameErrorCode =
  | 'empty'
  | 'too_short'
  | 'too_long'
  | 'invalid_chars'
  | 'profanity';

export interface EntityNameValidationResult {
  valid: boolean;
  error?: EntityNameErrorCode;
  /** Normalised name (trimmed, internal whitespace collapsed). */
  normalized: string;
}

interface LatinSignatures {
  /** Input collapsed to Latin letters only, preserving repeated letters. */
  joined: string[];
  /** Latin letter tokens split on spaces/punctuation for short-root checks. */
  tokens: string[];
}

/** Roots that imply profanity in any direction. Lowercase Latin only. */
const PROFANITY_ROOTS_LATIN: readonly string[] = [
  // English
  'fuck',
  'shit',
  'bitch',
  'cunt',
  'dick',
  'cock',
  'piss',
  'asshole',
  'bastard',
  'whore',
  'slut',
  'faggot',
  'nigger',
  'nigga',
  'pussy',
  'twat',
  'wank',
  // Russian transliterations of the standard "мат" roots.
  // Multiple spellings cover the common e/i/y/j swaps players use.
  'huy',
  'huj',
  'hui',
  'hue',
  'xuy',
  'xuj',
  'xui',
  'xue',
  'pizd',
  'pisd',
  'piszd',
  'eba',
  'ebl',
  'ebn',
  'ebu',
  'jeba',
  'jebl',
  'yeba',
  'yebl',
  'blyad',
  'bljad',
  'blya',
  'blja',
  'suka',
  'mudak',
  'mudack',
  'pidor',
  'pidar',
  'pider',
  'pizdec',
  'pizdez',
  'gondon',
  'gandon',
  'zalup',
  'cyka',
];

/** Cyrillic profanity roots (substring match on the Cyrillic input). */
const PROFANITY_ROOTS_CYR: readonly string[] = [
  'хуй',
  'хуе',
  'хуи',
  'хуя',
  'пизд',
  'пид',
  'ебa',
  'еба',
  'ебл',
  'ебн',
  'ёба',
  'ёбл',
  'блят',
  'бляд',
  'сука',
  'мудак',
  'залуп',
  'гондон',
  'гандон',
];

/**
 * Cyrillic → Latin map for leet/transliteration. We deliberately produce
 * multiple Latin candidates per Cyrillic character so common spellings
 * (`zh`/`j`, `kh`/`x`/`h`, `ya`/`ja`, `e`/`yo`) all collapse onto the same
 * Latin root.
 */
const CYR_TO_LATIN: Record<string, string[]> = {
  а: ['a'],
  б: ['b'],
  в: ['v', 'w'],
  г: ['g'],
  д: ['d'],
  е: ['e', 'ye', 'je'],
  ё: ['e', 'yo', 'jo'],
  ж: ['zh', 'j'],
  з: ['z'],
  и: ['i'],
  й: ['y', 'j', 'i'],
  к: ['k'],
  л: ['l'],
  м: ['m'],
  н: ['n'],
  о: ['o'],
  п: ['p'],
  р: ['r'],
  с: ['s', 'c'],
  т: ['t'],
  у: ['u'],
  ф: ['f'],
  х: ['h', 'x', 'kh'],
  ц: ['c', 'ts'],
  ч: ['ch'],
  ш: ['sh'],
  щ: ['sch', 'sh'],
  ъ: [''],
  ы: ['y', 'i'],
  ь: [''],
  э: ['e'],
  ю: ['yu', 'ju'],
  я: ['ya', 'ja'],
};

/** Leet-style Latin character normalisation (digits → letters). */
const LEET_MAP: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '@': 'a',
  $: 's',
};

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

/**
 * Produces a set of Latin "signature" strings derived from the input.
 * Each signature has profanity-relevant noise stripped:
 *   - lowercase, digits/punct collapsed via LEET_MAP
 *   - non-letter chars removed
 *   - repeated letters are tolerated by the root matcher (`fuuuuck` → `fuck`)
 *
 * For Cyrillic input we expand each character through every transliteration
 * candidate, capping the variant fan-out so deliberately long Cyrillic
 * strings cannot blow up the matcher.
 */
function buildLatinSignatures(input: string): LatinSignatures {
  const lower = input.toLowerCase();
  const variants: string[] = [''];
  const MAX_VARIANTS = 32;

  for (const ch of lower) {
    if (CYR_TO_LATIN[ch]) {
      const options = CYR_TO_LATIN[ch];
      const next: string[] = [];
      for (const base of variants) {
        for (const candidate of options) {
          next.push(base + candidate);
          if (next.length >= MAX_VARIANTS) break;
        }
        if (next.length >= MAX_VARIANTS) break;
      }
      variants.splice(0, variants.length, ...next);
      continue;
    }

    const mapped = LEET_MAP[ch] ?? ch;
    for (let i = 0; i < variants.length; i += 1) {
      variants[i] = variants[i] + mapped;
    }
  }

  const joined: string[] = [];
  const tokens: string[] = [];
  for (const variant of variants) {
    let stripped = '';
    for (const ch of variant) {
      if (ch >= 'a' && ch <= 'z') {
        stripped += ch;
      }
    }
    joined.push(stripped);
    tokens.push(...variant.split(/[^a-z]+/).filter(Boolean));
  }

  return { joined, tokens };
}

function containsCyrillicProfanity(input: string): boolean {
  const lower = input.toLowerCase().replace(/\s+/g, '');
  return PROFANITY_ROOTS_CYR.some((root) => lower.includes(root));
}

function repeatedLetterPattern(root: string): RegExp {
  const body = [...root].map((ch) => `${ch}+`).join('');
  return new RegExp(root.length <= 3 ? `^${body}` : body);
}

const PROFANITY_PATTERNS_LATIN: readonly RegExp[] =
  PROFANITY_ROOTS_LATIN.map(repeatedLetterPattern);

function containsLatinProfanity(signatures: LatinSignatures): boolean {
  return PROFANITY_ROOTS_LATIN.some((root, index) => {
    const pattern = PROFANITY_PATTERNS_LATIN[index]!;
    const candidates = root.length <= 3 ? signatures.tokens : signatures.joined;
    return candidates.some((signature) => pattern.test(signature));
  });
}

export function containsProfanity(input: string): boolean {
  if (!input) return false;
  if (containsCyrillicProfanity(input)) return true;
  return containsLatinProfanity(buildLatinSignatures(input));
}

const ALLOWED_CHARS_RE = /^[A-Za-zА-Яа-яЁё0-9 -]+$/u;

export function validateEntityName(rawInput: string): EntityNameValidationResult {
  const normalized = normalizeWhitespace(rawInput ?? '');

  if (normalized.length < MIN_ENTITY_NAME_LENGTH) {
    if (normalized.length === 0) {
      return { valid: false, error: 'empty', normalized };
    }
    return { valid: false, error: 'too_short', normalized };
  }

  if (containsProfanity(rawInput ?? '') || containsProfanity(normalized)) {
    return { valid: false, error: 'profanity', normalized };
  }

  if (normalized.length > MAX_ENTITY_NAME_LENGTH) {
    return { valid: false, error: 'too_long', normalized };
  }

  if (!ALLOWED_CHARS_RE.test(normalized)) {
    return { valid: false, error: 'invalid_chars', normalized };
  }

  return { valid: true, normalized };
}
