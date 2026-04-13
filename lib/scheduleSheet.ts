import { getSheetData } from "@/lib/googleSheets";
import {
  fetchFantraxTeamScoresByPeriod,
  isFantraxScoreDebugEnabled,
  lookupTeamPts,
  mergeFantraxTeamScoresIntoSchedule,
  normalizeTeamName,
  type ScheduleGameweek,
  type ScheduleMatch,
} from "@/lib/fantrax";
import { fantraxLoginWithPassword } from "@/lib/fantraxAuth";
import {
  applyPlayoffQualifiersToSchedule,
  computePlayoffQualifiers,
} from "@/lib/playoffQualifiers";

/** Avoid logging in on every /api/schedule hit (serverless = new process often, but dev = many requests). */
const FANTRAX_SESSION_TTL_MS = 25 * 60 * 1000;
let fantraxSessionCache: { cookie: string; until: number } | null = null;

/** Parse Home_Goals / Away_Goals cells (handles blanks, dashes, comma decimals from locales). */
function parseGoalCell(v: unknown): number | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v === "number" && Number.isFinite(v)) return Math.round(v);
  const s = String(v).trim();
  if (!s || s === "-" || s === "—" || s.toLowerCase() === "n/a") return undefined;
  const n = Number(s.replace(/,/g, "."));
  if (!Number.isFinite(n)) return undefined;
  return Math.round(n);
}

function findSnapshotMatch(
  snapshot: ScheduleGameweek[],
  gameweek: number,
  match: ScheduleMatch
): ScheduleMatch | undefined {
  const g = snapshot.find((x) => x.gameweek === gameweek);
  if (!g) return undefined;
  if (match.id) {
    const byId = g.matches.filter((m) => m.id === match.id);
    if (byId.length >= 1) return byId[0];
  }
  const h = normalizeTeamName(match.home);
  const a = normalizeTeamName(match.away);
  return g.matches.find(
    (m) =>
      normalizeTeamName(m.home) === h && normalizeTeamName(m.away) === a
  );
}

/**
 * Parse Google Sheet "Schedule" rows.
 * Format: Match | Gameweek | Home | Away | ID | Home_Goals | Away_Goals
 */
export function parseScheduleSheetRows(data: unknown[][]): ScheduleGameweek[] {
  const scheduleMap = new Map<
    number,
    {
      home: string;
      away: string;
      id?: string;
      homeGoals?: number;
      awayGoals?: number;
    }[]
  >();

  for (const row of data) {
    if (row.length < 4) continue;

    const gameweek = parseInt(String(row[1]));
    if (isNaN(gameweek)) continue;

    if (!scheduleMap.has(gameweek)) {
      scheduleMap.set(gameweek, []);
    }

    const homeGoals = parseGoalCell(row[5]);
    const awayGoals = parseGoalCell(row[6]);

    scheduleMap.get(gameweek)!.push({
      home: String(row[2] || ""),
      away: String(row[3] || ""),
      id: row[4] ? String(row[4]) : undefined,
      homeGoals,
      awayGoals,
    });
  }

  return Array.from(scheduleMap.entries())
    .map(([gameweek, matches]) => ({ gameweek, matches }))
    .sort((a, b) => a.gameweek - b.gameweek);
}

/**
 * Load schedule from Sheets, optionally overlay H2H scores from Fantrax.
 */
export async function loadMergedSchedule(spreadsheetId: string): Promise<ScheduleGameweek[]> {
  const data = await getSheetData(spreadsheetId, "Schedule!A2:G200");
  let schedule = parseScheduleSheetRows(data);
  /** Goals as read from the sheet before any Fantrax merge (for debug). */
  const scheduleSnapshot =
    typeof structuredClone === "function"
      ? structuredClone(schedule)
      : (JSON.parse(JSON.stringify(schedule)) as ScheduleGameweek[]);

  const leagueId = process.env.FANTRAX_LEAGUE_ID?.trim();
  if (!leagueId) {
    return schedule;
  }

  try {
    let cookie = process.env.FANTRAX_COOKIE?.trim();
    const email = process.env.FANTRAX_EMAIL?.trim();
    const password = process.env.FANTRAX_PASSWORD;
    if (!cookie && email && password) {
      const now = Date.now();
      if (
        fantraxSessionCache &&
        fantraxSessionCache.until > now &&
        fantraxSessionCache.cookie
      ) {
        cookie = fantraxSessionCache.cookie;
      } else {
        cookie = await fantraxLoginWithPassword({
          email,
          password,
          tfaCode: process.env.FANTRAX_TFA_CODE?.trim(),
        });
        fantraxSessionCache = {
          cookie,
          until: now + FANTRAX_SESSION_TTL_MS,
        };
      }
    }
    const offsetRaw = process.env.FANTRAX_PERIOD_OFFSET?.trim();
    const periodOffset =
      offsetRaw !== undefined && offsetRaw !== "" && !isNaN(parseInt(offsetRaw, 10))
        ? parseInt(offsetRaw, 10)
        : 0;

    const fantraxPeriods = [
      ...new Set(schedule.map((gw) => gw.gameweek - periodOffset)),
    ].filter((p) => Number.isFinite(p));

    const teamScores = await fetchFantraxTeamScoresByPeriod(
      leagueId,
      fantraxPeriods,
      cookie
    );

    // Group stage uses real names → merge is correct. Playoff rows often use A1/WC1/…;
    // Fantrax has real names, so merge on placeholders yields empty scores. Resolve
    // qualifiers on the server (same rules as the client) then merge again.
    const provisional = mergeFantraxTeamScoresIntoSchedule(schedule, teamScores, {
      periodOffset,
    });
    const qualifiers = await computePlayoffQualifiers(spreadsheetId, provisional);
    if (qualifiers) {
      const resolved = applyPlayoffQualifiersToSchedule(schedule, qualifiers);
      schedule = mergeFantraxTeamScoresIntoSchedule(resolved, teamScores, {
        periodOffset,
      });
    } else {
      schedule = provisional;
    }

    if (isFantraxScoreDebugEnabled()) {
      console.log(
        "[schedule] After Fantrax merge — Fantrax **replaces** sheet goals when both teams have FP for that period; otherwise sheet values are kept. See `note` for sheet vs Fantrax."
      );
      const fantraxLoadedAnyPeriod = teamScores.size > 0;
      if (!fantraxLoadedAnyPeriod) {
        console.warn(
          "[schedule] Fantrax returned no roster FP for any period — GW30 numbers in your log are from the Schedule sheet (columns F/G), not Fantrax. Fix Fantrax auth/config to auto-fill; until then type GW31+ scores in F/G or fix that tab’s column layout."
        );
      }
      for (const gw of schedule) {
        if (gw.gameweek < 25) continue;
        const fantraxPeriod = gw.gameweek - periodOffset;
        const periodMap = teamScores.get(fantraxPeriod);
        const keyCount = periodMap?.size ?? 0;
        const rows = gw.matches.map((m) => {
          const snap = findSnapshotMatch(scheduleSnapshot, gw.gameweek, m);
          const sheetH = snap?.homeGoals;
          const sheetA = snap?.awayGoals;
          const homeK = normalizeTeamName(m.home);
          const awayK = normalizeTeamName(m.away);
          const homeHit =
            m.home !== "BYE" && periodMap
              ? lookupTeamPts(periodMap, m.home)
              : undefined;
          const awayHit =
            m.away !== "BYE" && periodMap
              ? lookupTeamPts(periodMap, m.away)
              : undefined;
          const sheetPart =
            sheetH != null || sheetA != null
              ? `parsed from sheet: ${sheetH ?? "∅"}/${sheetA ?? "∅"}`
              : "parsed from sheet: ∅/∅ (columns F/G empty or non-numeric?)";
          const hasSheetScores = sheetH != null || sheetA != null;
          let fantraxPart: string;
          if (keyCount > 0) {
            fantraxPart = `Fantrax period ${fantraxPeriod}: ${keyCount} team keys; home ${homeHit !== undefined ? `✓ ${homeHit}` : `✗ (${homeK})`}; away ${awayHit !== undefined ? `✓ ${awayHit}` : `✗ (${awayK})`}`;
          } else if (!fantraxLoadedAnyPeriod) {
            fantraxPart = hasSheetScores
              ? "Fantrax: not working (0 periods with data) — scores above are SHEET F/G only"
              : "Fantrax: not working (0 periods); sheet F/G also empty → null";
          } else {
            fantraxPart = hasSheetScores
              ? `Fantrax period ${fantraxPeriod}: no map for this week — keeping sheet F/G`
              : `Fantrax period ${fantraxPeriod}: no map; sheet F/G empty → null`;
          }
          return {
            id: m.id,
            home: m.home,
            away: m.away,
            homeGoals: m.homeGoals ?? null,
            awayGoals: m.awayGoals ?? null,
            ok:
              m.home === "BYE" ||
              m.away === "BYE" ||
              (m.homeGoals != null && m.awayGoals != null),
            fantraxPeriod,
            note: `${sheetPart} | ${fantraxPart}`,
          };
        });
        console.log(`  GW ${gw.gameweek} (Fantrax period ${fantraxPeriod}):`, rows);
      }
    }
  } catch (err) {
    console.error(
      "[schedule] Fantrax merge failed; using sheet scores only:",
      err instanceof Error ? err.message : err
    );
  }

  return schedule;
}

export type { ScheduleGameweek };
