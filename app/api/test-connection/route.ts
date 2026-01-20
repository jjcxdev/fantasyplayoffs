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

    // Test by trying to get the first sheet's name
    const { google } = require("googleapis");
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      },
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });

    const sheets = google.sheets({ version: "v4", auth });
    
    // Get sheet metadata to see available sheets
    const metadata = await sheets.spreadsheets.get({
      spreadsheetId,
    });

    const sheetNames = metadata.data.sheets?.map((sheet: any) => sheet.properties.title) || [];

    return NextResponse.json({
      success: true,
      sheetId: spreadsheetId,
      availableSheets: sheetNames,
      message: "Connection successful!",
    });
  } catch (error: any) {
    console.error("Error testing connection:", error);
    return NextResponse.json(
      {
        error: "Failed to connect",
        message: error.message,
        details: error.toString(),
      },
      { status: 500 }
    );
  }
}
