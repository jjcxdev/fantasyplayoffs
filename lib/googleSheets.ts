import { google } from "googleapis";

// Validate and format environment variables
const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
let privateKey = process.env.GOOGLE_PRIVATE_KEY;

// Handle private key formatting - Vercel stores environment variables as strings
// We need to replace escaped newlines with actual newlines
if (privateKey) {
  // Replace \\n with actual newlines (for Vercel environment variables)
  privateKey = privateKey.replace(/\\n/g, "\n");
  
  // Ensure the key is properly formatted
  // Remove any leading/trailing quotes that might have been added
  privateKey = privateKey.trim().replace(/^["']|["']$/g, "");
  
  // Verify the key has the proper structure
  if (!privateKey.includes("BEGIN") || !privateKey.includes("END")) {
    console.error("Private key format issue: missing BEGIN/END markers");
  }
} else {
  console.error("GOOGLE_PRIVATE_KEY is not set");
}

if (!clientEmail) {
  console.error("GOOGLE_SERVICE_ACCOUNT_EMAIL is not set");
}

// Create auth instance with proper error handling
let auth: any;
try {
  auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: clientEmail,
      private_key: privateKey || undefined,
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
} catch (error) {
  console.error("Error creating Google Auth:", error);
  throw error;
}

const sheets = google.sheets({ version: "v4", auth });

export async function getSheetData(
  spreadsheetId: string,
  range: string
): Promise<any[][]> {
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });

    return response.data.values || [];
  } catch (error) {
    console.error("Error fetching sheet data:", error);
    throw error;
  }
}
