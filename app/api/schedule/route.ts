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

    // Assuming schedule is in a sheet named "Schedule"
    // Format: Match | Gameweek | Home | Away | ID | Home_Goals | Away_Goals
    const data = await getSheetData(spreadsheetId, "Schedule!A2:G200");

    const scheduleMap = new Map<number, { 
      home: string; 
      away: string; 
      id?: string;
      homeGoals?: number;
      awayGoals?: number;
    }[]>();

    for (const row of data) {
      if (row.length < 4) continue;

      const gameweek = parseInt(row[1]); // Gameweek is in column B (index 1)
      if (isNaN(gameweek)) continue;

      if (!scheduleMap.has(gameweek)) {
        scheduleMap.set(gameweek, []);
      }

      const homeGoalsStr = row[5]?.toString().trim();
      const awayGoalsStr = row[6]?.toString().trim();
      const homeGoals = homeGoalsStr && !isNaN(parseInt(homeGoalsStr)) ? parseInt(homeGoalsStr) : undefined;
      const awayGoals = awayGoalsStr && !isNaN(parseInt(awayGoalsStr)) ? parseInt(awayGoalsStr) : undefined;

      scheduleMap.get(gameweek)!.push({
        home: row[2] || "", // Home is in column C (index 2)
        away: row[3] || "", // Away is in column D (index 3)
        id: row[4] || undefined, // ID is in column E (index 4), optional
        homeGoals,
        awayGoals,
      });
    }

    const schedule = Array.from(scheduleMap.entries())
      .map(([gameweek, matches]) => ({
        gameweek,
        matches,
      }))
      .sort((a, b) => a.gameweek - b.gameweek);

    return NextResponse.json(schedule);
  } catch (error) {
    console.error("Error fetching schedule:", error);
    return NextResponse.json(
      { error: "Failed to fetch schedule" },
      { status: 500 }
    );
  }
}
