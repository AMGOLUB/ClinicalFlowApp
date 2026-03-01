# ClinicalFlow Website — Comprehensive Completion Spec

## What Already Exists (Audit)

The website is surprisingly complete. Here's what's built and working:

| Page | Status | Notes |
|------|--------|-------|
| `index.html` | ✅ Complete | Hero, features, templates, dental, modes, security, requirements, download, footer |
| `pricing.html` | ✅ Complete | 3-tier cards (Free/Pro/Team), billing toggle, comparison table, FAQ, enterprise banner |
| `docs.html` | ✅ Complete | Full sidebar documentation portal |
| `about.html` | ✅ Complete | Story, mission, values, team placeholder |
| `privacy-policy.html` | ✅ Complete | Comprehensive privacy policy |
| `terms-of-service.html` | ✅ Complete | Full terms of service |
| `signup.html` | 🟡 90% Done | 5 screens built (signup, email pending, plan select, success, error). Supabase auth wired. Needs backend connections. |
| `get-started.html` | ✅ Complete | Steps, download cards, analytics preview, ROI calculator |
| `styles.css` | ✅ Complete | Full design system with tokens, components, responsive |
| `docs.css` | ✅ Complete | Documentation-specific styles |
| `main.js` | ✅ Complete | Nav, scroll reveal, platform detection, stat animation |

---

## What's Missing — The Complete List

### Category 1: Supabase Backend Configuration

These are dashboard settings, not code changes. Required for the signup flow to actually work.

#### 1A. Email Verification Redirect URL

**Where:** Supabase Dashboard → Authentication → URL Configuration → Redirect URLs

**Add:**
- `https://clinicalflow.com/signup.html` (production)
- `http://localhost:3000/signup.html` (local development)
- `https://your-preview-domain.com/signup.html` (if using Vercel/Netlify previews)

Without this, clicking the email verification link will fail with "Redirect URL not allowed."

#### 1B. Email Templates

**Where:** Supabase Dashboard → Authentication → Email Templates

Customize the verification email so it looks like it's from ClinicalFlow, not generic Supabase:

- **From name:** ClinicalFlow
- **Subject:** Verify your ClinicalFlow account
- **Body:** Branded HTML email matching your design system (dark card, teal accent, ClinicalFlow logo). The template must include `{{ .ConfirmationURL }}` which Supabase replaces with the actual verification link.
- Also customize: Password reset email, Magic link email (if ever used)

#### 1C. Google OAuth Provider

**Where:** Supabase Dashboard → Authentication → Providers → Google

Your signup.html already has a "Continue with Google" button wired to `supabase.auth.signInWithOAuth()`. To make it work:

1. Create a Google Cloud project at console.cloud.google.com
2. Enable the Google Identity API
3. Create OAuth 2.0 credentials (Web application type)
4. Set authorized redirect URI to: `https://seuinmmslazvibotoupm.supabase.co/auth/v1/callback`
5. Copy the Client ID and Client Secret into Supabase's Google provider settings
6. Enable the Google provider toggle

If you don't want Google OAuth at launch, **hide the button** by adding `style="display:none"` to `#googleBtn` and the `.or-divider` in signup.html. Don't leave a broken button visible.

#### 1D. Site URL Configuration

**Where:** Supabase Dashboard → Authentication → URL Configuration → Site URL

Set to: `https://clinicalflow.com` (or wherever your site will be hosted)

This is used as the base URL for email links.

---

### Category 2: Database Setup

These migrations should already exist from your subscription spec (Phase A), but verify they're deployed:

#### 2A. `profiles` Table

Confirm the `handle_new_user()` trigger creates a profile with `status = 'pending_verification'` on signup. The signup.html plan selection screen saves `selected_plan` to the profile — **you need a `selected_plan` column** (type: `text`, nullable, no default) in the profiles table. Add this to your `001_profiles.sql` migration:

```sql
ALTER TABLE profiles ADD COLUMN selected_plan TEXT;
```

This column stores the user's plan preference (`pro_monthly`, `pro_annual`, `team_monthly`, `team_annual`) chosen during web signup, so the app knows which Stripe Checkout to create after they log in.

#### 2B. Email Verification Trigger

Confirm `handle_email_verified()` trigger exists and fires on `auth.users.email_confirmed_at` update, setting `status = 'trial'` and `trial_ends_at = now() + interval '14 days'`.

#### 2C. RLS Policy for `selected_plan`

The signup page writes to profiles (`sb.from('profiles').update({ selected_plan })`). The existing RLS policy must allow users to update their own row. Verify:

```sql
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);
```

---

### Category 3: Pricing Inconsistency Fix

**Critical:** Your pricing page and signup page show **different Team prices**.

| Location | Pro Monthly | Pro Annual | Team Monthly | Team Annual |
|----------|------------|------------|--------------|-------------|
| pricing.html | $25 | $21/mo ($250/yr) | **$19/seat** | **$16/seat ($190/seat/yr)** |
| signup.html | $25 | $21/mo ($250/yr) | **$19/seat** | **$16/seat ($190/seat/yr)** |
| Subscription spec | $25 | $21/mo ($250/yr) | **$20/seat** | **$17/seat ($200/seat/yr)** |

The subscription spec says $20/seat/month but the website says $19/seat/month. **Pick one and make it consistent everywhere.** The website prices ($19/seat) are already built into the HTML, so I'd recommend updating the subscription spec to match.

Also update these Stripe product prices to match whichever you choose:
- `STRIPE_PRICE_TEAM_MONTHLY` → $19/seat/mo OR $20/seat/mo
- `STRIPE_PRICE_TEAM_ANNUAL` → $190/seat/yr OR $200/seat/yr

---

### Category 4: Actual Download File

Every download button on the site (`index.html`, `get-started.html`, `pricing.html`) currently links to `#download` or has no `href`. **You need an actual downloadable .dmg file hosted somewhere.**

#### Options:

1. **GitHub Releases** (recommended for v1): Create a public or private GitHub repo, use GitHub Releases to host the .dmg. Link download buttons to `https://github.com/yourorg/clinicalflow/releases/latest/download/ClinicalFlow.dmg`. Free, reliable, supports versioning.

2. **Supabase Storage**: Upload the .dmg to a public Supabase bucket. Free tier includes 1 GB storage.

3. **Cloudflare R2 / AWS S3**: More scalable, but overkill for launch.

#### Changes needed:

- `index.html`: Update all `href="#download"` buttons to the actual download URL
- `get-started.html`: Update the macOS download card button `href`
- `pricing.html`: All "Get Started" / "Start Free Trial" buttons should go to `signup.html` (already correct)
- `signup.html` success screen: The "Download & Get Started" button links to `get-started.html` (already correct)

---

### Category 5: Contact / Email Links

#### 5A. Broken Email Links

The Team plan "Contact Us" button and Enterprise "Contact Sales" button on pricing.html have **Cloudflare email-obfuscated hrefs** (`/cdn-cgi/l/email-protection#...`). These only work when served through Cloudflare's proxy. If you're hosting on Vercel, Netlify, GitHub Pages, or anything else, these links are broken.

**Fix:** Replace with a real `mailto:` link:

```html
<!-- Team card -->
<a href="mailto:team@clinicalflow.com" class="btn btn--dark">Contact Us</a>

<!-- Enterprise banner -->
<a href="mailto:enterprise@clinicalflow.com" class="btn btn--primary btn--lg">Contact Sales</a>
```

Or, if you don't have these email addresses yet, create a contact form page or link to a Calendly/Cal.com scheduling link.

#### 5B. Set Up Email

You need a working email address for:
- Support inquiries (users who need help)
- Sales inquiries (team/enterprise leads from pricing page)
- Supabase sends verification and password reset emails "from" your configured sender

**Options:**
- **Google Workspace** ($7/user/month): support@clinicalflow.com, team@clinicalflow.com — professional, works with Google OAuth too
- **Zoho Mail** (free tier): 5 users free on your custom domain
- **Supabase custom SMTP**: Configure your own SMTP server in Supabase Dashboard → Authentication → SMTP Settings so verification emails come from `noreply@clinicalflow.com` instead of Supabase's default

---

### Category 6: Domain & Hosting

#### 6A. Custom Domain

If you don't already own `clinicalflow.com` (or similar), register one. Check availability.

#### 6B. Hosting

Your site is static HTML/CSS/JS with no server-side rendering. Options:

1. **Vercel** (recommended): Free tier, automatic HTTPS, GitHub integration, instant deploys. Just connect your repo and push.
2. **Netlify**: Same story, also free.
3. **GitHub Pages**: Free, simple, but no serverless functions.
4. **Cloudflare Pages**: Free, fastest CDN, but the email obfuscation suggests you may already be on Cloudflare.

#### 6C. HTTPS

Mandatory. All hosting options above provide free SSL certificates automatically.

---

### Category 7: Missing Pages

#### 7A. Account Management Page (`account.html`)

**Not yet built.** Users need a web-based way to:
- View their current plan and subscription status
- Manage billing (redirect to Stripe Customer Portal)
- View active devices (query `device_activations` via Supabase)
- Change their password (`supabase.auth.updateUser()`)
- Cancel their subscription (redirect to Stripe Portal)

This page requires authentication — on load, check `supabase.auth.getSession()`. If no session, redirect to signup.html or show a login form.

#### 7B. Password Reset Page (`reset-password.html`)

**Not yet built.** When a user clicks "Forgot password" in the app, it opens the browser to this page. Supabase sends a password reset email with a link back to this page (with tokens in the URL hash).

The page needs:
1. Parse `window.location.hash` for access_token (same pattern as signup.html's verification handler)
2. Call `supabase.auth.setSession()` with the tokens
3. Show a "New password" + "Confirm password" form
4. On submit, call `supabase.auth.updateUser({ password: newPassword })`
5. Show success message: "Password updated. Return to ClinicalFlow and log in."

Style it identically to signup.html (same card, same design tokens).

#### 7C. Login Page (`login.html`) — Optional

Right now, login only happens in the app. But having a web login page enables:
- Users to access account.html
- Password reset flow to redirect somewhere useful
- Future web dashboard features

A simple page with email/password fields calling `supabase.auth.signInWithPassword()`, redirecting to `account.html` on success.

---

### Category 8: SEO & Meta

#### 8A. Missing Favicons

All pages use an inline SVG favicon (`data:image/svg+xml,...`). This works but:
- Add a proper `favicon.ico` file (for older browsers)
- Add Apple Touch Icon for iOS bookmarks: `<link rel="apple-touch-icon" href="apple-touch-icon.png">`
- Add `favicon-32x32.png` and `favicon-16x16.png`

Generate these from your logo using realfavicongenerator.net.

#### 8B. Open Graph Images

All pages have `og:title` and `og:description` but are **missing `og:image`**. When someone shares your link on LinkedIn, Twitter, or Slack, there's no preview image.

Create a 1200×630px OG image (your logo + tagline on the dark background) and add to every page:

```html
<meta property="og:image" content="https://clinicalflow.com/og-image.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="https://clinicalflow.com/og-image.png">
```

#### 8C. Sitemap & Robots.txt

Create:

**`robots.txt`:**
```
User-agent: *
Allow: /
Sitemap: https://clinicalflow.com/sitemap.xml
```

**`sitemap.xml`:**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://clinicalflow.com/</loc><priority>1.0</priority></url>
  <url><loc>https://clinicalflow.com/pricing.html</loc><priority>0.9</priority></url>
  <url><loc>https://clinicalflow.com/signup.html</loc><priority>0.9</priority></url>
  <url><loc>https://clinicalflow.com/get-started.html</loc><priority>0.8</priority></url>
  <url><loc>https://clinicalflow.com/docs.html</loc><priority>0.8</priority></url>
  <url><loc>https://clinicalflow.com/about.html</loc><priority>0.6</priority></url>
  <url><loc>https://clinicalflow.com/privacy-policy.html</loc><priority>0.3</priority></url>
  <url><loc>https://clinicalflow.com/terms-of-service.html</loc><priority>0.3</priority></url>
</urlset>
```

#### 8D. Google Analytics / Plausible

Add privacy-respecting analytics to understand traffic. **Plausible** ($9/month) is HIPAA-friendly and doesn't use cookies. Add one script tag to every page:

```html
<script defer data-domain="clinicalflow.com" src="https://plausible.io/js/script.js"></script>
```

Or use **Google Analytics 4** (free) if HIPAA compliance isn't a concern for the marketing site (it's separate from the app, which handles PHI).

---

### Category 9: Signup → App Flow Completion

The full end-to-end flow has a gap between "user selects plan on website" and "app knows which plan they selected."

#### Current flow (what's built):
1. User signs up on signup.html → Supabase creates account
2. User verifies email → `handle_email_verified()` activates trial
3. User selects plan → `selected_plan` saved to profiles table
4. User clicks "Download & Get Started" → goes to get-started.html
5. User downloads app, opens it, logs in
6. **GAP:** App doesn't read `selected_plan` from the profile

#### What the app needs to do (add to subscription.js):
After login + license verification succeeds, check if `profile.selected_plan` exists and `profile.status === 'trial'`:
- If yes → show a subtle banner: "You selected the Pro plan. You'll be billed $25/month after your trial ends." Or optionally auto-trigger Stripe Checkout so they enter payment info during trial (they won't be charged until day 15).
- If no → user signed up but didn't select a plan. That's fine, they're on a trial.

This is an app-side change, not a website change. Note it for the subscription spec.

---

### Category 10: Legal Compliance

#### 10A. Cookie Banner

Your site loads Google Fonts (third-party request) and will load analytics. Under GDPR, you may need a cookie consent banner. If you use Plausible (no cookies), you can skip this. If you use Google Analytics, you need one.

Simple solution: Add a lightweight cookie banner that only loads GA after consent. Libraries: `cookie-consent` or `vanilla-cookieconsent`.

#### 10B. Terms of Service — Subscription Terms

Your ToS exists but verify it covers:
- Subscription billing, cancellation, and refund policy
- Free trial terms (auto-expiry, no auto-charge)
- Data handling when subscription expires (data stays local, app locks)
- API key responsibility (users pay Deepgram/Anthropic separately)

#### 10C. BAA Page

If you're marketing to healthcare providers, consider adding a page (or section in docs) explaining how to obtain BAAs from Deepgram and Anthropic for HIPAA compliance. ClinicalFlow itself doesn't need a BAA (no PHI on your servers), but users need BAAs with the cloud services they use through the app.

---

### Category 11: Performance & Polish

#### 11A. Image Optimization

You mentioned "minus the photos" — when you add them:
- Use WebP format (30-40% smaller than JPEG)
- Add `loading="lazy"` to all images below the fold
- Include `width` and `height` attributes to prevent layout shift
- Use `<picture>` element with srcset for responsive images

#### 11B. Font Loading

Your pages load DM Sans and JetBrains Mono from Google Fonts. Add `font-display: swap` to prevent invisible text during load (Google Fonts already does this by default with the `display=swap` parameter, which you have).

#### 11C. Preload Critical Assets

Add to the `<head>` of index.html:
```html
<link rel="preload" href="styles.css" as="style">
<link rel="preload" href="main.js" as="script">
```

---

## Implementation Priority Order

### Phase 1 — Launch Blockers (must fix before going live)

1. **Decide on Team pricing** ($19 or $20) and make it consistent everywhere
2. **Fix email obfuscation links** on pricing.html (Team "Contact Us" + Enterprise "Contact Sales")
3. **Set up Supabase email redirect URLs** so verification actually works
4. **Set up Google OAuth OR hide the button** — broken OAuth is worse than no OAuth
5. **Host the .dmg file** somewhere and update all download button hrefs
6. **Register domain** and deploy the site
7. **Set Supabase Site URL** to your production domain
8. **Add `selected_plan` column** to profiles table migration

### Phase 2 — Important But Not Blocking Launch

9. Customize Supabase email templates (branded verification emails)
10. Build `reset-password.html` (needed for "Forgot password" in the app)
11. Build `account.html` (users need to manage billing somewhere)
12. Set up custom SMTP for Supabase (emails from your domain, not Supabase's)
13. Set up support email address (support@clinicalflow.com)
14. Add OG images to all pages
15. Create sitemap.xml and robots.txt

### Phase 3 — Polish

16. Proper favicons (PNG + ICO + Apple Touch Icon)
17. Analytics (Plausible or GA4)
18. Cookie banner (if using GA4)
19. Image optimization when photos are added
20. Build `login.html` for web-based account access
21. Preload critical assets
22. Test entire signup → verify → plan select → download → app login flow end-to-end

---

## End-to-End User Journeys (Expanded)

### Journey A: New User — Email Signup (Primary Path)

#### Phase 1: Discovery → Website

| Step | User Action | What Happens | Where |
|------|------------|--------------|-------|
| A1 | Doctor finds ClinicalFlow via Google search, colleague referral, medical forum, or ad | Lands on `index.html` | Browser |
| A2 | Scrolls through hero, features, templates, dental charting, security sections | `main.js` runs scroll-reveal animations, stat counters animate on intersection, platform detection highlights their OS on download cards | `index.html` |
| A3 | Clicks "Pricing" in nav | Views 3-tier pricing cards (Free Trial / Pro / Team), billing toggle switches between monthly and annual, FAQ accordion answers common questions | `pricing.html` |
| A4 | Clicks "Sign Up Free" button (in nav, hero, or pricing CTA) | Navigates to signup page | `signup.html` |

#### Phase 2: Account Creation → Email Verification

| Step | User Action | What Happens | Where |
|------|------------|--------------|-------|
| A5 | Sees Screen 1: signup form with Google OAuth + email/password fields | Page loads with slideUp animation. Trust signals visible at bottom: "AES-256 encrypted · HIPAA-aligned · Data stays on your device" | `signup.html` Screen 1 |
| A6 | **Option A:** Clicks "Continue with Google" | `supabase.auth.signInWithOAuth({ provider: 'google' })` fires → redirects to Google consent screen → Google authenticates → redirects back to `signup.html` with tokens in URL hash → `handleRedirect()` detects tokens → calls `setSession()` → email auto-verified (Google accounts are pre-verified) → skips Screen 2 → goes directly to `showPostVerification()` | Google → `signup.html` |
| A6 | **Option B:** Fills out Full Name, Email, Password, Confirm Password | Password strength meter updates on every keystroke (red → orange → yellow → green). Confirm password shows "Passwords match" ✓ or "Passwords do not match" ✗ in real-time. | `signup.html` Screen 1 |
| A7 | Clicks "Create Account" | Client-side validation runs: name required, email format, password ≥8 chars, strength ≥ level 2 ("Fair"), passwords match. If any fail → red error box slides in below button. If all pass → button shows spinner "Creating account…" → `supabase.auth.signUp()` fires with `emailRedirectTo` pointing back to this page. Supabase creates `auth.users` row → `handle_new_user()` trigger fires → creates `profiles` row with `status = 'pending_verification'`, generates `license_key` (v4 UUID), sets no `trial_ends_at` yet. | `signup.html` → Supabase |
| A8 | Sees Screen 2: "Check your email" with animated envelope | `_email` stored in JS memory. Email displayed in teal highlight. Supabase has sent a verification email to the user's address with a link containing tokens. | `signup.html` Screen 2 |
| A9 | Opens their email inbox | Finds email from ClinicalFlow (or Supabase default if custom SMTP not configured). Subject: "Verify your ClinicalFlow account". Body contains a verification link pointing to `signup.html` with `#access_token=...&refresh_token=...&type=signup` in the URL hash. | Email client |
| A10 | Clicks verification link in email | Browser opens `signup.html#access_token=...&refresh_token=...&type=signup`. On page load, `handleRedirect()` runs → detects `access_token` in hash → parses tokens with `URLSearchParams(hash.substring(1))` → calls `supabase.auth.setSession({ access_token, refresh_token })` → Supabase validates tokens and marks `auth.users.email_confirmed_at = now()` → this triggers `handle_email_verified()` on the profiles table → sets `status = 'trial'` and `trial_ends_at = now() + 14 days` → `history.replaceState()` cleans the URL → calls `showPostVerification()`. | Browser → `signup.html` → Supabase DB |

**Edge cases at this stage:**
- User enters email that already exists → Supabase returns error "User already registered" → error box shows
- User's password is too weak → client-side validation catches at strength < 2 → "Please choose a stronger password"
- User never receives email → clicks "Resend email" button → `supabase.auth.resend({ type: 'signup', email })` fires → button shows "Sent! Check your inbox." → 30-second cooldown before re-enable
- Verification link expires (default: 24 hours) → `setSession()` fails → Screen 5 (error) shows "The link may have expired" → "Try Again" button returns to Screen 1
- User clicks verification link on their phone instead of desktop → still works, signup.html is responsive, they'll see the plan selection on mobile and download on desktop later

#### Phase 3: Plan Selection → Download

| Step | User Action | What Happens | Where |
|------|------------|--------------|-------|
| A11 | Sees Screen 3: "Choose your plan" with Pro and Team cards | `showPostVerification()` checks if `profile.selected_plan` already exists → if yes, skips to Screen 4 (success). If no, shows plan selection. Billing toggle defaults to Monthly. "You won't be charged during your 14-day free trial" reassurance text visible. | `signup.html` Screen 3 |
| A12 | Toggles Monthly ↔ Annual billing | `planSwitch` click handler fires → toggles `.annual` class → updates all `[data-monthly]` and `[data-annual]` elements → Pro shows $25/mo vs $21/mo ($250/yr), Team shows $19/seat vs $16/seat ($190/seat/yr). If a plan was already selected, `_selectedPlan` key updates to the annual variant. | `signup.html` Screen 3 |
| A13 | Clicks a plan card (Pro or Team) | Card gets `.selected` class → teal border + checkmark badge appears → `_selectedPlan` set to `pro_monthly`, `pro_annual`, `team_monthly`, or `team_annual` depending on toggle state → "Continue to Download" button enables. | `signup.html` Screen 3 |
| A14 | Clicks "Continue to Download" | Button shows spinner "Saving…" → `supabase.auth.getSession()` retrieves current session → `supabase.from('profiles').update({ selected_plan: _selectedPlan })` saves the plan preference to the database → transitions to Screen 4. **NOTE:** This does NOT create a Stripe subscription or charge anything. It only records intent. Actual billing happens later in the app. | `signup.html` Screen 3 → Supabase DB |
| A15 | Sees Screen 4: "You're all set!" with animated checkmark | SVG checkmark draws itself (stroke-dasharray animation). Two buttons: "Download & Get Started" (primary, links to get-started.html) and "Already have ClinicalFlow? Launch App" (outline, attempts `clinicalflow://login` deep link). | `signup.html` Screen 4 |
| A16 | **Option A:** Clicks "Download & Get Started" | Navigates to `get-started.html` → sees 3-step guide (Create Account ✓, Download App, Start Documenting) → download section with macOS card (platform auto-detected, highlighted with "✓ Your platform" badge). | `get-started.html` |
| A16 | **Option B:** Clicks "Launch App" (already installed) | `window.location.href = 'clinicalflow://login'` fires → if ClinicalFlow is installed and registered the custom URL scheme, the app opens. If not, after 1.5 seconds an alert says "Open the ClinicalFlow app from your Applications folder and log in." | Browser → App (if installed) |
| A17 | Clicks macOS download button | `.dmg` file downloads from the hosted URL (GitHub Releases, Supabase Storage, etc.). User opens .dmg → drags ClinicalFlow to Applications. | `get-started.html` → Finder |

**Edge cases at this stage:**
- User skips plan selection entirely (closes browser after email verification) → `selected_plan` stays null in database → that's fine, app treats them as trial user with no plan preference, they'll choose when trial expires
- User selects Team plan → `selected_plan = 'team_monthly'` saved → when they eventually subscribe in the app, the checkout creates a Team subscription with seat selector
- User on Windows/Linux → download section shows macOS as "✓ Your platform" only on Mac → Windows and Linux cards show "Coming Soon" with disabled buttons

#### Phase 4: App First Launch → Trial Active

| Step | User Action | What Happens | Where |
|------|------------|--------------|-------|
| A18 | Opens ClinicalFlow for the first time | `_initTauri` runs → app checks for `session.json` → doesn't exist (first launch) → subscription gate appears showing login form + "Create Free Account" button. | ClinicalFlow app |
| A19 | Enters email and password (same credentials from website signup) | `supabase.auth.signInWithPassword({ email, password })` fires → Supabase authenticates → returns `access_token`, `refresh_token`, and user object → app calls `verify-license` Edge Function with `license_key` from profile + `device_hash` (SHA-256 of hostname:username) + `device_name` (human-readable). | App → Supabase → Edge Function |
| A20 | (Automatic) License verification | `verify-license` looks up profile by `license_key` → status is `'trial'` → checks `trial_ends_at` → still within 14 days → upserts device activation (records this Mac as an active device) → encrypts license blob (AES-256-GCM) with `valid_until = now() + 24h` → returns `{ valid: true, status: 'trial', tier: 'pro', days_remaining: 14, license_blob: '...' }`. App receives response → writes `session.json` (encrypted with compiled-in `SESSION_KEY`): stores tokens, license blob, cached status, trial end date. | Edge Function → App |
| A21 | Sees PIN setup screen | Session is valid → app shows "Create a PIN" screen. User enters 4-8 digit PIN → Argon2id hash generated → stored in `auth.json`. PIN also derives the key for `config.json` encryption. | App |
| A22 | Completes welcome wizard | 4-screen wizard: Choose Language (37 options) → Choose Mode (Online/Offline) → API Key Setup (Deepgram + Anthropic for online, or Whisper + Ollama test for offline) → "You're All Set" with keyboard shortcuts. Settings saved to encrypted `config.json`. `welcomeCompleted` flag set. | App |
| A23 | Starts using ClinicalFlow | Full app loads: three-panel layout (sidebar, transcript, note panel). User can start recording, transcribing, and generating notes immediately. Trial badge visible in UI. | App |

**Edge cases at this stage:**
- User enters wrong password → Supabase returns 400 "Invalid login credentials" → error shown in login form
- User hasn't verified email yet → `verify-license` returns `{ valid: false, reason: 'Please verify your email' }` → subscription gate shows "Please verify your email before logging in" with a resend link
- User is offline on first launch → can't authenticate → login form shows network error → must connect to internet for initial login
- Token expired between signup.html and app launch (>1 hour gap) → app uses `refresh_token` to get new `access_token` automatically → transparent to user

#### Phase 5: Trial Period (Days 1–14)

| Step | User Action | What Happens | Where |
|------|------------|--------------|-------|
| A24 | Uses ClinicalFlow normally for days 1-10 | Every app launch: checks `last_verified` timestamp → if >24 hours, calls `verify-license` again → gets fresh license blob → updates `session.json`. If offline, decrypts cached blob → checks `valid_until` → if not expired (within 24h of last verify), allows access. If `valid_until` passed but within 30-day grace, allows access with warning. | App |
| A25 | Day 11: launches app | After license check, app reads `trial_ends_at` from cached session → calculates 3 days remaining → shows toast notification: "Your free trial ends in 3 days. Upgrade to keep using ClinicalFlow." Toast appears once per day (tracked by `last_trial_warning` timestamp in session). | App |
| A26 | Day 13: launches app | Same check → 1 day remaining → persistent banner (not just toast): "Trial ends tomorrow — subscribe to keep using ClinicalFlow." | App |
| A27 | Day 14: launches app | `verify-license` returns `{ valid: false, status: 'expired', reason: 'Trial expired' }` → subscription gate appears → shows plan options with "Subscribe" buttons → user can no longer access the main app until they subscribe. | App |

**What happens to their data when trial expires:**
- All patient data (transcripts, notes, dental charts, archives) stays on their device, encrypted with their PIN
- They cannot access it because the subscription gate blocks before PIN entry
- If they subscribe later, all data is still there — nothing deleted
- If they never subscribe, data persists indefinitely on disk but is inaccessible through the app

---

### Journey B: New User — Google OAuth (Faster Path)

Same as Journey A except:
- Step A6: User clicks "Continue with Google" instead of filling form
- Steps A7-A10 are **skipped entirely** — Google accounts are pre-verified, no email verification needed
- `handleRedirect()` detects Google OAuth tokens in the URL hash → `setSession()` → Supabase marks email as verified immediately → `handle_email_verified()` fires → trial starts → goes directly to plan selection (Screen 3)
- Total time from clicking "Sign Up" to selecting a plan: ~15 seconds (vs ~2-5 minutes for email flow)

---

### Journey C: Returning User — Normal App Launch

| Step | User Action | What Happens | Where |
|------|------------|--------------|-------|
| C1 | Opens ClinicalFlow | `_initTauri` → reads `session.json` → decrypts with `SESSION_KEY` → finds valid tokens and license blob | App |
| C2 | (Automatic) Token + license check | Checks `last_verified`: if <24h, uses cached license blob (decrypts, checks `valid_until`, allows access). If >24h, calls `verify-license` with cached `license_key` → gets fresh blob → updates `session.json`. If 401 on API call → tries `refresh_token` → if success, retries with new token. If refresh also expired → clears `session.json` → shows login form. | App → Supabase |
| C3 | Enters PIN | PIN verified via Argon2id → derives key → decrypts `config.json` → loads all settings → syncs session data into config → main app loads | App |
| C4 | Uses app | Normal workflow: record, transcribe, generate notes, export | App |

**Time from launch to working: ~3 seconds** (session.json read + PIN entry + config decrypt)

---

### Journey D: Trial Expired → Subscribe

| Step | User Action | What Happens | Where |
|------|------------|--------------|-------|
| D1 | Opens app after trial expires | `verify-license` returns expired → subscription gate shows with plan cards and "Subscribe" buttons | App |
| D2 | Selects Pro Monthly ($25/mo) and clicks Subscribe | App calls `create-checkout` Edge Function with `{ plan: 'pro_monthly' }` + Bearer token → Edge Function gets/creates Stripe customer → creates Checkout Session → returns `{ url }` → app opens URL in default browser | App → Browser |
| D3 | Sees Stripe Checkout page | Stripe-hosted payment form: card number, expiry, CVC, billing address. Stripe handles all PCI compliance. ClinicalFlow never sees card details. | Stripe Checkout |
| D4 | Enters payment and clicks "Subscribe" | Stripe processes payment → fires `checkout.session.completed` webhook → your `stripe-webhook` Edge Function receives it → updates profile: `status = 'active'`, stores `stripe_subscription_id`, `stripe_price_id`, sets `subscription_ends_at` to period end, determines `tier = 'pro'` from price ID → logs event to `subscription_events`. Stripe redirects browser to a success URL (configure this to `get-started.html` or a thank-you page). | Stripe → Supabase DB |
| D5 | Returns to app | App has been polling or user manually triggers refresh → calls `verify-license` → profile now shows `status = 'active'` → returns valid license blob → subscription gate dismisses → PIN screen appears → full access restored | App |

**Edge case:** User starts checkout but abandons (closes Stripe page without paying) → no webhook fires → profile stays expired → user sees gate again on next app launch.

**Edge case:** Payment fails (insufficient funds, expired card) → Stripe fires `invoice.payment_failed` webhook → profile status set to `past_due` → app shows "Payment failed" warning but still allows access (grace period until next retry).

---

### Journey E: Active Subscriber — Monthly Renewal

| Step | What Happens | Where |
|------|------------|-------|
| E1 | 30 days after initial payment | Stripe automatically charges the saved card → fires `invoice.paid` webhook → `stripe-webhook` Edge Function updates `subscription_ends_at` to new period end, confirms `status = 'active'` | Stripe → Supabase |
| E2 | Next app launch | `verify-license` returns active → no interruption → user continues normally | App |

User never sees or interacts with the renewal. It's fully automatic.

---

### Journey F: Subscriber → Cancel

| Step | User Action | What Happens | Where |
|------|------------|--------------|-------|
| F1 | Opens Settings → Account → Manage Subscription | App calls `customer-portal` Edge Function → returns Stripe Billing Portal URL → opens in browser | App → Browser |
| F2 | Clicks "Cancel subscription" in Stripe Portal | Stripe sets `cancel_at_period_end = true` → fires `customer.subscription.updated` webhook → Edge Function updates profile: status stays `active` but records cancellation intent. **User keeps full access until the paid period ends.** | Stripe → Supabase |
| F3 | Continues using app until period end | App shows subtle notice: "Your subscription ends on [date]" in account settings. Full functionality continues. | App |
| F4 | Period ends | Stripe fires `customer.subscription.deleted` webhook → Edge Function sets `status = 'expired'`, clears `stripe_subscription_id` → next `verify-license` returns expired → subscription gate appears | Stripe → Supabase → App |
| F5 | User can re-subscribe anytime | Same flow as Journey D (trial expired → subscribe). All local data preserved. | App |

---

### Journey G: Team Plan Signup

| Step | User Action | What Happens | Where |
|------|------------|--------------|-------|
| G1 | Practice manager creates account on signup.html | Same as Journey A steps A5-A10 | `signup.html` |
| G2 | Selects Team plan with Annual billing | `_selectedPlan = 'team_annual'` saved to profiles table | `signup.html` Screen 3 |
| G3 | Opens app → logs in → trial active | Same as A18-A23, but `selected_plan = 'team_annual'` is stored | App |
| G4 | Trial expires → subscribes to Team plan | `create-checkout` called with `{ plan: 'team_annual', seats: 5 }` → Stripe creates subscription with `quantity: 5` at $16/seat/mo ($190/seat/yr × 5 = $950/yr) → checkout completes → webhook fires → profile updated with `tier = 'team'`, `seats = 5` | App → Stripe → Supabase |
| G5 | Each provider creates their own account | Each doctor goes to signup.html → creates account → verifies email → downloads app → logs in. Their accounts are independent — each has their own `profiles` row, own `license_key`, own local data. | `signup.html` → App |
| G6 | Practice manager adds providers to their team | **This is a gap in the current architecture.** Right now, Team pricing charges per-seat on one Stripe subscription, but there's no "team" object linking multiple profiles together. Each provider is independent. The seat count is enforced by `device_activations` — if the team has 5 seats, only 5 devices can be active within a 30-day window. **For v1, this means the practice manager needs to share their `license_key` with each provider, and each provider enters it during app login.** For v2, build a proper team management dashboard (invite by email, admin panel, etc.). |
| G7 | Device activation | Each provider's device registers via `device_hash`. If provider #6 tries to log in but only 5 seats are purchased → `verify-license` returns `{ valid: false, reason: 'Seat limit reached' }` → app shows "Your team has used all available seats. Contact your administrator." | App → Edge Function |

---

### Journey H: Password Reset

| Step | User Action | What Happens | Where |
|------|------------|--------------|-------|
| H1 | In the app, user clicks "Forgot password?" on login screen | App calls `window.__TAURI__.shell.open('https://clinicalflow.com/reset-password.html')` → opens browser to reset password page | App → Browser |
| H2 | Enters their email on reset-password.html | Page calls `supabase.auth.resetPasswordForEmail(email, { redirectTo: 'https://clinicalflow.com/reset-password.html' })` → Supabase sends a password reset email | `reset-password.html` |
| H3 | Clicks link in reset email | Browser opens `reset-password.html#access_token=...&type=recovery` → page parses hash → calls `setSession()` → shows "Enter new password" form | Email → `reset-password.html` |
| H4 | Enters new password + confirm | Page calls `supabase.auth.updateUser({ password: newPassword })` → Supabase updates the password → page shows "Password updated! Return to ClinicalFlow and log in." | `reset-password.html` → Supabase |
| H5 | Returns to app | Enters email + new password → logs in normally | App |

---

### Journey I: PIN Reset (Nuclear Option)

| Step | User Action | What Happens | Where |
|------|------------|--------------|-------|
| I1 | User forgot their PIN | On PIN entry screen, clicks "Reset PIN" | App |
| I2 | Confirms the destructive action | App shows warning: "Resetting your PIN will permanently delete all local data (transcripts, notes, archives). Your account and subscription will not be affected." User must confirm. | App |
| I3 | PIN reset executes | `auth.rs` `reset_pin` command: deletes `auth.json` (PIN hash), deletes `config.json` (all settings + encrypted data), deletes all session archives, deletes `session.json`. The user's Supabase account, subscription status, and Stripe billing are all untouched — those live server-side. | App (local files only) |
| I4 | App restarts fresh | Login screen appears → user logs in with email/password → verify-license confirms subscription still active → sets up new PIN → welcome wizard runs → starts fresh with no local data | App |

---

### Data Flow Diagram

```
WEBSITE                          SUPABASE                         APP
─────────                        ────────                         ───
signup.html                      auth.users                       session.json (encrypted)
  │                                │                                │
  ├─signUp()─────────────────────►│ creates user                   │
  │                                │   ↓ trigger                    │
  │                                │ profiles (pending_verify)      │
  │                                │                                │
  ├─[email link click]────────────►│ email_confirmed_at set         │
  │                                │   ↓ trigger                    │
  │                                │ profiles (trial, 14 days)      │
  │                                │                                │
  ├─update({ selected_plan })────►│ profiles.selected_plan set     │
  │                                │                                │
  │                                │                                │
get-started.html                   │                                │
  │                                │                                │
  └─[user downloads .dmg]         │                                │
                                   │                                │
                                   │    verify-license              │
                                   │◄──────────────────────────────┤ app login
                                   │ ┌─lookup profile              │
                                   │ ├─check status                │
                                   │ ├─upsert device               │
                                   │ ├─encrypt license blob        │
                                   │──────────────────────────────►│ cache in session.json
                                   │                                │
                                   │                                ├─PIN verify
                                   │                                ├─config.json decrypt
                                   │                                ├─app loads
                                   │                                │
                                   │    create-checkout             │
                                   │◄──────────────────────────────┤ user subscribes
                                   │──────────────────────────────►│ opens Stripe URL
                                   │                                │
STRIPE                             │                                │
──────                             │                                │
  │ checkout.completed             │                                │
  ├───────────────────────────────►│ profiles (active)             │
  │                                │──────────────────────────────►│ next verify-license
  │ invoice.paid (monthly)         │                                │   → gate dismissed
  ├───────────────────────────────►│ extend subscription_ends_at   │
  │                                │                                │
  │ subscription.deleted           │                                │
  ├───────────────────────────────►│ profiles (expired)            │
                                   │──────────────────────────────►│ gate re-appears
```

Every arrow in this diagram represents a real API call, webhook, or file operation that must work for the product to function. If any single arrow breaks, the user's journey stalls at that point.
