/**
 * Fantrax scores — kept deliberately simple:
 *
 * 1. **League roster** — `getTeamRosterInfo` (league-wide, `GAMES_PER_POS`) returns every
 *    `teamId` plus `name` and `shortName`.
 * 2. **Per gameweek** — For each Fantrax scoring period (= sheet gameweek − `FANTRAX_PERIOD_OFFSET`),
 *    for **each team id** call `getTeamRosterInfo` with that `teamId` and period, `STATS` +
 *    `SCHEDULE_FULL` in one request (same as FantraxAPI). Sum the roster **SCORE** column → team FP.
 * 3. **Merge** — Map those totals onto your Google Sheet schedule by **normalized team name**
 *    (full name and short name both registered). Placeholders like `A1` are resolved on the server
 *    before merge (`scheduleSheet` + `playoffQualifiers`).
 *
 * We do **not** use `getStandings` here; it’s brittle across league types. Per-team roster is more
 * requests but matches “FPts for this team this week” directly.
 */

const FANTRAX_REQ_URL = "https://www.fantrax.com/fxpa/req";
const DEFAULT_CLIENT_VERSION =
  process.env.FANTRAX_CLIENT_VERSION?.trim() || "179.0.1";

/**
 * Verbose Fantrax score logs (each team × period in terminal).
 * On by default in `next dev` (`NODE_ENV=development`), or set `FANTRAX_LOG_SCORES=1` in production.
 */
export function isFantraxScoreDebugEnabled(): boolean {
  return (
    process.env.NODE_ENV === "development" ||
    process.env.FANTRAX_LOG_SCORES?.trim() === "1"
  );
}

/** period → normalized team name → fantasy points that period */
export type FantraxTeamScoresByPeriod = Map<number, Map<string, number>>;

type FantraxCell = {
  content?: string;
  key?: string;
  teamId?: string;
  sortKey?: string;
};

function buildMsg(
  method: string,
  leagueId: string,
  data: Record<string, string | number | boolean | undefined>
) {
  const output: Record<string, string> = { leagueId };
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null) continue;
    output[key] = String(value);
  }
  return { method, data: output };
}

function buildFantraxPostBody(msgs: ReturnType<typeof buildMsg>[]) {
  return {
    msgs,
    uiv: 3,
    refUrl: "https://www.fantrax.com/",
    dt: "1",
    at: "0",
    av: "",
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    v: DEFAULT_CLIENT_VERSION,
  };
}

async function fantraxRequest(
  leagueId: string,
  msgs: ReturnType<typeof buildMsg>[],
  cookie?: string
): Promise<unknown[]> {
  const url = `${FANTRAX_REQ_URL}?leagueId=${encodeURIComponent(leagueId)}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    Origin: "https://www.fantrax.com",
    Referer: `https://www.fantrax.com/fantasy/league/${leagueId}/livescoring`,
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  };
  if (cookie?.trim()) {
    headers.Cookie = cookie.trim();
  }

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(buildFantraxPostBody(msgs)),
  });

  const json = (await res.json()) as {
    pageError?: { code?: string; title?: string };
    responses?: { data: unknown }[];
  };

  if (!res.ok) {
    throw new Error(`Fantrax HTTP ${res.status}: ${JSON.stringify(json)}`);
  }

  if (json.pageError) {
    const code = json.pageError.code || "";
    const title = json.pageError.title || "";
    throw new Error(
      `Fantrax error${code ? ` [${code}]` : ""}: ${title || JSON.stringify(json.pageError)}`
    );
  }

  if (!json.responses?.length) {
    throw new Error("Fantrax: empty responses");
  }

  return msgs.length === 1
    ? [json.responses[0].data]
    : json.responses.map((r) => r.data);
}

function parseScore(content: string | undefined): number | undefined {
  if (content === undefined || content === null) return undefined;
  const s = String(content).trim().replace(/,/g, "");
  if (s === "" || s === "-") return undefined;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : undefined;
}

function extractFantasyTeams(data: unknown): Record<string, { name?: string; shortName?: string }> {
  if (!data || typeof data !== "object") return {};
  const o = data as { fantasyTeams?: Record<string, { name?: string; shortName?: string }> };
  return o.fantasyTeams && typeof o.fantasyTeams === "object" ? o.fantasyTeams : {};
}

/** All teams: ids, full names, short names (for sheet matching). */
export type FantraxLeagueDirectory = {
  teamIds: string[];
  idToName: Map<string, string>;
  idToShortName: Map<string, string>;
};

export async function fetchFantraxLeagueDirectory(
  leagueId: string,
  cookie?: string
): Promise<FantraxLeagueDirectory> {
  const [rosterData] = (await fantraxRequest(
    leagueId,
    [buildMsg("getTeamRosterInfo", leagueId, { view: "GAMES_PER_POS" })],
    cookie
  )) as unknown[];

  const teams = extractFantasyTeams(rosterData);
  const idToName = new Map<string, string>();
  const idToShortName = new Map<string, string>();

  for (const [id, t] of Object.entries(teams)) {
    const name = (t.name || t.shortName || id).trim();
    idToName.set(id, name);
    if (t.shortName?.trim()) {
      idToShortName.set(id, t.shortName.trim());
    }
  }

  const teamIds = [...idToName.keys()].sort();
  if (isFantraxScoreDebugEnabled()) {
    console.log(
      `[fantrax] League directory: ${teamIds.length} teams`,
      teamIds.map((id) => ({
        teamId: id,
        name: idToName.get(id),
        shortName: idToShortName.get(id) ?? "(same as name)",
      }))
    );
  }
  return { teamIds, idToName, idToShortName };
}

export async function fetchFantraxTeamNames(
  leagueId: string,
  cookie?: string
): Promise<Map<string, string>> {
  const { idToName } = await fetchFantraxLeagueDirectory(leagueId, cookie);
  return idToName;
}

type RosterStatsTable = {
  header?: { cells?: FantraxCell[] };
  rows?: Array<{ cells?: FantraxCell[]; posId?: string }>;
};

function findRosterScoreColumnIndex(headers: FantraxCell[]): number {
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i] as FantraxCell;
    const sk = String(h?.sortKey ?? "").toUpperCase();
    if (
      sk === "SCORE" ||
      sk === "FPTS" ||
      sk === "TOTAL_FANTASY_POINTS" ||
      sk === "PF"
    ) {
      return i;
    }
    const k = String(h?.key ?? "").toLowerCase();
    if (k.includes("score") || k === "fpts" || k === "pf" || k === "pointsfor") return i;
    const text = String(h?.content ?? "").trim();
    if (/^fpts?$/i.test(text) || /^score$/i.test(text) || /^pts$/i.test(text)) return i;
  }
  return -1;
}

/**
 * Sum FP from STATS response: prefer roster rows with `posId`, else any row with a numeric score cell.
 */
function sumFptsFromTeamRosterStatsResponse(data: unknown): number | undefined {
  const o = data as { tables?: RosterStatsTable[] };
  const tables = o.tables;
  if (!Array.isArray(tables)) return undefined;

  let total = 0;
  let count = 0;

  for (const table of tables) {
    const headers = table.header?.cells;
    const rows = table.rows;
    if (!Array.isArray(headers) || !Array.isArray(rows)) continue;

    const scoreCol = findRosterScoreColumnIndex(headers);
    if (scoreCol < 0) continue;

    let t = 0;
    let c = 0;
    for (const row of rows) {
      if (!("posId" in row)) continue;
      const pts = parseScore(row.cells?.[scoreCol]?.content);
      if (pts === undefined) continue;
      t += pts;
      c += 1;
    }
    if (c === 0) {
      for (const row of rows) {
        const pts = parseScore(row.cells?.[scoreCol]?.content);
        if (pts === undefined) continue;
        t += pts;
        c += 1;
      }
    }
    total += t;
    count += c;
  }

  return count > 0 ? total : undefined;
}

/**
 * One team, one scoring period — FantraxAPI sends STATS + SCHEDULE_FULL together.
 * Tries `scoringPeriod` then `period` (Fantrax varies by league).
 */
async function fetchTeamFptsForScoringPeriod(
  leagueId: string,
  teamId: string,
  scoringPeriod: number,
  cookie?: string
): Promise<number | undefined> {
  const periodParams = [{ scoringPeriod }, { period: scoringPeriod }] as const;

  for (const p of periodParams) {
    try {
      const responses = (await fantraxRequest(
        leagueId,
        [
          buildMsg("getTeamRosterInfo", leagueId, {
            teamId,
            ...p,
            view: "STATS",
          }),
          buildMsg("getTeamRosterInfo", leagueId, {
            teamId,
            ...p,
            view: "SCHEDULE_FULL",
          }),
        ],
        cookie
      )) as unknown[];

      const statsPayload = responses[0];
      const sum = sumFptsFromTeamRosterStatsResponse(statsPayload);
      if (sum !== undefined) return sum;
    } catch {
      /* try next param */
    }
  }
  return undefined;
}

function registerTeamFp(
  out: Map<string, number>,
  directory: FantraxLeagueDirectory,
  teamId: string,
  pts: number
): void {
  const name = directory.idToName.get(teamId);
  if (!name) return;
  out.set(normalizeTeamName(name), pts);
  const short = directory.idToShortName.get(teamId);
  if (short) {
    const sn = normalizeTeamName(short);
    const nn = normalizeTeamName(name);
    if (sn !== nn) out.set(sn, pts);
  }
}

async function fetchPeriodFptsPerTeamRoster(
  leagueId: string,
  scoringPeriod: number,
  directory: FantraxLeagueDirectory,
  cookie?: string | undefined,
  rosterConcurrency = 6
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const { teamIds } = directory;

  for (let i = 0; i < teamIds.length; i += rosterConcurrency) {
    const slice = teamIds.slice(i, i + rosterConcurrency);
    await Promise.all(
      slice.map(async (teamId) => {
        const pts = await fetchTeamFptsForScoringPeriod(
          leagueId,
          teamId,
          scoringPeriod,
          cookie
        );
        const displayName = directory.idToName.get(teamId) ?? teamId;
        if (pts === undefined) {
          if (isFantraxScoreDebugEnabled()) {
            console.warn(
              `[fantrax] Fantrax period ${scoringPeriod} | "${displayName}" (${teamId}) → NO DATA (roster STATS sum empty or request failed)`
            );
          } else if (process.env.FANTRAX_DEBUG?.trim() === "1") {
            console.warn(
              `[fantrax] no FP for teamId=${teamId} name=${displayName} period=${scoringPeriod}`
            );
          }
          return;
        }
        if (isFantraxScoreDebugEnabled()) {
          console.log(
            `[fantrax] Fantrax period ${scoringPeriod} | "${displayName}" (${teamId}) → ${pts} FPts`
          );
        }
        registerTeamFp(out, directory, teamId, pts);
      })
    );
  }

  if (isFantraxScoreDebugEnabled()) {
    const sorted = [...out.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    console.log(
      `[fantrax] ── Period ${scoringPeriod} merged name→FP map (${sorted.length} keys) ──`,
      Object.fromEntries(sorted)
    );
  }

  return out;
}

/**
 * For each Fantrax scoring period: fetch **every** team’s roster FP (direct, predictable).
 *
 * Options:
 * - `periodConcurrency` — how many gameweeks to load in parallel (default 3).
 * - `rosterConcurrency` — parallel team requests per gameweek (default 6).
 */
export async function fetchFantraxTeamScoresByPeriod(
  leagueId: string,
  fantraxPeriods: number[],
  cookie?: string,
  options?: { periodConcurrency?: number; rosterConcurrency?: number }
): Promise<FantraxTeamScoresByPeriod> {
  const periodConcurrency = options?.periodConcurrency ?? 3;
  const rosterConcurrency = options?.rosterConcurrency ?? 6;

  const directory = await fetchFantraxLeagueDirectory(leagueId, cookie);
  const unique = [...new Set(fantraxPeriods)].filter((p) => Number.isFinite(p)).sort((a, b) => a - b);
  if (isFantraxScoreDebugEnabled()) {
    console.log(
      `[fantrax] Will fetch roster FP for Fantrax periods: [${unique.join(", ")}] (sheet gameweeks with FANTRAX_PERIOD_OFFSET applied)`
    );
  }
  const result: FantraxTeamScoresByPeriod = new Map();

  async function fetchOne(period: number) {
    const scores = await fetchPeriodFptsPerTeamRoster(
      leagueId,
      period,
      directory,
      cookie,
      rosterConcurrency
    );
    if (scores.size > 0) {
      result.set(period, scores);
      if (
        scores.size < directory.teamIds.length &&
        (isFantraxScoreDebugEnabled() || process.env.FANTRAX_DEBUG?.trim() === "1")
      ) {
        console.warn(
          `[fantrax] Period ${period}: only ${scores.size}/${directory.teamIds.length} teams have FP (wrong period #? try FANTRAX_PERIOD_OFFSET)`
        );
      }
    } else if (
      isFantraxScoreDebugEnabled() ||
      process.env.FANTRAX_DEBUG?.trim() === "1"
    ) {
      console.warn(`[fantrax] Period ${period}: no roster FP parsed for any team`);
    }
  }

  for (let i = 0; i < unique.length; i += periodConcurrency) {
    const batch = unique.slice(i, i + periodConcurrency);
    await Promise.all(batch.map((p) => fetchOne(p)));
  }

  if (unique.length > 0 && result.size === 0) {
    console.warn(
      "[fantrax] Roster FP is empty for every scoring period requested " +
        `[${unique.join(", ")}]. Fantrax will not fill any matchup — only ` +
        "Schedule sheet columns F/G appear where you typed them. " +
        "Fix: refresh FANTRAX_COOKIE (logged-in browser), or set FANTRAX_EMAIL + FANTRAX_PASSWORD; " +
        "verify FANTRAX_LEAGUE_ID; try FANTRAX_PERIOD_OFFSET if sheet gameweeks ≠ Fantrax periods; " +
        "enable FANTRAX_LOG_SCORES=1 or next dev for per-team `[fantrax] Period N: no roster FP` lines."
    );
  }

  return result;
}

/** Normalize for comparison: trim, lower-case, collapse spaces, strip variation selectors. */
export function normalizeTeamName(s: string): string {
  let t = s.replace(/[\uFE00-\uFE0F\u200D]/g, "").trim();
  // Sheet typo "WIld" vs Fantrax "Wild" (capital I vs l)
  t = t.replace(/\bWIld\b/g, "Wild");
  return t.toLowerCase().replace(/\s+/g, " ");
}

/** Sheet / Fantrax name quirks (apostrophes, curly quotes). Exported for schedule debug. */
export function lookupTeamPts(scores: Map<string, number>, raw: string): number | undefined {
  const n = normalizeTeamName(raw);
  const hit = scores.get(n);
  if (hit !== undefined) return hit;
  const noApos = normalizeTeamName(raw.replace(/['\u2019\u2018`´]/g, ""));
  if (noApos !== n) return scores.get(noApos);
  return undefined;
}

export type ScheduleMatch = {
  home: string;
  away: string;
  id?: string;
  homeGoals?: number;
  awayGoals?: number;
};

export type ScheduleGameweek = {
  gameweek: number;
  matches: ScheduleMatch[];
};

/**
 * Overlay Fantrax roster FP onto schedule rows (by normalized team name).
 *
 * **Source of truth**
 * - If Fantrax returns a non-empty map for that period **and** both teams resolve → **goals are Fantrax FP** (sheet Home/Away goal columns are replaced).
 * - If the period has no Fantrax data, or either team is missing from the map → row is left as-is (**sheet** goals kept if parsed from the sheet).
 * - So after merge, `undefined` goals mean: the sheet had no numeric goals in those cells **and** Fantrax did not supply both teams (not “sheet won over Fantrax”).
 */
export function mergeFantraxTeamScoresIntoSchedule(
  schedule: ScheduleGameweek[],
  teamScoresByPeriod: FantraxTeamScoresByPeriod,
  options?: { periodOffset?: number }
): ScheduleGameweek[] {
  const offset = options?.periodOffset ?? 0;

  return schedule.map((gw) => {
    const fantraxPeriod = gw.gameweek - offset;
    const scores = teamScoresByPeriod.get(fantraxPeriod);
    if (!scores?.size) return gw;

    return {
      ...gw,
      matches: gw.matches.map((match) => {
        const home = match.home;
        const away = match.away;
        const homeBye = home === "BYE";
        const awayBye = away === "BYE";

        if (homeBye && awayBye) return match;

        if (awayBye && !homeBye) {
          const pts = lookupTeamPts(scores, home);
          if (pts === undefined) return match;
          return { ...match, homeGoals: pts, awayGoals: match.awayGoals ?? 0 };
        }

        if (homeBye && !awayBye) {
          const pts = lookupTeamPts(scores, away);
          if (pts === undefined) return match;
          return { ...match, homeGoals: match.homeGoals ?? 0, awayGoals: pts };
        }

        const homePts = lookupTeamPts(scores, home);
        const awayPts = lookupTeamPts(scores, away);
        if (homePts === undefined || awayPts === undefined) {
          return match;
        }

        return {
          ...match,
          homeGoals: homePts,
          awayGoals: awayPts,
        };
      }),
    };
  });
}
