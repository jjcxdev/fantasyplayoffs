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

    // Read the playoff bracket sheet
    // Try to read a larger range to see the structure
    const data = await getSheetData(spreadsheetId, "Playoff Bracket!A1:Z20");

    // Default fallback values
    const bracket = {
      gameweek31_32: {
        left: [
          ["A1", "C2"],
          ["C1", "B2"],
        ] as [string, string][],
        right: [
          ["B1", "A2"],
          ["WC1", "WC2"],
        ] as [string, string][],
      },
      gameweek33_34: {
        left: ["W A1/C2", "W C1/B2"] as [string, string],
        right: ["W B1/A2", "W WC1/WC2"] as [string, string],
      },
      gameweek35_36: {
        left: ["T1", "W A1/C2 / W C1/B2"] as [string, string],
        right: ["T2", "W B1/A2 / W WC1/WC2"] as [string, string],
      },
      final: ["Winner Left", "Winner Right"] as [string, string],
    };

    // Try to parse the data - this is a flexible parser
    // Adjust the row/column indices based on your sheet structure
    // Row 0 is the header row, so data starts at index 1
    
    // Game Week 31 & 32 - Left side (assuming first two matches in columns A-B, rows 2-3)
    if (data[1] && data[1][0] && data[1][1]) {
      bracket.gameweek31_32.left[0] = [data[1][0], data[1][1]];
    }
    if (data[2] && data[2][0] && data[2][1]) {
      bracket.gameweek31_32.left[1] = [data[2][0], data[2][1]];
    }

    // Game Week 31 & 32 - Right side (assuming matches in columns A-B, rows 5-6)
    if (data[4] && data[4][0] && data[4][1]) {
      bracket.gameweek31_32.right[0] = [data[4][0], data[4][1]];
    }
    if (data[5] && data[5][0] && data[5][1]) {
      bracket.gameweek31_32.right[1] = [data[5][0], data[5][1]];
    }

    // Game Week 33 & 34 - Left (assuming columns D-E, row 2)
    if (data[1] && data[1][3] && data[1][4]) {
      bracket.gameweek33_34.left = [data[1][3], data[1][4]];
    }

    // Game Week 33 & 34 - Right (assuming columns D-E, row 5)
    if (data[4] && data[4][3] && data[4][4]) {
      bracket.gameweek33_34.right = [data[4][3], data[4][4]];
    }

    // Game Week 35 & 36 - Left (assuming columns G-H, row 2)
    if (data[1] && data[1][6] && data[1][7]) {
      bracket.gameweek35_36.left = [data[1][6], data[1][7]];
    }

    // Game Week 35 & 36 - Right (assuming columns G-H, row 5)
    if (data[4] && data[4][6] && data[4][7]) {
      bracket.gameweek35_36.right = [data[4][6], data[4][7]];
    }

    // Final (assuming columns J-K, row 2)
    if (data[1] && data[1][9] && data[1][10]) {
      bracket.final = [data[1][9], data[1][10]];
    }

    return NextResponse.json(bracket);
  } catch (error) {
    console.error("Error fetching playoff bracket:", error);
    return NextResponse.json(
      { error: "Failed to fetch playoff bracket" },
      { status: 500 }
    );
  }
}
