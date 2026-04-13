import { getSheetData } from "@/lib/googleSheets";
import type { ScheduleGameweek } from "@/lib/fantrax";

/** Same tokens the client replaces when showing the schedule / bracket. */
export type PlayoffQualifiers = {
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

type GroupTeam = {
  name: string;
  pts: number;
  gf: number;
  ga: number;
  gd: number;
};

/**
 * Load Group A/B/C team names (column A) and compute pts/GF/GA/GD from group-stage
 * schedule rows (gameweeks 25–30), matching `/api/groups` logic.
 */
async function loadGroupsWithStatsFromSchedule(
  spreadsheetId: string,
  schedule: ScheduleGameweek[]
): Promise<GroupTeam[][]> {
  const groups: GroupTeam[][] = [];
  const groupNames = ["A", "B", "C"] as const;
  const teamToGroupMap = new Map<string, number>();

  for (let groupIndex = 0; groupIndex < groupNames.length; groupIndex++) {
    const data = await getSheetData(
      spreadsheetId,
      `Group ${groupNames[groupIndex]}!A2:E4`
    );
    const group = data.map((row) => {
      const teamName = String(row[0] || "").trim();
      teamToGroupMap.set(teamName, groupIndex);
      return {
        name: teamName,
        pts: 0,
        gf: 0,
        ga: 0,
        gd: 0,
      };
    });
    groups.push(group);
  }

  for (const gw of schedule) {
    if (gw.gameweek < 25 || gw.gameweek > 30) continue;

    for (const match of gw.matches) {
      const home = match.home.trim();
      const away = match.away.trim();
      const isHomeBye = home === "BYE";
      const isAwayBye = away === "BYE";
      if (isHomeBye && isAwayBye) continue;

      const homeGroupIndex = teamToGroupMap.get(home);
      const awayGroupIndex = teamToGroupMap.get(away);

      if (isAwayBye && homeGroupIndex !== undefined) {
        const homeTeam = groups[homeGroupIndex].find((t) => t.name === home);
        if (homeTeam) {
          const homeGoals = match.homeGoals ?? 0;
          homeTeam.gf += homeGoals;
          homeTeam.gd = homeTeam.gf - homeTeam.ga;
        }
        continue;
      }

      if (isHomeBye && awayGroupIndex !== undefined) {
        const awayTeam = groups[awayGroupIndex].find((t) => t.name === away);
        if (awayTeam) {
          const awayGoals = match.awayGoals ?? 0;
          awayTeam.gf += awayGoals;
          awayTeam.gd = awayTeam.gf - awayTeam.ga;
        }
        continue;
      }

      if (match.homeGoals === undefined || match.awayGoals === undefined) continue;

      const homeGoals = match.homeGoals;
      const awayGoals = match.awayGoals;

      if (homeGroupIndex !== undefined) {
        const homeTeam = groups[homeGroupIndex].find((t) => t.name === home);
        if (homeTeam) {
          homeTeam.gf += homeGoals;
          homeTeam.ga += awayGoals;
          homeTeam.gd = homeTeam.gf - homeTeam.ga;
          if (homeGoals > awayGoals) homeTeam.pts += 3;
          else if (homeGoals === awayGoals) homeTeam.pts += 1;
        }
      }

      if (awayGroupIndex !== undefined) {
        const awayTeam = groups[awayGroupIndex].find((t) => t.name === away);
        if (awayTeam) {
          awayTeam.gf += awayGoals;
          awayTeam.ga += homeGoals;
          awayTeam.gd = awayTeam.gf - awayTeam.ga;
          if (awayGoals > homeGoals) awayTeam.pts += 3;
          else if (awayGoals === homeGoals) awayTeam.pts += 1;
        }
      }
    }
  }

  return groups;
}

function sortGroup(group: GroupTeam[]): GroupTeam[] {
  return [...group].sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts;
    return b.gd - a.gd;
  });
}

/**
 * Derive A1/C2/WC1/… / T1/T2 the same way as `app/page.tsx` so Fantrax can match
 * real team names before merging playoff weeks.
 */
export async function computePlayoffQualifiers(
  spreadsheetId: string,
  scheduleWithGroupStageScores: ScheduleGameweek[]
): Promise<PlayoffQualifiers | null> {
  const groups = await loadGroupsWithStatsFromSchedule(
    spreadsheetId,
    scheduleWithGroupStageScores
  );

  if (groups.length !== 3) return null;

  const sortedGroups = groups.map(sortGroup);
  if (sortedGroups.some((g) => g.length === 0)) return null;

  const A1 = sortedGroups[0][0]?.name || "A1";
  const A2 = sortedGroups[0][1]?.name || "A2";
  const B1 = sortedGroups[1][0]?.name || "B1";
  const B2 = sortedGroups[1][1]?.name || "B2";
  const C1 = sortedGroups[2][0]?.name || "C1";
  const C2 = sortedGroups[2][1]?.name || "C2";

  const thirdPlaceTeams = sortedGroups
    .map((group, groupIndex) => {
      if (group.length > 2) {
        return { ...group[2], groupIndex };
      }
      return null;
    })
    .filter((t): t is GroupTeam & { groupIndex: number } => t !== null);

  const wildcards = [...thirdPlaceTeams]
    .sort((a, b) => {
      if (b.pts !== a.pts) return b.pts - a.pts;
      return b.gd - a.gd;
    })
    .slice(0, 2)
    .map((t) => t.name);

  const WC1 = wildcards[0] || "WC1";
  const WC2 = wildcards[1] || "WC2";

  const leagueData = await getSheetData(spreadsheetId, "League Table!A2:B12");
  const leagueTable = leagueData
    .map((row, index) => ({
      name: String(row[1] || "").trim() || `Team ${index + 1}`,
      position: parseInt(String(row[0]), 10) || index + 1,
    }))
    .sort((a, b) => a.position - b.position);

  const T1 = leagueTable[0]?.name || "T1";
  const T2 = leagueTable[1]?.name || "T2";

  return { A1, A2, B1, B2, C1, C2, WC1, WC2, T1, T2 };
}

/** Replace sheet placeholders with resolved names (exact cell match, like the client). */
export function applyPlayoffQualifiersToSchedule(
  schedule: ScheduleGameweek[],
  q: PlayoffQualifiers
): ScheduleGameweek[] {
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
