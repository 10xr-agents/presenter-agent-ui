# Google OAuth Setup Guide

This guide provides detailed steps to set up Google OAuth authentication for the Screen Agent Platform.

## Overview

Google OAuth allows users to sign in to your application using their Google account. This requires creating OAuth credentials in the Google Cloud Console and configuring them in your application.

## Prerequisites

- A Google account (Gmail, Google Workspace, etc.)
- Access to Google Cloud Console (console.cloud.google.com)
- Your application's callback URL (typically `https://yourdomain.com/api/auth/callback/google`)

## Step-by-Step Instructions

### Step 1: Access Google Cloud Console

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Sign in with your Google account
3. If you don't have a project, create one:
   - Click the project dropdown at the top
   - Click "New Project"
   - Enter a project name (e.g., "Screen Agent Platform")
   - Click "Create"

### Step 2: Enable Google+ API

1. In the Google Cloud Console, navigate to **APIs & Services** > **Library**
2. Search for "Google+ API" or "People API"
3. Click on the API
4. Click **"Enable"** button

**Note**: For newer projects, Google recommends using the **People API** instead of Google+ API, but OAuth 2.0 works with either.

### Step 3: Configure OAuth Consent Screen

1. Navigate to **APIs & Services** > **OAuth consent screen**
2. Choose user type:
   - **External** (for users outside your organization) - Recommended for most applications
   - **Internal** (only for Google Workspace domains)
3. Click **"Create"**
4. Fill in the required information:

   **App Information:**
   - **App name**: Screen Agent Platform (or your app name)
   - **User support email**: Your email address
   - **App logo**: (Optional) Upload your app logo
   - **Application home page**: Your app URL (e.g., `https://yourdomain.com`)
   - **Application privacy policy link**: (Required for production) Your privacy policy URL
   - **Application terms of service link**: (Required for production) Your terms of service URL
   - **Authorized domains**: Your domain (e.g., `yourdomain.com`)

   **Developer contact information:**
   - **Email addresses**: Your email address

5. Click **"Save and Continue"**

6. **Scopes** (Optional - can skip for basic OAuth):
   - Click **"Add or Remove Scopes"**
   - For basic sign-in, the default scopes are usually sufficient:
     - `email`
     - `profile`
     - `openid`
   - Click **"Update"**
   - Click **"Save and Continue"**

7. **Test users** (For development/testing):
   - If your app is in "Testing" mode, add test user email addresses
   - These users can sign in before your app is published
   - Click **"Save and Continue"**

8. Review and click **"Back to Dashboard"**

### Step 4: Create OAuth 2.0 Credentials

1. Navigate to **APIs & Services** > **Credentials**
2. Click **"+ CREATE CREDENTIALS"** at the top
3. Select **"OAuth client ID"**

4. **Application type**: Select **"Web application"**

5. **Name**: Enter a name for your OAuth client (e.g., "Screen Agent Platform Web Client")

6. **Authorized JavaScript origins**:
   - Click **"+ ADD URI"**
   - Add your application URLs:
     - For development: `http://localhost:3000`
     - For production: `https://yourdomain.com`
   - Example:
     ```
     http://localhost:3000
     https://yourdomain.com
     ```

7. **Authorized redirect URIs**:
   - Click **"+ ADD URI"**
   - Add your OAuth callback URLs:
     - For development: `http://localhost:3000/api/auth/callback/google`
     - For production: `https://yourdomain.com/api/auth/callback/google`
   - Example:
     ```
     http://localhost:3000/api/auth/callback/google
     https://yourdomain.com/api/auth/callback/google
     ```

   **Important**: The redirect URI must match exactly, including:
   - Protocol (http/https)
   - Domain
   - Port (for localhost)
   - Path (`/api/auth/callback/google`)

8. Click **"Create"**

9. **Copy your credentials**:
   - A popup will appear with your **Client ID** and **Client Secret**
   - **Copy both values immediately** - the Client Secret will only be shown once
   - Click **"OK"** to close the popup

### Step 5: Configure Environment Variables

1. Open your `.env.local` file (create it if it doesn't exist by copying `.env.example`)

2. Add your Google OAuth credentials:

```bash
# Google OAuth
GOOGLE_CLIENT_ID=your-client-id-here.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret-here
```

3. **Replace the values**:
   - `your-client-id-here.apps.googleusercontent.com` - Your OAuth Client ID
   - `your-client-secret-here` - Your OAuth Client Secret

4. Save the file

5. **Restart your development server** if it's running:
   ```bash
   # Stop the server (Ctrl+C)
   # Start it again
   pnpm dev
   ```

### Step 6: Verify Configuration

1. Start your development server:
   ```bash
   pnpm dev
   ```

2. Navigate to your login/register page (e.g., `http://localhost:3000/login`)

3. Click the "Sign in with Google" button

4. You should be redirected to Google's OAuth consent screen

5. After granting permissions, you should be redirected back to your application

## Troubleshooting

### Common Issues

#### 1. "redirect_uri_mismatch" Error

**Problem**: The redirect URI doesn't match what's configured in Google Cloud Console.

**Solution**:
- Verify your `BETTER_AUTH_URL` environment variable matches your application URL
- Check that the redirect URI in Google Cloud Console exactly matches:
  - `{BETTER_AUTH_URL}/api/auth/callback/google`
- Ensure there are no trailing slashes or extra characters
- For localhost, include the port: `http://localhost:3000/api/auth/callback/google`

#### 2. "Access blocked: This app's request is invalid" Error

**Problem**: OAuth consent screen is not properly configured or app is in restricted mode.

**Solution**:
- Ensure OAuth consent screen is configured (Step 3)
- If app is in "Testing" mode, add your email as a test user
- Check that all required fields in OAuth consent screen are filled
- For production, ensure app is published and verified

#### 3. "Invalid client" Error

**Problem**: Client ID or Client Secret is incorrect.

**Solution**:
- Double-check that `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env.local` match the values from Google Cloud Console
- Ensure there are no extra spaces or characters
- Regenerate credentials in Google Cloud Console if needed

#### 4. OAuth Button Not Appearing

**Problem**: OAuth credentials are not configured or not loaded.

**Solution**:
- Verify environment variables are set in `.env.local`
- Restart your development server after adding environment variables
- Check server logs for configuration errors
- Ensure `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are not empty

#### 5. "The OAuth client was not found" Error

**Problem**: Client ID doesn't exist or belongs to a different project.

**Solution**:
- Verify you're using the correct Client ID from your Google Cloud Console project
- Check that the OAuth client is enabled
- Ensure you're using the correct Google Cloud project

### Verification Checklist

- [ ] Google Cloud project created
- [ ] Google+ API or People API enabled
- [ ] OAuth consent screen configured
- [ ] OAuth 2.0 Client ID created (Web application type)
- [ ] Authorized JavaScript origins configured (http://localhost:3000 for dev)
- [ ] Authorized redirect URIs configured (http://localhost:3000/api/auth/callback/google for dev)
- [ ] Client ID and Client Secret copied
- [ ] Environment variables added to `.env.local`
- [ ] Development server restarted
- [ ] OAuth button appears on login/register page
- [ ] Google OAuth flow works (redirects to Google and back)

## Production Setup

### Additional Steps for Production

1. **Verify Your Domain**:
   - Add your production domain to "Authorized domains" in OAuth consent screen
   - Add production URLs to "Authorized JavaScript origins"
   - Add production callback URL to "Authorized redirect URIs"

2. **Publish Your App** (if using External user type):
   - Navigate to **OAuth consent screen**
   - Click **"PUBLISH APP"** button
   - Complete any required verification steps
   - Note: Apps in "Testing" mode can only be used by test users

3. **Update Environment Variables**:
   ```bash
   # Production environment variables
   GOOGLE_CLIENT_ID=your-production-client-id.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=your-production-client-secret
   BETTER_AUTH_URL=https://yourdomain.com
   ```

4. **Use Different Credentials for Production** (Recommended):
   - Create separate OAuth client IDs for development and production
   - Use environment-specific values:
     - Development: `GOOGLE_CLIENT_ID` in `.env.local`
     - Production: `GOOGLE_CLIENT_ID` in production environment (Vercel, etc.)

## Security Best Practices

1. **Never commit credentials**:
   - Keep `.env.local` in `.gitignore`
   - Never commit `GOOGLE_CLIENT_ID` or `GOOGLE_CLIENT_SECRET` to version control

2. **Use environment-specific credentials**:
   - Separate OAuth clients for development and production
   - Different secrets for each environment

3. **Rotate secrets regularly**:
   - Periodically regenerate Client Secret
   - Update environment variables when rotating

4. **Restrict redirect URIs**:
   - Only add necessary redirect URIs
   - Remove unused redirect URIs
   - Use exact matches (no wildcards)

5. **Monitor usage**:
   - Check Google Cloud Console for suspicious activity
   - Review OAuth consent screen analytics
   - Set up alerts for unusual patterns

## Quick Reference

### Required Environment Variables

```bash
# Google OAuth (required for Google sign-in)
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
```

### Default Callback URL Pattern

```
{BETTER_AUTH_URL}/api/auth/callback/google
```

Example:
- Development: `http://localhost:3000/api/auth/callback/google`
- Production: `https://yourdomain.com/api/auth/callback/google`

### Where to Find Your Credentials

1. Google Cloud Console: https://console.cloud.google.com/
2. Navigate to: **APIs & Services** > **Credentials**
3. Find your OAuth 2.0 Client ID
4. Click to view details and reset secret if needed

## Additional Resources

- [Google OAuth 2.0 Documentation](https://developers.google.com/identity/protocols/oauth2)
- [Better Auth Google Provider Documentation](https://www.better-auth.com/docs/providers/google)
- [Google Cloud Console](https://console.cloud.google.com/)
- [OAuth 2.0 Playground](https://developers.google.com/oauthplayground/) (for testing)

## Support

If you encounter issues not covered in this guide:

1. Check the server logs for error messages
2. Review the troubleshooting section above
3. Check Google Cloud Console for any warnings or errors
4. Verify your Better Auth configuration matches the callback URL pattern
5. Consult Better Auth documentation for provider-specific issues

---

**Last Updated**: January 2025
**Platform**: Screen Agent Platform
**Version**: 1.0.0
