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
