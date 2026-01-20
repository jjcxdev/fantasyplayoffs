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

    // Assuming groups are in sheets named "Group A", "Group B", "Group C"
    // Format: Team | Pts | GF | GA | GD
    const groups = [];
    const groupNames = ["A", "B", "C"];

    for (const groupName of groupNames) {
      const data = await getSheetData(
        spreadsheetId,
        `Group ${groupName}!A2:E4`
      );

      const group = data.map((row) => ({
        name: row[0] || "",
        pts: parseInt(row[1]) || 0,
        gf: parseInt(row[2]) || 0,
        ga: parseInt(row[3]) || 0,
        gd: parseInt(row[4]) || 0,
      }));

      groups.push(group);
    }

    return NextResponse.json(groups);
  } catch (error) {
    console.error("Error fetching groups:", error);
    return NextResponse.json(
      { error: "Failed to fetch groups" },
      { status: 500 }
    );
  }
}
