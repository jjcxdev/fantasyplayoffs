# Deployment Guide

## Setting Up Environment Variables in Production

Your production environment needs the same environment variables as your local development. Here's how to set them up:

### For Vercel (Recommended for Next.js)

1. Go to your project on [Vercel Dashboard](https://vercel.com/dashboard)
2. Select your project (`fantasyplayoffs`)
3. Go to **Settings** → **Environment Variables**
4. Add the following three variables:

   **GOOGLE_SHEET_ID**

   - Value: Your Google Sheet ID (the long string from the sheet URL)
   - Example: `1_GppB2Qi3d2_BxyCHiNvaWCe0NuRJ41m-GZbJQ9o4CI`
   - Apply to: Production, Preview, and Development

   **GOOGLE_SERVICE_ACCOUNT_EMAIL**

   - Value: Your service account email
   - Example: `justinjchambers-gmail-com@playoffs2026.iam.gserviceaccount.com`
   - Apply to: Production, Preview, and Development

   **GOOGLE_PRIVATE_KEY**

   - Value: Your full private key (including BEGIN/END markers and newlines)
   - Important: Copy the entire key including `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----`
   - The key should include `\n` characters for newlines (Vercel will handle these)
   - Example:
     ```
     -----BEGIN PRIVATE KEY-----\nMIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQCjQyj2u+oJ6Hxc...\n-----END PRIVATE KEY-----\n
     ```
   - Apply to: Production, Preview, and Development

5. After adding all variables, **redeploy** your application:
   - Go to **Deployments** tab
   - Click the three dots (⋯) on the latest deployment
   - Select **Redeploy**

### For Other Platforms

#### Netlify

1. Go to Site settings → Environment variables
2. Add the three variables listed above
3. Redeploy

#### Railway

1. Go to Variables tab
2. Add the three variables listed above
3. Redeploy

#### Self-hosted / Docker

Add the variables to your `.env` file or environment configuration:

```bash
GOOGLE_SHEET_ID=your_sheet_id
GOOGLE_SERVICE_ACCOUNT_EMAIL=your_email@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

## Fantrax scores (optional)

The app can **fill in scores from Fantrax** so you don’t have to type them in the Schedule sheet. Your sheet defines **your own playoff pairings** (they do **not** need to match Fantrax’s H2H schedule). For each row we take the **home team’s Fantrax fantasy points for that scoring period** and the **away team’s** points for the same period—then your site shows those two numbers as the result of *your* matchup. Team names in the sheet should match Fantrax team names (trim / case-insensitive).

This uses Fantrax’s internal `fxpa/req` endpoint — the same one described in the unofficial **[FantraxAPI documentation](https://fantraxapi.kometa.wiki/en/latest/)** and implemented in Python on [GitHub](https://github.com/meisnate12/FantraxAPI). Fantrax does not publish a separate official public API spec; FantraxAPI documents how that internal API behaves (methods like `getStandings` / `getTeamRosterInfo`, private leagues via browser cookie, etc.).

### Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `FANTRAX_LEAGUE_ID` | To enable | League ID from your Fantrax URL (e.g. `https://www.fantrax.com/fantasy/league/THIS_PART/livescoring`). |
| `FANTRAX_EMAIL` + `FANTRAX_PASSWORD` | Alternative to cookie | Server calls Fantrax’s own `login` API (`POST /fxpa/req?lgnu=1`), then uses session cookies for score requests. **Treat like secrets** (Vercel env only, never commit). Session is cached ~25 minutes per server instance. |
| `FANTRAX_TFA_CODE` | If you use 2FA | Optional 6-digit code when Fantrax requires TFA (short-lived; prefer `FANTRAX_COOKIE` from the browser if TFA is always on). |
| `FANTRAX_COOKIE` | Optional override | If set, used instead of email/password. Paste browser `Cookie` header after logging in. |
| `FANTRAX_CLIENT_VERSION` | Rarely | Default `179.0.1` (Fantrax web `me.VERSION`). Bump if logins fail after a Fantrax deploy. |
| `FANTRAX_PERIOD_OFFSET` | Optional | If Fantrax “Period N” does not match your sheet’s “Gameweek” column, set offset so `Fantrax period = sheet gameweek - offset`. Default `0`. |
| `FANTRAX_LOG_SCORES` | Debug | Set to `1` to print **every team’s FP per Fantrax period** and merge details in **server** logs. In `next dev`, the same logging runs automatically (`NODE_ENV=development`). **Browser:** open DevTools → Console for `[schedule] Scores by gameweek` after each load. |

### How scores are applied

1. Server loads the Schedule sheet (fixtures + your gameweek numbers).
2. **League directory:** Fantrax `getTeamRosterInfo` (`view=GAMES_PER_POS`) returns every **`teamId` + name** in the league. That’s how we align Fantrax with your schedule strings (after placeholder resolution for `A1` / `WC1` / …).
3. **FPts per gameweek:** For each Fantrax scoring period (`gameweek − FANTRAX_PERIOD_OFFSET`), the server loads **each team’s roster** for that period: `getTeamRosterInfo` with `teamId` + `scoringPeriod` (or `period`) + `STATS` and `SCHEDULE_FULL` in one request (same as unofficial FantraxAPI). It **sums the roster SCORE column** → that team’s FP for the week. No `getStandings` — only team ids + roster stats, so behavior matches “FPts for this team this gameweek.”
4. **Playoff placeholders:** If the sheet uses `A1`, `C2`, `WC1`, `T1`, etc., the server resolves them to real team names (Groups A/B/C + League Table + wildcards) **before** name lookup.
5. For each **custom** matchup row, it looks up **home** and **away** in that period’s map. If both have FPts, it sets `homeGoals` / `awayGoals`. BYE rows use the single team’s score when found.
6. **Sheet vs Fantrax (not “sheet wins”):** When Fantrax returns a non-empty map for that period **and** both teams resolve, **Fantrax FP replaces** the sheet’s goal cells for that row. If the period has **no** Fantrax data (0 teams in the map) **or** either team fails lookup, the API keeps **whatever was parsed from the sheet** (columns **F = Home_Goals**, **G = Away_Goals** on `Schedule!A2:G200`). **`null` scores** mean: the sheet had **no numeric** goals in F/G for that row **and** Fantrax didn’t supply both sides—**not** that the app ignored Fantrax in favor of the sheet. With `FANTRAX_LOG_SCORES=1` or `next dev`, server logs show `parsed from sheet: …` next to Fantrax period key counts per row.

### Tips

- **Schedule columns** must stay aligned: `Match | Gameweek | Home | Away | ID | Home_Goals | Away_Goals` (A–G). If you insert a column, goals won’t read from the right cells.
- **Team names** in the sheet should match Fantrax team names (trimmed, case-insensitive). If they differ slightly, align the names in the sheet or on Fantrax.
- **Public leagues** may work with no cookie; **private** leagues usually need `FANTRAX_COOKIE` until/unless Fantrax changes auth.
- If scores never appear, check server logs for `Fantrax merge failed` and verify period numbers vs your sheet (try `FANTRAX_PERIOD_OFFSET`).

## Verifying the Setup

After deploying, you can test the connection by visiting:

- `https://your-domain.com/api/test-connection`

This should return a JSON response with available sheets if the connection is working.

## Troubleshooting

### "Google Sheet ID not configured" error

- Make sure `GOOGLE_SHEET_ID` is set in your production environment
- Verify the variable name is exactly `GOOGLE_SHEET_ID` (case-sensitive)

### Authentication errors

- Verify `GOOGLE_SERVICE_ACCOUNT_EMAIL` matches your service account
- Check that `GOOGLE_PRIVATE_KEY` includes the full key with BEGIN/END markers
- Ensure the service account has been shared with your Google Sheet with "Viewer" permissions

### "Failed to fetch" errors

- Check that the Google Sheet is shared with the service account email
- Verify the sheet structure matches what the API expects
- Check the browser console and server logs for specific error messages

### `ERR_OSSL_UNSUPPORTED` or `DECODER routines::unsupported` errors

This error means the private key format is incorrect. To fix:

1. **Check your private key format in Vercel:**
   - Go to Settings → Environment Variables
   - Edit `GOOGLE_PRIVATE_KEY`
   - The key should have actual newlines (press Enter between lines) OR use `\n` as literal characters
2. **Try pasting the key with actual newlines:**

   - Copy the entire private key from your JSON file (including BEGIN/END markers)
   - In Vercel's textarea, paste it as-is with the newlines preserved
   - Vercel's multi-line textarea should preserve the newlines

3. **If newlines don't work, use `\n` format:**

   - Convert all actual newlines to `\n` (backslash followed by n)
   - The entire key should be on one line with `\n` where newlines should be
   - Example: `-----BEGIN PRIVATE KEY-----\nMIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQCjQyj2u+oJ6Hxc\n...\n-----END PRIVATE KEY-----\n`

4. **Verify the key is complete:**

   - Make sure it starts with `-----BEGIN PRIVATE KEY-----` or `-----BEGIN RSA PRIVATE KEY-----`
   - Make sure it ends with `-----END PRIVATE KEY-----` or `-----END RSA PRIVATE KEY-----`
   - The key should be the complete key from your service account JSON file

5. **After updating, redeploy:**
   - Go to Deployments → Latest deployment → Redeploy
   - The new environment variables will be used in the new deployment
