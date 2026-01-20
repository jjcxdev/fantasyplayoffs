# Google Sheets Setup Guide

This application uses Google Sheets as the data source. Follow these steps to set it up:

## 1. Create a Google Service Account

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Google Sheets API
4. Go to "IAM & Admin" > "Service Accounts"
5. Create a new service account
6. Download the JSON key file

## 2. Share Your Google Sheet

1. Open your Google Sheet
2. Click "Share" button
3. Add the service account email (from the JSON key file, it looks like `xxx@xxx.iam.gserviceaccount.com`)
4. Give it "Viewer" permissions
5. Copy the Sheet ID from the URL (the long string between `/d/` and `/edit`)

## 3. Set Up Environment Variables

Create a `.env.local` file in the root directory with:

```
GOOGLE_SHEET_ID=your_sheet_id_here
GOOGLE_SERVICE_ACCOUNT_EMAIL=your_service_account_email@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYour private key here\n-----END PRIVATE KEY-----\n"
```

## 4. Google Sheet Structure

Your Google Sheet should have the following sheets/tabs:

### League Table
- Sheet name: `League Table`
- Columns: Position | Team Name
- Starting from row 2 (row 1 is headers)

### Groups
- Sheet names: `Group A`, `Group B`, `Group C`
- Columns: Team | Pts | GF | GA | GD
- Starting from row 2 (row 1 is headers)
- 3 rows of data per group

### Schedule
- Sheet name: `Schedule`
- Columns: Gameweek | Home | Away
- Starting from row 2 (row 1 is headers)

### Playoff Bracket
- Sheet name: `Playoff Bracket`
- Structure this based on your bracket format
- The API route will need to be customized based on your sheet structure

## 5. Run the Application

```bash
npm run dev
```

The application will fetch data from your Google Sheet on page load.
