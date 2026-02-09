import { NextResponse } from "next/server";
import { getSheetData } from "@/lib/googleSheets";

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

    // Now fetch schedule to calculate stats from match results
    // Group stage matches are typically gameweeks 25-30 (before playoffs start at 31)
    const scheduleData = await getSheetData(spreadsheetId, "Schedule!A2:G200");

    // Process all matches and calculate stats for group stage (gameweeks 25-30)
    for (const row of scheduleData) {
      if (row.length < 4) continue;

      const gameweek = parseInt(row[1]); // Gameweek is in column B (index 1)
      if (isNaN(gameweek) || gameweek < 25 || gameweek > 30) continue; // Only group stage matches

      const home = row[2] || "";
      const away = row[3] || "";
      const homeGoalsStr = row[5]?.toString().trim();
      const awayGoalsStr = row[6]?.toString().trim();

      // Handle BYE matches: team playing BYE only gets GF counted, no points
      const isHomeBye = home === "BYE";
      const isAwayBye = away === "BYE";

      if (isHomeBye && isAwayBye) continue; // Skip BYE vs BYE

      // Find teams in groups
      const homeGroupIndex = teamToGroupMap.get(home);
      const awayGroupIndex = teamToGroupMap.get(away);

      // Handle case where home team plays against BYE
      if (isAwayBye && homeGroupIndex !== undefined) {
        const homeTeam = groups[homeGroupIndex].find((t) => t.name === home);
        if (homeTeam) {
          const homeGoals =
            homeGoalsStr && !isNaN(parseInt(homeGoalsStr))
              ? parseInt(homeGoalsStr)
              : 0;
          homeTeam.gf += homeGoals;
          // No points, no GA, just GF for BYE matches
          homeTeam.gd = homeTeam.gf - homeTeam.ga;
        }
        continue;
      }

      // Handle case where away team plays against BYE
      if (isHomeBye && awayGroupIndex !== undefined) {
        const awayTeam = groups[awayGroupIndex].find((t) => t.name === away);
        if (awayTeam) {
          const awayGoals =
            awayGoalsStr && !isNaN(parseInt(awayGoalsStr))
              ? parseInt(awayGoalsStr)
              : 0;
          awayTeam.gf += awayGoals;
          // No points, no GA, just GF for BYE matches
          awayTeam.gd = awayTeam.gf - awayTeam.ga;
        }
        continue;
      }

      // Regular match: both teams are real teams
      if (!homeGoalsStr || !awayGoalsStr) continue; // Skip if no scores

      const homeGoals = parseInt(homeGoalsStr);
      const awayGoals = parseInt(awayGoalsStr);

      if (isNaN(homeGoals) || isNaN(awayGoals)) continue;

      // Update stats for both teams
      if (homeGroupIndex !== undefined) {
        const homeTeam = groups[homeGroupIndex].find((t) => t.name === home);
        if (homeTeam) {
          homeTeam.gf += homeGoals;
          homeTeam.ga += awayGoals;
          homeTeam.gd = homeTeam.gf - homeTeam.ga;
          // Points: 3 for win, 1 for draw, 0 for loss
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
          // Points: 3 for win, 1 for draw, 0 for loss
          if (awayGoals > homeGoals) {
            awayTeam.pts += 3;
          } else if (awayGoals === homeGoals) {
            awayTeam.pts += 1;
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
