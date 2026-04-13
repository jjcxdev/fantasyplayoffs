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

    // League Table: Position (A) | Team Name (B) | Abbreviation (C, optional)
    const data = await getSheetData(spreadsheetId, "League Table!A2:C12");

    const leagueTable = data.map((row, index) => {
      const name = String(row[1] ?? "").trim() || `Team ${index + 1}`;
      const abbrRaw = row[2];
      const abbr =
        abbrRaw != null && String(abbrRaw).trim() !== ""
          ? String(abbrRaw).trim()
          : undefined;
      return {
        name,
        position: parseInt(String(row[0]), 10) || index + 1,
        ...(abbr !== undefined ? { abbreviation: abbr } : {}),
      };
    });

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
