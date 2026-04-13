/**
 * Two-leg (or multi-leg) playoff ties: sum fantasy “goals” (F/G) across every
 * schedule row that shares the same Match ID, then pick the advancing team.
 * Later rounds chain off earlier series winners (cells like “Winner R8A”).
 */

export type PlayoffScheduleMatch = {
  home: string;
  away: string;
  id?: string;
  homeGoals?: number;
  awayGoals?: number;
};

export type PlayoffScheduleGameweek = {
  gameweek: number;
  matches: PlayoffScheduleMatch[];
};

export type QualifierNames = {
  A1: string;
  A2: string;
  B1: string;
  B2: string;
  C1: string;
  C2: string;
  WC1: string;
  WC2: string;
  T1: string;
  T2: string;
};

/** Same name resolution as the sheet merge / client schedule population. */
export function applyQualifierNamesToSchedule(
  schedule: PlayoffScheduleGameweek[],
  q: QualifierNames
): PlayoffScheduleGameweek[] {
  const map: Record<string, string> = {
    A1: q.A1,
    A2: q.A2,
    B1: q.B1,
    B2: q.B2,
    C1: q.C1,
    C2: q.C2,
    WC1: q.WC1,
    WC2: q.WC2,
    "1st Place": q.T1,
    "2nd Place": q.T2,
    T1: q.T1,
    T2: q.T2,
  };

  return schedule.map((gw) => ({
    ...gw,
    matches: gw.matches.map((m) => {
      const home = m.home.trim();
      const away = m.away.trim();
      return {
        ...m,
        home: map[home] ?? m.home,
        away: map[away] ?? m.away,
      };
    }),
  }));
}

/** Pull R8A / QF1 / SF2 / Final from labels like “Winner R8A”, “W QF1”. */
export function extractReferencedSeriesId(label: string): string | undefined {
  const t = label.trim();
  const m = t.match(/\b(R8[ABCD]|QF[12]|SF[12]|Final)\b/i);
  if (!m) return undefined;
  const up = m[1].toUpperCase();
  if (up === "FINAL") return "Final";
  return up;
}

function resolveLabel(
  label: string,
  winners: ReadonlyMap<string, string | null>
): string {
  const trimmed = label.trim();
  const id = extractReferencedSeriesId(trimmed);
  if (id) {
    const w = winners.get(id);
    if (w) return w;
  }
  return trimmed;
}

function addScore(
  totals: Map<string, number>,
  team: string,
  pts: number | undefined
): void {
  if (pts === undefined || !Number.isFinite(pts)) return;
  const key = team.trim();
  if (!key || key === "BYE") return;
  totals.set(key, (totals.get(key) ?? 0) + pts);
}

function lastLegTeamScores(
  legs: Array<{
    gameweek: number;
    home: string;
    away: string;
    homeGoals?: number;
    awayGoals?: number;
  }>
): Map<string, number> {
  if (legs.length === 0) return new Map();
  const maxGw = Math.max(...legs.map((x) => x.gameweek));
  const last = legs.filter((l) => l.gameweek === maxGw);
  const m = new Map<string, number>();
  for (const l of last) {
    addScore(m, l.home, l.homeGoals);
    addScore(m, l.away, l.awayGoals);
  }
  return m;
}

function pickWinnerFromTotals(
  totals: Map<string, number>,
  lastLeg: Map<string, number>
): string | null {
  const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  if (ranked.length === 0) return null;
  if (ranked.length === 1) return ranked[0][0];
  const [topName, topSum] = ranked[0];
  const [, secondSum] = ranked[1];
  if (topSum > secondSum) return topName;

  const tieTeams = ranked.filter(([, s]) => s === topSum).map(([n]) => n);
  if (tieTeams.length !== 2) return null;

  const [a, b] = tieTeams;
  const la = lastLeg.get(a) ?? 0;
  const lb = lastLeg.get(b) ?? 0;
  if (la > lb) return a;
  if (lb > la) return b;
  return null;
}

const SERIES_COMPUTE_ORDER = [
  "R8A",
  "R8B",
  "R8C",
  "R8D",
  "QF1",
  "QF2",
  "SF1",
  "SF2",
  "Final",
] as const;

export type PlayoffSeriesBreakdown = {
  seriesId: string;
  winner: string | null;
  totals: Map<string, number>;
  legs: Array<{
    gameweek: number;
    home: string;
    away: string;
    homeGoals?: number;
    awayGoals?: number;
  }>;
};

function collectLegs(
  schedule: PlayoffScheduleGameweek[],
  seriesId: string
): PlayoffSeriesBreakdown["legs"] {
  const out: PlayoffSeriesBreakdown["legs"] = [];
  for (const gw of schedule) {
    for (const m of gw.matches) {
      if (m.id !== seriesId) continue;
      out.push({
        gameweek: gw.gameweek,
        home: m.home.trim(),
        away: m.away.trim(),
        homeGoals: m.homeGoals,
        awayGoals: m.awayGoals,
      });
    }
  }
  out.sort((a, b) => a.gameweek - b.gameweek);
  return out;
}

function aggregateOneSeries(
  schedule: PlayoffScheduleGameweek[],
  seriesId: string,
  winnersSoFar: ReadonlyMap<string, string | null>
): PlayoffSeriesBreakdown {
  const rawLegs = collectLegs(schedule, seriesId);
  const legs = rawLegs.map((leg) => ({
    ...leg,
    home: resolveLabel(leg.home, winnersSoFar),
    away: resolveLabel(leg.away, winnersSoFar),
  }));

  const totals = new Map<string, number>();

  for (const leg of legs) {
    const h = leg.home;
    const a = leg.away;
    const hBye = h === "BYE";
    const aBye = a === "BYE";

    if (hBye && aBye) continue;

    if (aBye) {
      addScore(totals, h, leg.homeGoals);
      continue;
    }
    if (hBye) {
      addScore(totals, a, leg.awayGoals);
      continue;
    }

    addScore(totals, h, leg.homeGoals);
    addScore(totals, a, leg.awayGoals);
  }

  const lastLeg = lastLegTeamScores(legs);
  const winner = pickWinnerFromTotals(totals, lastLeg);

  return { seriesId, winner, totals, legs };
}

export type PlayoffAdvancementResult = {
  /** Resolved winner per match ID, when aggregate decides it */
  winners: Map<string, string | null>;
  breakdown: Map<string, PlayoffSeriesBreakdown>;
};

/**
 * Chain-compute winners: R8 → QF → SF → Final. Uses summed F/G across all rows
 * with the same `id` (e.g. GW31 + GW32 for R8A).
 */
export function computePlayoffAdvancement(
  scheduleWithResolvedQualifierNames: PlayoffScheduleGameweek[]
): PlayoffAdvancementResult {
  const winners = new Map<string, string | null>();
  const breakdown = new Map<string, PlayoffSeriesBreakdown>();

  for (const seriesId of SERIES_COMPUTE_ORDER) {
    const b = aggregateOneSeries(scheduleWithResolvedQualifierNames, seriesId, winners);
    breakdown.set(seriesId, b);
    winners.set(seriesId, b.winner);
  }

  return { winners, breakdown };
}

/** Bracket cell: show real team once a prior series is decided. */
export function displayTeamAfterAdvancement(
  name: string,
  winners: ReadonlyMap<string, string | null>
): string {
  return resolveLabel(name, winners);
}

/** Series aggregate FP for a team as shown in the bracket (resolved name). */
export function seriesTotalForDisplayedTeam(
  b: PlayoffSeriesBreakdown | undefined,
  displayName: string
): number | null {
  if (!b) return null;
  const k = displayName.trim();
  if (!k || k === "BYE") return null;
  const v = b.totals.get(k);
  return v === undefined ? null : v;
}
