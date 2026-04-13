import { NextResponse } from "next/server";
import { getSheetData } from "@/lib/googleSheets";
import { loadMergedSchedule } from "@/lib/scheduleSheet";

export async function GET() {
  try {
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    if (!spreadsheetId) {
      return NextResponse.json(
        { error: "Google Sheet ID not configured" },
        { status: 500 }
      );
    }

    // First, get team names from Group sheets to know which teams are in which groups
    const groups: {
      name: string;
      pts: number;
      gf: number;
      ga: number;
      gd: number;
    }[][] = [];
    const groupNames = ["A", "B", "C"];
    const teamToGroupMap = new Map<string, number>(); // team name -> group index

    for (let groupIndex = 0; groupIndex < groupNames.length; groupIndex++) {
      const groupName = groupNames[groupIndex];
      const data = await getSheetData(
        spreadsheetId,
        `Group ${groupName}!A2:E4`
      );

      const group = data.map((row) => {
        const teamName = row[0] || "";
        // Map team name to group index
        teamToGroupMap.set(teamName, groupIndex);
        return {
          name: teamName,
          pts: 0, // Will calculate from schedule
          gf: 0,
          ga: 0,
          gd: 0,
        };
      });

      groups.push(group);
    }

    // Schedule from sheet + optional Fantrax scores (same as /api/schedule)
    const schedule = await loadMergedSchedule(spreadsheetId);

    for (const gw of schedule) {
      if (gw.gameweek < 25 || gw.gameweek > 30) continue;

      for (const match of gw.matches) {
        const home = match.home;
        const away = match.away;

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

        if (match.homeGoals === undefined || match.awayGoals === undefined) {
          continue;
        }

        const homeGoals = match.homeGoals;
        const awayGoals = match.awayGoals;

        if (homeGroupIndex !== undefined) {
          const homeTeam = groups[homeGroupIndex].find((t) => t.name === home);
          if (homeTeam) {
            homeTeam.gf += homeGoals;
            homeTeam.ga += awayGoals;
            homeTeam.gd = homeTeam.gf - homeTeam.ga;
            if (homeGoals > awayGoals) {
              homeTeam.pts += 3;
            } else if (homeGoals === awayGoals) {
              homeTeam.pts += 1;
            }
          }
        }

        if (awayGroupIndex !== undefined) {
          const awayTeam = groups[awayGroupIndex].find((t) => t.name === away);
          if (awayTeam) {
            awayTeam.gf += awayGoals;
            awayTeam.ga += homeGoals;
            awayTeam.gd = awayTeam.gf - awayTeam.ga;
            if (awayGoals > homeGoals) {
              awayTeam.pts += 3;
            } else if (awayGoals === homeGoals) {
              awayTeam.pts += 1;
            }
          }
        }
      }
    }

    return NextResponse.json(groups);
  } catch (error) {
    console.error("Error fetching groups:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch groups",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
