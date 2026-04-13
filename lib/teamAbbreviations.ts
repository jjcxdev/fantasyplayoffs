import { extractReferencedSeriesId } from "@/lib/playoffAdvancement";

/**
 * Fixed 3-letter codes by **league table order** (sorted by `position` ascending:
 * 1st row → GDZ, 2nd → APD, …). Overrides sheet column C for those teams.
 */
export const LEAGUE_TABLE_ORDER_ABBREVIATIONS = [
  "GDZ",
  "APD",
  "GFC",
  "PFC",
  "SFC",
  "SSC",
  "BMD",
  "TFC",
  "TWD",
  "SLS",
  "PAC",
] as const;

export type LeagueTableRow = {
  name: string;
  position?: number;
  /** Optional column from sheet; otherwise derived. */
  abbreviation?: string;
};

const ARTICLES = new Set(["the", "a", "an", "of", "and", "&"]);

function significantWords(name: string): string[] {
  return name
    .split(/[\s\-]+/)
    .map((w) => w.replace(/[^a-z0-9]/gi, ""))
    .filter((w) => w.length > 0 && !ARTICLES.has(w.toLowerCase()));
}

/** FC token or the phrase Football Club (soccer naming). */
export function hasFootballClubOrFc(name: string): boolean {
  const n = name.toLowerCase();
  return /\bfootball\s+club\b/.test(n) || /\bfc\b/.test(n) || /\bf\.c\.\b/.test(n);
}

/** Strip FC / F.C. / Football Club tokens for the “club name” stem. */
function stripClubSuffixes(s: string): string {
  return s
    .replace(/\bfootball\s+club\b/gi, " ")
    .replace(/\bf\.c\.\b/gi, " ")
    .replace(/\bfc\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function firstLatinLetter(s: string): string | null {
  const m = s.match(/[a-z]/i);
  return m ? m[0].toUpperCase() : null;
}

/** Exactly 3 letters A–Z; pad with X if needed. */
function toThreeLetters(s: string): string {
  const u = s.toUpperCase().replace(/[^A-Z]/g, "");
  if (u.length >= 3) return u.slice(0, 3);
  return (u + "XXX").slice(0, 3);
}

/**
 * Names with FC / Football Club → first meaningful letter of the club stem + "FC"
 * (e.g. Arsenal FC → AFC, FC Barcelona → BFC).
 */
function deriveWithFcSuffix(name: string): string {
  const stem = stripClubSuffixes(name);
  const words = significantWords(stem);
  let letter: string | null = null;

  if (words.length > 0) {
    letter = firstLatinLetter(words[0]);
    if (!letter && words[0].length > 0) {
      letter = words[0].charAt(0).toUpperCase();
    }
  }
  if (!letter && stem.length > 0) {
    letter = firstLatinLetter(stem);
  }
  if (!letter) letter = "X";
  return `${letter}FC`.slice(0, 3);
}

/**
 * No FC in name: classic 3-letter code (initials of up to 3 words, or first 3 letters of one word).
 */
function deriveWithoutFcSuffix(name: string): string {
  const words = significantWords(name);
  const clean = (w: string) => w.replace(/[^a-z0-9]/gi, "");

  if (words.length === 0) {
    const alnum = name.replace(/[^a-z0-9]/gi, "");
    return toThreeLetters(alnum || "UNK");
  }
  if (words.length === 1) {
    return toThreeLetters(clean(words[0]));
  }
  if (words.length === 2) {
    const a = clean(words[0]);
    const b = clean(words[1]);
    const c1 = a.charAt(0).toUpperCase();
    const c2 = b.charAt(0).toUpperCase();
    const thirdLetter = (
      a.length >= 3
        ? a.charAt(Math.min(2, a.length - 1))
        : b.length >= 2
          ? b.charAt(1)
          : a.length >= 2
            ? a.charAt(1)
            : "X"
    ).toUpperCase();
    return (c1 + c2 + thirdLetter).slice(0, 3);
  }
  return words
    .slice(0, 3)
    .map((w) => clean(w).charAt(0).toUpperCase())
    .join("")
    .slice(0, 3);
}

/** Soccer-style 3-letter abbreviation from the full team name. */
export function deriveTeamAbbreviation(name: string): string {
  const t = name.trim();
  if (!t) return "???";
  if (hasFootballClubOrFc(t)) return deriveWithFcSuffix(t);
  return deriveWithoutFcSuffix(t);
}

/** Ordered 3-letter candidates for collision resolution (FC names keep …FC). */
function abbreviationCandidates(name: string): string[] {
  const primary = deriveTeamAbbreviation(name);
  const out: string[] = [primary];

  if (hasFootballClubOrFc(name)) {
    const stem = stripClubSuffixes(name);
    const words = significantWords(stem);
    const letters: string[] = [];
    for (const word of words) {
      const c = word.replace(/[^a-z0-9]/gi, "");
      for (let i = 0; i < c.length; i++) {
        const L = c.charAt(i).toUpperCase();
        if (/[A-Z]/.test(L)) letters.push(L);
      }
    }
    for (const L of letters) {
      const code = `${L}FC`;
      if (code.length === 3 && !out.includes(code)) out.push(code);
    }
  } else {
    const words = significantWords(name);
    const clean = (w: string) => w.replace(/[^a-z0-9]/gi, "");
    if (words.length >= 2) {
      const a = clean(words[0]);
      const b = clean(words[1]);
      const pushes: string[] = [];
      if (a.length >= 2 && b.length >= 1) pushes.push((a.slice(0, 2) + b.charAt(0)).toUpperCase().slice(0, 3));
      if (a.length >= 1 && b.length >= 2) pushes.push((a.charAt(0) + b.slice(0, 2)).toUpperCase().slice(0, 3));
      for (const p of pushes) {
        if (p.length === 3 && !out.includes(p)) out.push(p);
      }
    }
    if (words.length === 1) {
      const w = clean(words[0]);
      for (let len = 3; len <= Math.min(w.length, 5); len++) {
        const p = w.slice(0, len).toUpperCase().slice(0, 3);
        if (p.length === 3 && !out.includes(p)) out.push(p);
      }
    }
  }

  return out;
}

export function shouldAbbreviateTeamLabel(name: string): boolean {
  const t = name.trim();
  if (!t || t === "BYE") return false;
  if (extractReferencedSeriesId(t)) return false;
  if (/^winner\b/i.test(t)) return false;
  if (/^w\s+[A-Z0-9]/i.test(t)) return false;
  return true;
}

export function formatTeamAbbreviation(
  fullName: string,
  abbrevByFullName: ReadonlyMap<string, string>
): string {
  if (!shouldAbbreviateTeamLabel(fullName)) return fullName;
  const k = fullName.trim();
  return abbrevByFullName.get(k) ?? deriveTeamAbbreviation(k);
}

function uniquifyAbbreviations(
  fullToBase: Map<string, string>,
  frozenNames: ReadonlySet<string>
): Map<string, string> {
  const used = new Set<string>();
  const out = new Map<string, string>();

  const frozenSorted = [...frozenNames]
    .filter((n) => fullToBase.has(n))
    .sort((a, b) => a.localeCompare(b));
  for (const name of frozenSorted) {
    const code = toThreeLetters(fullToBase.get(name)!);
    out.set(name, code);
    used.add(code);
  }

  const names = [...fullToBase.keys()]
    .filter((n) => !frozenNames.has(n))
    .sort((a, b) => a.localeCompare(b));

  for (const name of names) {
    let raw = fullToBase.get(name) ?? deriveTeamAbbreviation(name);
    raw = toThreeLetters(raw);

    const auto = abbreviationCandidates(name).map(toThreeLetters);
    const candidates = [...new Set([raw, ...auto])];
    let picked = raw;
    for (const c of candidates) {
      const code = toThreeLetters(c);
      if (!used.has(code)) {
        picked = code;
        break;
      }
    }

    let n = 0;
    const base = toThreeLetters(candidates[0] ?? raw);
    while (used.has(picked)) {
      n += 1;
      if (hasFootballClubOrFc(name) && base.endsWith("FC")) {
        const L = String.fromCharCode(65 + ((n - 1) % 26));
        picked = `${L}FC`;
      } else {
        picked = (base.slice(0, 2) + String.fromCharCode(65 + ((n - 1) % 26))).slice(0, 3);
      }
    }

    used.add(picked);
    out.set(name, picked);
  }
  return out;
}

/**
 * One abbreviation per canonical full name. League sheet values win when set
 * (normalized to 3 letters), except names with FC / Football Club must end in "FC".
 */
export function buildTeamAbbreviationMap(
  leagueTeams: LeagueTableRow[],
  extraFullNames: string[]
): Map<string, string> {
  const sortedLeague = [...leagueTeams]
    .filter((t) => t.name?.trim())
    .sort((a, b) => (a.position ?? 999) - (b.position ?? 999));

  const leagueOrderAbbr = new Map<string, string>();
  for (let i = 0; i < sortedLeague.length && i < LEAGUE_TABLE_ORDER_ABBREVIATIONS.length; i++) {
    const name = sortedLeague[i].name.trim();
    leagueOrderAbbr.set(
      name,
      toThreeLetters(LEAGUE_TABLE_ORDER_ABBREVIATIONS[i])
    );
  }
  const frozenLeagueNames = new Set(leagueOrderAbbr.keys());

  const names = new Set<string>();
  for (const t of leagueTeams) {
    const n = t.name.trim();
    if (n) names.add(n);
  }
  for (const raw of extraFullNames) {
    const n = raw.trim();
    if (n && n !== "BYE") names.add(n);
  }

  const base = new Map<string, string>();
  for (const n of [...names].sort((a, b) => a.localeCompare(b))) {
    if (leagueOrderAbbr.has(n)) {
      base.set(n, leagueOrderAbbr.get(n)!);
      continue;
    }

    const fromSheet = leagueTeams.find((t) => t.name.trim() === n)?.abbreviation?.trim();
    let chosen: string;
    if (fromSheet && fromSheet.length > 0) {
      const lettersOnly = fromSheet.toUpperCase().replace(/[^A-Z]/g, "");
      if (hasFootballClubOrFc(n)) {
        if (lettersOnly.endsWith("FC") && lettersOnly.length >= 3) {
          chosen = lettersOnly.slice(-3);
        } else {
          chosen = deriveWithFcSuffix(n);
        }
      } else {
        chosen = toThreeLetters(lettersOnly);
      }
    } else {
      chosen = deriveTeamAbbreviation(n);
    }
    base.set(n, chosen);
  }
  return uniquifyAbbreviations(base, frozenLeagueNames);
}
