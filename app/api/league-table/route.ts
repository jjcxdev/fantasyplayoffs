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

    // Assuming league table is in a sheet named "League Table" starting at A1
    // Format: Position | Team Name
    const data = await getSheetData(spreadsheetId, "League Table!A2:B12");

    const leagueTable = data.map((row, index) => ({
      name: row[1] || `Team ${index + 1}`,
      position: parseInt(row[0]) || index + 1,
    }));

    return NextResponse.json(leagueTable);
  } catch (error) {
    console.error("Error fetching league table:", error);
    return NextResponse.json(
      { error: "Failed to fetch league table" },
      { status: 500 }
    );
  }
}
