import { NextResponse } from "next/server";
import { getSheetData } from "@/lib/googleSheets";

export async function GET() {
  try {
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    if (!spreadsheetId) {
      console.error("GOOGLE_SHEET_ID is not set");
      return NextResponse.json(
        { error: "Google Sheet ID not configured. Please set GOOGLE_SHEET_ID environment variable." },
        { status: 500 }
      );
    }

    // Check if credentials are available
    if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
      console.error("Google Sheets credentials are missing");
      return NextResponse.json(
        { error: "Google Sheets credentials not configured. Please set GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY environment variables." },
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
  } catch (error: any) {
    console.error("Error fetching league table:", error);
    return NextResponse.json(
      { 
        error: "Failed to fetch league table",
        message: error.message || "Unknown error",
        details: process.env.NODE_ENV === "development" ? error.toString() : undefined
      },
      { status: 500 }
    );
  }
}
