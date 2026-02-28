# ClinicalFlow — Phase 11: Subscription & Account System (App-Side)

## Overview

Add subscription gating, account login/signup, and license verification to the ClinicalFlow desktop app. After this phase, the app requires an active subscription (or trial) to access the main interface.

**A Supabase backend and Stripe billing system already exist.** This document only covers changes to the Tauri app codebase. All backend endpoints are referenced by URL — do not create or modify any backend code.

**Architecture decision:** The PIN system is unchanged. PIN still handles local encryption (AES-256-GCM key derivation via PBKDF2). Supabase handles cloud identity and subscription state only. Subscription credentials are stored in the encrypted config blob alongside API keys — no Rust changes needed.

**What changes in the app:**
- New `src/subscription.js` module (license verification, auth, checkout)
- New `src/env.js` file (build-time Supabase config — gitignored)
- New `<div id="subscriptionGate">` overlay in `src/index.html`
- New account section in settings drawer in `src/index.html`
- New CSS for subscription gate in `src/styles.css`
- Updated `src/auth.js` — subscription check inserted at step (d) in `checkAuthAndInit()`
- Updated `src/settings.js` — account display, billing portal, logout
- Updated `src-tauri/tauri.conf.json` — Supabase domain added to CSP `connect-src`

**What does NOT change:**
- `src-tauri/src/auth.rs` — PIN creation, verification, AppState all untouched
- `src-tauri/src/crypto.rs` — encryption pipeline untouched
- `src-tauri/src/storage.rs` — encrypted config load/save untouched
- `src-tauri/src/audio.rs` — recording untouched
- `src-tauri/src/lib.rs` — no new Tauri commands (all HTTP from JS via fetch)
- `src-tauri/Cargo.toml` — no new Rust dependencies

**Prerequisites:** Phases 1-10 complete. The following external services are already configured (not your concern):
- Supabase project with auth, profiles table, and edge functions
- Stripe products with price IDs
- Stripe webhook connected to Supabase

---

# REFERENCE: BACKEND ENDPOINTS

These endpoints exist and are ready to call. You do NOT need to create them. Use them exactly as documented.

## Endpoints

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `${SUPABASE_URL}/auth/v1/signup` | POST | apikey header | Create new user account |
| `${SUPABASE_URL}/auth/v1/token?grant_type=password` | POST | apikey header | Log in existing user |
| `${SUPABASE_URL}/functions/v1/verify-license` | POST | none (uses license_key in body) | Check subscription validity |
| `${SUPABASE_URL}/functions/v1/create-checkout` | POST | Bearer token | Get Stripe checkout URL |
| `${SUPABASE_URL}/functions/v1/customer-portal` | POST | Bearer token | Get Stripe billing portal URL |
| `${SUPABASE_URL}/rest/v1/profiles?select=license_key&limit=1` | GET | Bearer token + apikey | Fetch user's license key |

## Signup Request/Response

```
POST ${SUPABASE_URL}/auth/v1/signup
Headers: { "Content-Type": "application/json", "apikey": SUPABASE_ANON_KEY }
Body: { "email": "...", "password": "...", "data": { "full_name": "..." } }

Response (success):
{
  "user": { "id": "uuid", "email": "..." },
  "session": {
    "access_token": "jwt...",
    "refresh_token": "token..."
  }
}
```

## Login Request/Response

```
POST ${SUPABASE_URL}/auth/v1/token?grant_type=password
Headers: { "Content-Type": "application/json", "apikey": SUPABASE_ANON_KEY }
Body: { "email": "...", "password": "..." }

Response (success):
{
  "access_token": "jwt...",
  "refresh_token": "token...",
  "user": { "id": "uuid", "email": "..." }
}

Response (error):
{ "error": "invalid_grant", "error_description": "Invalid login credentials" }
```

## Verify License Request/Response

```
POST ${SUPABASE_URL}/functions/v1/verify-license
Headers: { "Content-Type": "application/json" }
Body: { "license_key": "uuid-string" }

Response:
{
  "valid": true|false,
  "status": "trial"|"active"|"past_due"|"canceled"|"expired",
  "tier": "trial"|"pro"|"team"|"enterprise",
  "reason": "Trial active (12 days remaining)",
  "days_remaining": 12|null,
  "trial_ends_at": "2026-03-10T00:00:00Z"|null,
  "subscription_ends_at": "2026-04-01T00:00:00Z"|null
}
```

## Create Checkout Request/Response

```
POST ${SUPABASE_URL}/functions/v1/create-checkout
Headers: { "Content-Type": "application/json", "Authorization": "Bearer <access_token>" }
Body: { "plan": "pro_monthly"|"pro_annual"|"team_monthly"|"team_annual", "seats": 3 }

Response: { "url": "https://checkout.stripe.com/c/pay/cs_live_..." }
```

## Customer Portal Request/Response

```
POST ${SUPABASE_URL}/functions/v1/customer-portal
Headers: { "Content-Type": "application/json", "Authorization": "Bearer <access_token>" }

Response: { "url": "https://billing.stripe.com/p/session/..." }
```

## Fetch License Key Request/Response

```
GET ${SUPABASE_URL}/rest/v1/profiles?select=license_key&limit=1
Headers: { "apikey": SUPABASE_ANON_KEY, "Authorization": "Bearer <access_token>", "Accept": "application/json" }

Response: [{ "license_key": "uuid-string" }]
```

---

# PART A: ENVIRONMENT CONFIGURATION

## A1. New File: `src/env.js`

This file holds build-time configuration values. It should be gitignored (add `src/env.js` to `.gitignore`). Create a template file `src/env.example.js` that IS committed.

**File: `src/env.example.js`** (committed to repo as a template)

```javascript
// env.js — Build-time configuration for ClinicalFlow
// Copy this to env.js and fill in your values. env.js is gitignored.
const ENV = {
  SUPABASE_URL: 'https://your-project-ref.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIs...'
};
```

**File: `src/env.js`** (gitignored — actual values)

```javascript
const ENV = {
  SUPABASE_URL: '__REPLACE_WITH_ACTUAL_SUPABASE_URL__',
  SUPABASE_ANON_KEY: '__REPLACE_WITH_ACTUAL_SUPABASE_ANON_KEY__'
};
```

**Add to `.gitignore`:**
```
src/env.js
```

## A2. Load `env.js` in `index.html`

Add this script tag in `src/index.html` **before** all other script tags:

```html
<script src="env.js"></script>
```

This makes `ENV.SUPABASE_URL` and `ENV.SUPABASE_ANON_KEY` available globally.

## A3. Update CSP in `tauri.conf.json`

Find the Content Security Policy string and add the Supabase project domain to `connect-src`.

**Current `connect-src`:**
```
connect-src 'self'
  http://localhost:11434
  https://api.anthropic.com
  wss://api.deepgram.com;
```

**Updated `connect-src`:**
```
connect-src 'self'
  http://localhost:11434
  https://api.anthropic.com
  wss://api.deepgram.com
  https://*.supabase.co;
```

Using the wildcard `https://*.supabase.co` covers both `https://<project-ref>.supabase.co` (REST/auth) and `https://<project-ref>.functions.supabase.co` (edge functions) without hardcoding the project ref.

---

# PART B: SUBSCRIPTION MODULE

## B1. New File: `src/subscription.js`

This is the core subscription logic module. It handles:
- Checking subscription status (with caching and offline grace)
- Signup / Login via Supabase Auth
- Opening Stripe checkout in the default browser
- Opening Stripe billing portal
- Logout

All subscription data is stored in the encrypted config blob (same system as API keys). Config keys used by this module:

| Config Key | Type | Purpose |
|------------|------|---------|
| `ms-license-key` | string (UUID) | User's license key from Supabase profile |
| `ms-sub-status` | string | `"trial"` \| `"active"` \| `"past_due"` \| `"canceled"` \| `"expired"` |
| `ms-sub-tier` | string | `"trial"` \| `"pro"` \| `"team"` \| `"enterprise"` |
| `ms-sub-verified` | string (ISO date) | Timestamp of last successful license verification |
| `ms-trial-ends` | string (ISO date) | When trial expires |
| `ms-sub-ends` | string (ISO date) | When current subscription period ends |
| `ms-sub-reason` | string | Human-readable status message from server |
| `ms-sub-days-left` | number | Days remaining on trial or subscription |
| `ms-supabase-email` | string | User's email address |
| `ms-supabase-token` | string | Supabase access token (JWT) |
| `ms-supabase-refresh` | string | Supabase refresh token |

**File: `src/subscription.js`**

```javascript
// subscription.js — Subscription management for ClinicalFlow
//
// Depends on: ENV.SUPABASE_URL, ENV.SUPABASE_ANON_KEY (from env.js)
// Stores all data in encrypted config via cfg.set() / cfg.get()

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

const SUB_VERIFY_URL     = () => `${ENV.SUPABASE_URL}/functions/v1/verify-license`;
const SUB_CHECKOUT_URL   = () => `${ENV.SUPABASE_URL}/functions/v1/create-checkout`;
const SUB_PORTAL_URL     = () => `${ENV.SUPABASE_URL}/functions/v1/customer-portal`;
const SUB_AUTH_URL        = () => `${ENV.SUPABASE_URL}/auth/v1`;
const SUB_REST_URL        = () => `${ENV.SUPABASE_URL}/rest/v1`;

// Re-verify license every 7 days
const VERIFY_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

// Allow offline access for 30 days after last verification
// (Important for rural/offline users — ClinicalFlow's core differentiator)
const OFFLINE_GRACE_MS   = 30 * 24 * 60 * 60 * 1000;

// ═══════════════════════════════════════════════════════════════
// CHECK SUBSCRIPTION
// ═══════════════════════════════════════════════════════════════

/**
 * Check subscription status during app startup.
 * Called from auth.js checkAuthAndInit(), inserted at step (d).
 *
 * @param {object} cfg - Config instance (must be loaded/decrypted already)
 * @returns {object} { valid: boolean, status: string, reason: string, daysRemaining?: number }
 *
 * Logic:
 * 1. No license_key in config → user hasn't registered yet → return not_registered
 * 2. License key exists + verified within 7 days → trust cached status
 * 3. License key exists + verified > 7 days ago → call verify-license endpoint
 * 4. Network error + last verified within 30 days → offline grace (use cache)
 * 5. Network error + last verified > 30 days ago → block access
 */
async function checkSubscription(cfg) {
  const licenseKey   = cfg.get('ms-license-key');
  const lastVerified = cfg.get('ms-sub-verified');
  const cachedStatus = cfg.get('ms-sub-status');

  // ── Case 1: No license key — user hasn't signed up/logged in ──
  if (!licenseKey) {
    return { valid: false, status: 'none', reason: 'not_registered' };
  }

  // ── Check if re-verification is needed ──
  const now = Date.now();
  const lastVerifiedTime = lastVerified ? new Date(lastVerified).getTime() : 0;
  const timeSinceVerify  = now - lastVerifiedTime;

  // ── Case 2: Recent verification — trust cache ──
  if (timeSinceVerify < VERIFY_INTERVAL_MS && cachedStatus) {
    // But still check local trial expiration
    if (cachedStatus === 'trial') {
      const trialEnds = cfg.get('ms-trial-ends');
      if (trialEnds && new Date(trialEnds) < new Date()) {
        cfg.set('ms-sub-status', 'expired');
        cfg.set('ms-sub-reason', 'Trial expired');
        await cfg.save();
        return { valid: false, status: 'expired', reason: 'Trial expired' };
      }
    }

    const isValid = ['trial', 'active', 'past_due'].includes(cachedStatus);
    return {
      valid: isValid,
      status: cachedStatus,
      reason: cfg.get('ms-sub-reason') || '',
      daysRemaining: parseInt(cfg.get('ms-sub-days-left')) || null
    };
  }

  // ── Case 3: Need to re-verify via network ──
  try {
    const response = await fetch(SUB_VERIFY_URL(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ license_key: licenseKey })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const result = await response.json();

    // Cache the result in encrypted config
    cfg.set('ms-sub-status', result.status);
    cfg.set('ms-sub-tier', result.tier);
    cfg.set('ms-sub-verified', new Date().toISOString());
    cfg.set('ms-sub-reason', result.reason || '');
    cfg.set('ms-sub-days-left', String(result.days_remaining || ''));
    if (result.trial_ends_at)        cfg.set('ms-trial-ends', result.trial_ends_at);
    if (result.subscription_ends_at) cfg.set('ms-sub-ends', result.subscription_ends_at);
    await cfg.save();

    return {
      valid: result.valid,
      status: result.status,
      reason: result.reason,
      daysRemaining: result.days_remaining
    };

  } catch (networkError) {
    // ── Case 4 & 5: Offline — apply grace period ──
    console.warn('[subscription] Verification failed (offline?):', networkError.message);

    if (lastVerifiedTime > 0 && timeSinceVerify < OFFLINE_GRACE_MS) {
      // Case 4: Within grace period — use cached status
      const isValid = ['trial', 'active'].includes(cachedStatus);
      return {
        valid: isValid,
        status: cachedStatus || 'unknown',
        reason: 'Offline — using cached subscription status'
      };
    }

    // Case 5: Grace period expired
    return {
      valid: false,
      status: 'expired',
      reason: 'Unable to verify subscription — please connect to the internet'
    };
  }
}

// ═══════════════════════════════════════════════════════════════
// SIGN UP
// ═══════════════════════════════════════════════════════════════

/**
 * Create a new user account with Supabase Auth.
 * On success, stores session tokens and license key in encrypted config.
 * The user automatically starts a 14-day free trial (handled server-side).
 *
 * @param {string} email
 * @param {string} password - minimum 8 characters
 * @param {string} fullName
 * @param {object} cfg - Config instance
 * @returns {object} { success: boolean, error?: string }
 */
async function subSignUp(email, password, fullName, cfg) {
  try {
    const response = await fetch(`${SUB_AUTH_URL()}/signup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': ENV.SUPABASE_ANON_KEY
      },
      body: JSON.stringify({
        email,
        password,
        data: { full_name: fullName }
      })
    });

    const data = await response.json();

    // Handle Supabase error responses
    if (data.error) {
      const msg = typeof data.error === 'string' ? data.error : data.error.message;
      return { success: false, error: msg || 'Signup failed' };
    }

    if (!data.user) {
      // Some Supabase configs require email confirmation
      if (data.id) {
        return {
          success: false,
          error: 'Please check your email to confirm your account, then log in.'
        };
      }
      return { success: false, error: 'Signup failed — please try again' };
    }

    // Extract session tokens
    const accessToken  = data.session?.access_token  || data.access_token;
    const refreshToken = data.session?.refresh_token || data.refresh_token;

    if (accessToken) {
      cfg.set('ms-supabase-token', accessToken);
      cfg.set('ms-supabase-refresh', refreshToken || '');
    }
    cfg.set('ms-supabase-email', email);

    // Fetch the license key from the profile (auto-created by DB trigger)
    if (accessToken) {
      const licenseKey = await subFetchLicenseKey(accessToken);
      if (licenseKey) {
        cfg.set('ms-license-key', licenseKey);
      }
    }

    // Set initial trial state
    cfg.set('ms-sub-status', 'trial');
    cfg.set('ms-sub-tier', 'trial');
    cfg.set('ms-sub-verified', new Date().toISOString());
    cfg.set('ms-trial-ends', new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString());
    cfg.set('ms-sub-reason', 'Trial active (14 days remaining)');
    cfg.set('ms-sub-days-left', '14');

    await cfg.save();
    return { success: true };

  } catch (err) {
    return { success: false, error: err.message || 'Network error — check your connection' };
  }
}

// ═══════════════════════════════════════════════════════════════
// LOG IN
// ═══════════════════════════════════════════════════════════════

/**
 * Log in an existing user with Supabase Auth.
 * On success, stores session tokens and fetches subscription status.
 *
 * @param {string} email
 * @param {string} password
 * @param {object} cfg - Config instance
 * @returns {object} { success: boolean, error?: string, subscription?: object }
 */
async function subLogIn(email, password, cfg) {
  try {
    const response = await fetch(`${SUB_AUTH_URL()}/token?grant_type=password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': ENV.SUPABASE_ANON_KEY
      },
      body: JSON.stringify({ email, password })
    });

    const data = await response.json();

    // Handle errors
    if (data.error) {
      const msg = data.error_description || data.error.message || data.error;
      return { success: false, error: typeof msg === 'string' ? msg : 'Login failed' };
    }

    if (!data.access_token) {
      return { success: false, error: 'Login failed — no session returned' };
    }

    // Store session
    cfg.set('ms-supabase-token', data.access_token);
    cfg.set('ms-supabase-refresh', data.refresh_token || '');
    cfg.set('ms-supabase-email', email);

    // Fetch license key
    const licenseKey = await subFetchLicenseKey(data.access_token);
    if (licenseKey) {
      cfg.set('ms-license-key', licenseKey);
    }

    await cfg.save();

    // Now verify subscription status
    const subResult = await checkSubscription(cfg);

    return { success: true, subscription: subResult };

  } catch (err) {
    return { success: false, error: err.message || 'Network error — check your connection' };
  }
}

// ═══════════════════════════════════════════════════════════════
// FETCH LICENSE KEY
// ═══════════════════════════════════════════════════════════════

/**
 * Fetch the user's license_key UUID from their Supabase profile.
 * Called after signup/login to get the key for offline verification.
 *
 * @param {string} accessToken - Supabase JWT
 * @returns {string|null} license key UUID or null
 */
async function subFetchLicenseKey(accessToken) {
  try {
    const response = await fetch(
      `${SUB_REST_URL()}/profiles?select=license_key&limit=1`,
      {
        headers: {
          'apikey': ENV.SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      }
    );

    if (!response.ok) return null;

    const rows = await response.json();
    return rows?.[0]?.license_key || null;
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// CHECKOUT (OPEN IN BROWSER)
// ═══════════════════════════════════════════════════════════════

/**
 * Open Stripe checkout in the user's default browser.
 * The checkout page is hosted by Stripe — not in the app.
 * After payment, Stripe webhook updates the DB, and the app
 * detects the change on next verify-license call.
 *
 * @param {string} plan - "pro_monthly"|"pro_annual"|"team_monthly"|"team_annual"
 * @param {object} cfg - Config instance
 * @param {number} seats - Number of seats (team plans only, minimum 3)
 */
async function subOpenCheckout(plan, cfg, seats = 3) {
  const token = cfg.get('ms-supabase-token');
  if (!token) {
    throw new Error('Not logged in — please log in first');
  }

  const response = await fetch(SUB_CHECKOUT_URL(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ plan, seats })
  });

  const data = await response.json();

  if (data.error) {
    throw new Error(data.error);
  }

  if (!data.url) {
    throw new Error('No checkout URL returned');
  }

  // Open in default browser via Tauri shell plugin
  if (window.__TAURI__) {
    const { open } = window.__TAURI__.shell;
    await open(data.url);
  } else {
    // Browser fallback (dev mode)
    window.open(data.url, '_blank');
  }
}

// ═══════════════════════════════════════════════════════════════
// BILLING PORTAL (OPEN IN BROWSER)
// ═══════════════════════════════════════════════════════════════

/**
 * Open Stripe customer portal for managing subscription, payment method,
 * and cancellation. Opens in default browser.
 *
 * @param {object} cfg - Config instance
 */
async function subOpenBillingPortal(cfg) {
  const token = cfg.get('ms-supabase-token');
  if (!token) {
    throw new Error('Not logged in');
  }

  const response = await fetch(SUB_PORTAL_URL(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    }
  });

  const data = await response.json();

  if (data.error) {
    throw new Error(data.error);
  }

  if (window.__TAURI__) {
    const { open } = window.__TAURI__.shell;
    await open(data.url);
  } else {
    window.open(data.url, '_blank');
  }
}

// ═══════════════════════════════════════════════════════════════
// LOG OUT
// ═══════════════════════════════════════════════════════════════

/**
 * Clear Supabase session tokens from encrypted config.
 * Does NOT clear license_key — user can re-login without re-registering.
 * Does NOT clear PIN or encrypted data.
 *
 * @param {object} cfg - Config instance
 */
async function subLogOut(cfg) {
  cfg.set('ms-supabase-token', '');
  cfg.set('ms-supabase-refresh', '');
  await cfg.save();
}

// ═══════════════════════════════════════════════════════════════
// TOKEN REFRESH (OPTIONAL — for long sessions)
// ═══════════════════════════════════════════════════════════════

/**
 * Refresh the Supabase access token using the refresh token.
 * Call this if an API call returns 401 and you have a refresh token.
 *
 * @param {object} cfg - Config instance
 * @returns {string|null} new access token, or null on failure
 */
async function subRefreshToken(cfg) {
  const refreshToken = cfg.get('ms-supabase-refresh');
  if (!refreshToken) return null;

  try {
    const response = await fetch(`${SUB_AUTH_URL()}/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': ENV.SUPABASE_ANON_KEY
      },
      body: JSON.stringify({ refresh_token: refreshToken })
    });

    const data = await response.json();
    if (data.access_token) {
      cfg.set('ms-supabase-token', data.access_token);
      cfg.set('ms-supabase-refresh', data.refresh_token || refreshToken);
      await cfg.save();
      return data.access_token;
    }

    return null;
  } catch {
    return null;
  }
}
```

**Load order:** `env.js` must load before `subscription.js`. Add both script tags in `index.html`:

```html
<script src="env.js"></script>
<!-- ... existing scripts ... -->
<script src="subscription.js"></script>
```

---

# PART C: HTML CHANGES

## C1. Add Subscription Gate Overlay to `index.html`

Add this `div` as a direct child of `<body>`, positioned as a sibling of `#lockScreen` and `#welcomeWizard`. Insert it **after** `<div id="lockScreen">...</div>` and **before** `<div id="welcomeWizard">...</div>`.

This follows the exact same overlay pattern as the lock screen and welcome wizard: a full-screen `div` toggled with `style.display = 'flex' | 'none'`.

```html
<!-- ═══════════════════════════════════════════════════════════
     SUBSCRIPTION GATE
     Shown when: (a) no account yet, or (b) subscription expired.
     Hidden when: subscription is valid.
     Same overlay pattern as #lockScreen and #welcomeWizard.
     z-index: 9998 (below lockScreen at 9999, above everything else)
     ═══════════════════════════════════════════════════════════ -->
<div id="subscriptionGate" style="display:none">
  <div class="sub-gate-container">

    <!-- ─── TAB BAR: Login / Sign Up ─── -->
    <div class="sub-gate-tabs" id="subGateTabs">
      <button class="sub-gate-tab active" data-tab="login">Log In</button>
      <button class="sub-gate-tab" data-tab="signup">Sign Up</button>
    </div>

    <!-- ═══ LOGIN FORM ═══ -->
    <div class="sub-gate-form" id="subLoginForm">
      <div class="sub-gate-logo">
        <img src="icons/icon-128.png" alt="ClinicalFlow" width="64" height="64">
        <h2>Welcome back</h2>
        <p class="sub-gate-subtitle">Log in to continue using ClinicalFlow</p>
      </div>

      <div class="sub-gate-field">
        <label for="subLoginEmail">Email</label>
        <input type="email" id="subLoginEmail" placeholder="you@practice.com"
               autocomplete="email" spellcheck="false">
      </div>

      <div class="sub-gate-field">
        <label for="subLoginPassword">Password</label>
        <input type="password" id="subLoginPassword" placeholder="••••••••"
               autocomplete="current-password">
      </div>

      <button class="btn btn-primary btn-lg sub-gate-submit" id="subLoginBtn">
        Log In
      </button>

      <div class="sub-gate-error" id="subLoginError" style="display:none"></div>

      <p class="sub-gate-link-row">
        <a href="#" id="subForgotPassword">Forgot password?</a>
      </p>
    </div>

    <!-- ═══ SIGNUP FORM ═══ -->
    <div class="sub-gate-form" id="subSignupForm" style="display:none">
      <div class="sub-gate-logo">
        <img src="icons/icon-128.png" alt="ClinicalFlow" width="64" height="64">
        <h2>Start your free trial</h2>
        <p class="sub-gate-subtitle">14 days free — no credit card required</p>
      </div>

      <div class="sub-gate-field">
        <label for="subSignupName">Full Name</label>
        <input type="text" id="subSignupName" placeholder="Dr. Jane Smith"
               autocomplete="name" spellcheck="false">
      </div>

      <div class="sub-gate-field">
        <label for="subSignupEmail">Email</label>
        <input type="email" id="subSignupEmail" placeholder="you@practice.com"
               autocomplete="email" spellcheck="false">
      </div>

      <div class="sub-gate-field">
        <label for="subSignupPassword">Password</label>
        <input type="password" id="subSignupPassword" placeholder="Min 8 characters"
               autocomplete="new-password">
      </div>

      <button class="btn btn-primary btn-lg sub-gate-submit" id="subSignupBtn">
        Start Free Trial
      </button>

      <div class="sub-gate-error" id="subSignupError" style="display:none"></div>

      <p class="sub-gate-terms">
        By signing up, you agree to our
        <a href="https://clinicalflow.ai/terms" target="_blank" rel="noopener">Terms</a> and
        <a href="https://clinicalflow.ai/privacy" target="_blank" rel="noopener">Privacy Policy</a>.
      </p>
    </div>

    <!-- ═══ EXPIRED / UPGRADE FORM ═══ -->
    <div class="sub-gate-form" id="subExpiredForm" style="display:none">
      <div class="sub-gate-logo">
        <img src="icons/icon-128.png" alt="ClinicalFlow" width="64" height="64">
        <h2 id="subExpiredTitle">Your trial has expired</h2>
        <p class="sub-gate-subtitle" id="subExpiredMessage">
          Upgrade to ClinicalFlow Pro to continue documenting with AI.
        </p>
      </div>

      <!-- Plan selection cards -->
      <div class="sub-gate-plans">
        <div class="sub-plan-card" data-plan="pro_monthly">
          <div class="sub-plan-name">Monthly</div>
          <div class="sub-plan-price">$79<span>/mo</span></div>
          <div class="sub-plan-detail">Billed monthly</div>
        </div>
        <div class="sub-plan-card recommended selected" data-plan="pro_annual">
          <div class="sub-plan-badge">Save $158</div>
          <div class="sub-plan-name">Annual</div>
          <div class="sub-plan-price">$790<span>/yr</span></div>
          <div class="sub-plan-detail">$65.83/mo · Best value</div>
        </div>
      </div>

      <button class="btn btn-primary btn-lg sub-gate-submit" id="subUpgradeBtn">
        Upgrade Now
      </button>

      <p class="sub-gate-link-row">
        Need team pricing?
        <a href="https://clinicalflow.ai/pricing" target="_blank" rel="noopener">View plans →</a>
      </p>

      <p class="sub-gate-link-row">
        Already subscribed?
        <a href="#" id="subManageBillingExpired">Manage billing →</a>
      </p>

      <p class="sub-gate-link-row">
        Different account?
        <a href="#" id="subSwitchAccount">Log in with another account →</a>
      </p>
    </div>

  </div>
</div>
```

## C2. Add Account Section to Settings Drawer

In `src/index.html`, find the settings drawer (`<div id="settingsDrawer">`). Add this section **at the very top** of the drawer's content area, before any existing settings sections:

```html
<!-- ─── Account & Subscription ─── -->
<div class="settings-section" id="settingsAccountSection">
  <h3 class="settings-section-title">Account</h3>

  <div class="settings-row">
    <span class="settings-label">Email</span>
    <span class="settings-value" id="settingsEmail">—</span>
  </div>

  <div class="settings-row">
    <span class="settings-label">Plan</span>
    <span class="settings-value" id="settingsPlan">—</span>
  </div>

  <div class="settings-row">
    <span class="settings-label">Status</span>
    <span class="settings-value" id="settingsSubStatus">—</span>
  </div>

  <div class="settings-row" id="settingsTrialRow" style="display:none">
    <span class="settings-label">Trial ends</span>
    <span class="settings-value" id="settingsTrialEnds">—</span>
  </div>

  <div class="settings-row" id="settingsSubEndsRow" style="display:none">
    <span class="settings-label">Renews</span>
    <span class="settings-value" id="settingsSubEnds">—</span>
  </div>

  <div class="settings-account-actions">
    <button class="btn btn-sm btn-ghost" id="settingsManageBilling">
      Manage Billing
    </button>
    <button class="btn btn-sm btn-ghost btn-danger-ghost" id="settingsLogout">
      Log Out
    </button>
  </div>
</div>
```

---

# PART D: CSS CHANGES

## D1. Add Subscription Gate Styles to `styles.css`

Add these styles to `src/styles.css`. They follow the existing design language (dark theme, `#0B0F14` background, `#2DD4BF` teal accent, DM Sans font, `#94A3B8` / `#CBD5E1` / `#F1F5F9` text hierarchy, 8px/12px border-radius).

```css
/* ═══════════════════════════════════════════════════
   SUBSCRIPTION GATE
   Full-screen overlay, same pattern as #lockScreen
   ═══════════════════════════════════════════════════ */

#subscriptionGate {
  position: fixed;
  inset: 0;
  z-index: 9998;   /* Below #lockScreen (9999), above #app and modals */
  background: #0B0F14;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
}

.sub-gate-container {
  width: 100%;
  max-width: 420px;
  padding: 32px 24px;
}

/* ─── Tab bar ─── */
.sub-gate-tabs {
  display: flex;
  gap: 4px;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 10px;
  padding: 4px;
  margin-bottom: 32px;
}

.sub-gate-tab {
  flex: 1;
  padding: 10px 16px;
  border: none;
  background: transparent;
  color: #94A3B8;
  font-family: inherit;
  font-size: 14px;
  font-weight: 600;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.sub-gate-tab:hover {
  color: #CBD5E1;
}

.sub-gate-tab.active {
  background: rgba(45, 212, 191, 0.12);
  color: #2DD4BF;
}

/* ─── Form sections ─── */
.sub-gate-form {
  animation: subGateFadeIn 0.25s ease;
}

@keyframes subGateFadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}

.sub-gate-logo {
  text-align: center;
  margin-bottom: 28px;
}

.sub-gate-logo img {
  margin-bottom: 16px;
  border-radius: 16px;
}

.sub-gate-logo h2 {
  font-size: 24px;
  font-weight: 700;
  color: #F1F5F9;
  margin: 0 0 8px;
  line-height: 1.3;
}

.sub-gate-subtitle {
  font-size: 14px;
  color: #94A3B8;
  margin: 0;
  line-height: 1.5;
}

/* ─── Input fields ─── */
.sub-gate-field {
  margin-bottom: 16px;
}

.sub-gate-field label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: #CBD5E1;
  margin-bottom: 6px;
}

.sub-gate-field input {
  width: 100%;
  padding: 12px 14px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  color: #F1F5F9;
  font-family: inherit;
  font-size: 14px;
  transition: border-color 0.2s, box-shadow 0.2s;
  box-sizing: border-box;
}

.sub-gate-field input:focus {
  outline: none;
  border-color: #2DD4BF;
  box-shadow: 0 0 0 3px rgba(45, 212, 191, 0.1);
}

.sub-gate-field input::placeholder {
  color: #64748B;
}

/* ─── Submit button ─── */
.sub-gate-submit {
  width: 100%;
  margin-top: 8px;
}

.sub-gate-submit:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* ─── Error message ─── */
.sub-gate-error {
  color: #F87171;
  font-size: 13px;
  text-align: center;
  margin-top: 12px;
  padding: 10px 14px;
  background: rgba(248, 113, 113, 0.08);
  border: 1px solid rgba(248, 113, 113, 0.15);
  border-radius: 8px;
  line-height: 1.4;
}

/* ─── Link rows ─── */
.sub-gate-link-row,
.sub-gate-terms {
  font-size: 13px;
  color: #64748B;
  text-align: center;
  margin-top: 14px;
  line-height: 1.5;
}

.sub-gate-link-row a,
.sub-gate-terms a {
  color: #2DD4BF;
  text-decoration: none;
  transition: color 0.15s;
}

.sub-gate-link-row a:hover,
.sub-gate-terms a:hover {
  color: #5EEAD4;
  text-decoration: underline;
}

/* ─── Plan selection cards ─── */
.sub-gate-plans {
  display: flex;
  gap: 12px;
  margin: 4px 0 20px;
}

.sub-plan-card {
  flex: 1;
  padding: 20px 14px;
  background: rgba(255, 255, 255, 0.02);
  border: 2px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
}

.sub-plan-card:hover {
  border-color: rgba(45, 212, 191, 0.25);
  background: rgba(45, 212, 191, 0.02);
}

.sub-plan-card.selected {
  border-color: #2DD4BF;
  background: rgba(45, 212, 191, 0.06);
}

.sub-plan-card.recommended {
  border-color: rgba(45, 212, 191, 0.35);
}

.sub-plan-badge {
  position: absolute;
  top: -10px;
  left: 50%;
  transform: translateX(-50%);
  background: linear-gradient(135deg, #2DD4BF, #14B8A6);
  color: #0B0F14;
  font-size: 11px;
  font-weight: 700;
  padding: 3px 10px;
  border-radius: 20px;
  white-space: nowrap;
  letter-spacing: 0.02em;
}

.sub-plan-name {
  font-size: 14px;
  font-weight: 600;
  color: #CBD5E1;
  margin-bottom: 6px;
}

.sub-plan-price {
  font-size: 28px;
  font-weight: 700;
  color: #F1F5F9;
  line-height: 1.2;
}

.sub-plan-price span {
  font-size: 14px;
  font-weight: 400;
  color: #94A3B8;
}

.sub-plan-detail {
  font-size: 12px;
  color: #64748B;
  margin-top: 4px;
}

/* ─── Settings account section ─── */
.settings-account-actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

.btn-danger-ghost {
  color: #F87171 !important;
}

.btn-danger-ghost:hover {
  background: rgba(248, 113, 113, 0.1) !important;
}
```

---

# PART E: AUTH.JS INTEGRATION

## E1. Insert Subscription Check into `checkAuthAndInit()`

**File:** `src/auth.js`

Find the `checkAuthAndInit()` function (starts around line 298). The subscription check goes at the **exact insertion point** identified in the system audit — step (d), after PIN verification succeeds and before the welcome wizard check.

Here is the code block to insert and the event handlers to add. The exact integration will depend on how variables are scoped in the existing function — the `cfg` instance needs to be initialized and loaded (decrypted with PIN) before the subscription check runs.

### Subscription Check Block (insert at step d)

```javascript
// ═══ STEP D: SUBSCRIPTION CHECK ═══════════════════════════════
// PIN is verified. AppState.pin holds plaintext PIN.
// Config can be decrypted. Check subscription before proceeding.

// Note: cfg must be initialized and loaded before this point.
// If cfg isn't available yet, initialize it here:
//   cfg = new Config();
//   await cfg.load();  ← this decrypts config.json using the PIN in AppState
// If cfg is already loaded by this point, skip the above.

const subResult = await checkSubscription(cfg);

if (!subResult.valid) {
  if (subResult.reason === 'not_registered') {
    // First-time user: show login/signup
    subShowGate('auth');
  } else {
    // Trial expired, canceled, or overdue
    subShowGate('expired', subResult.reason);
  }

  // Wait until user completes auth or upgrades
  await subWaitForGateClose();
}

// Subscription is valid — continue to welcome wizard (step e)
// ═══ END STEP D ════════════════════════════════════════════════
```

### Subscription Gate Controller Functions (add to auth.js or a new section)

```javascript
// ═══════════════════════════════════════════════════════════════
// SUBSCRIPTION GATE UI CONTROLLER
// ═══════════════════════════════════════════════════════════════

let _subGateResolve = null;   // Promise resolver — called when gate closes
let _selectedPlan = 'pro_annual';  // Default plan selection

/**
 * Show the subscription gate overlay.
 * @param {'auth'|'expired'} mode
 * @param {string} message - Optional message for expired screen
 */
function subShowGate(mode, message) {
  const gate         = document.getElementById('subscriptionGate');
  const tabs         = document.getElementById('subGateTabs');
  const loginForm    = document.getElementById('subLoginForm');
  const signupForm   = document.getElementById('subSignupForm');
  const expiredForm  = document.getElementById('subExpiredForm');

  // Hide all forms first
  loginForm.style.display   = 'none';
  signupForm.style.display  = 'none';
  expiredForm.style.display = 'none';

  if (mode === 'auth') {
    tabs.style.display = 'flex';
    loginForm.style.display = 'block';
    // Reset tabs to Login active
    document.querySelectorAll('.sub-gate-tab').forEach(t => t.classList.remove('active'));
    document.querySelector('.sub-gate-tab[data-tab="login"]').classList.add('active');
  } else if (mode === 'expired') {
    tabs.style.display = 'none';
    expiredForm.style.display = 'block';
    if (message) {
      document.getElementById('subExpiredMessage').textContent = message;
      // Customize title based on status
      if (message.toLowerCase().includes('trial')) {
        document.getElementById('subExpiredTitle').textContent = 'Your trial has expired';
      } else if (message.toLowerCase().includes('cancel')) {
        document.getElementById('subExpiredTitle').textContent = 'Your subscription has ended';
      } else if (message.toLowerCase().includes('payment') || message.toLowerCase().includes('overdue')) {
        document.getElementById('subExpiredTitle').textContent = 'Payment required';
      } else if (message.toLowerCase().includes('internet') || message.toLowerCase().includes('verify')) {
        document.getElementById('subExpiredTitle').textContent = 'Verification required';
      } else {
        document.getElementById('subExpiredTitle').textContent = 'Subscription inactive';
      }
    }
  }

  gate.style.display = 'flex';
}

/**
 * Hide the subscription gate and resolve the waiting promise.
 */
function subHideGate() {
  document.getElementById('subscriptionGate').style.display = 'none';
  if (_subGateResolve) {
    _subGateResolve();
    _subGateResolve = null;
  }
}

/**
 * Returns a Promise that resolves when the gate closes.
 * Used in checkAuthAndInit() to pause startup until auth/payment completes.
 */
function subWaitForGateClose() {
  return new Promise(resolve => {
    _subGateResolve = resolve;
  });
}

// ─── TAB SWITCHING ──────────────────────────────────────────
document.querySelectorAll('.sub-gate-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.sub-gate-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    const target = tab.dataset.tab;
    document.getElementById('subLoginForm').style.display  = target === 'login' ? 'block' : 'none';
    document.getElementById('subSignupForm').style.display = target === 'signup' ? 'block' : 'none';
  });
});

// ─── LOGIN HANDLER ──────────────────────────────────────────
document.getElementById('subLoginBtn').addEventListener('click', async () => {
  const email    = document.getElementById('subLoginEmail').value.trim();
  const password = document.getElementById('subLoginPassword').value;
  const errorEl  = document.getElementById('subLoginError');
  const btn      = document.getElementById('subLoginBtn');

  // Validate
  if (!email || !password) {
    errorEl.textContent = 'Please enter your email and password.';
    errorEl.style.display = 'block';
    return;
  }

  // Disable button, show loading
  btn.disabled = true;
  btn.textContent = 'Logging in…';
  errorEl.style.display = 'none';

  const result = await subLogIn(email, password, cfg);

  if (result.success && result.subscription?.valid) {
    // Login successful + subscription active → close gate
    subHideGate();
  } else if (result.success && !result.subscription?.valid) {
    // Login successful but subscription expired → show upgrade screen
    subShowGate('expired', result.subscription?.reason || 'Subscription inactive');
  } else {
    // Login failed → show error
    errorEl.textContent = result.error || 'Login failed. Please try again.';
    errorEl.style.display = 'block';
  }

  btn.disabled = false;
  btn.textContent = 'Log In';
});

// Allow Enter key to submit login
document.getElementById('subLoginPassword').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('subLoginBtn').click();
});

// ─── SIGNUP HANDLER ─────────────────────────────────────────
document.getElementById('subSignupBtn').addEventListener('click', async () => {
  const name     = document.getElementById('subSignupName').value.trim();
  const email    = document.getElementById('subSignupEmail').value.trim();
  const password = document.getElementById('subSignupPassword').value;
  const errorEl  = document.getElementById('subSignupError');
  const btn      = document.getElementById('subSignupBtn');

  // Validate
  if (!name || !email || !password) {
    errorEl.textContent = 'Please fill in all fields.';
    errorEl.style.display = 'block';
    return;
  }
  if (password.length < 8) {
    errorEl.textContent = 'Password must be at least 8 characters.';
    errorEl.style.display = 'block';
    return;
  }
  if (!email.includes('@') || !email.includes('.')) {
    errorEl.textContent = 'Please enter a valid email address.';
    errorEl.style.display = 'block';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Creating account…';
  errorEl.style.display = 'none';

  const result = await subSignUp(email, password, name, cfg);

  if (result.success) {
    subHideGate();  // Trial started → proceed to app
  } else {
    errorEl.textContent = result.error || 'Signup failed. Please try again.';
    errorEl.style.display = 'block';
  }

  btn.disabled = false;
  btn.textContent = 'Start Free Trial';
});

// Allow Enter key to submit signup
document.getElementById('subSignupPassword').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('subSignupBtn').click();
});

// ─── PLAN SELECTION (expired/upgrade screen) ────────────────
document.querySelectorAll('.sub-plan-card').forEach(card => {
  card.addEventListener('click', () => {
    document.querySelectorAll('.sub-plan-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    _selectedPlan = card.dataset.plan;
  });
});

// ─── UPGRADE HANDLER ────────────────────────────────────────
document.getElementById('subUpgradeBtn').addEventListener('click', async () => {
  const btn = document.getElementById('subUpgradeBtn');
  btn.disabled = true;
  btn.textContent = 'Opening checkout…';

  try {
    await subOpenCheckout(_selectedPlan, cfg);

    // Checkout is in the browser now. Poll for activation.
    btn.textContent = 'Waiting for payment…';

    let attempts = 0;
    const maxAttempts = 60; // 5 minutes at 5-second intervals
    const pollInterval = setInterval(async () => {
      attempts++;

      // Force a fresh verification (clear cached timestamp to bypass 7-day cache)
      cfg.set('ms-sub-verified', '');
      const subResult = await checkSubscription(cfg);

      if (subResult.valid && subResult.status === 'active') {
        clearInterval(pollInterval);
        subHideGate();
        return;
      }

      if (attempts >= maxAttempts) {
        clearInterval(pollInterval);
        btn.disabled = false;
        btn.textContent = 'Upgrade Now';
        // Show a helpful message
        const errorEl = document.createElement('div');
        errorEl.className = 'sub-gate-error';
        errorEl.textContent = 'Payment not detected yet. If you completed checkout, try restarting the app.';
        btn.parentNode.insertBefore(errorEl, btn.nextSibling);
      }
    }, 5000);

  } catch (err) {
    console.error('[subscription] Checkout error:', err);
    btn.disabled = false;
    btn.textContent = 'Upgrade Now';
  }
});

// ─── MANAGE BILLING (from expired screen) ───────────────────
document.getElementById('subManageBillingExpired')?.addEventListener('click', async (e) => {
  e.preventDefault();
  try {
    await subOpenBillingPortal(cfg);
  } catch (err) {
    console.error('[subscription] Billing portal error:', err);
  }
});

// ─── SWITCH ACCOUNT (from expired screen) ───────────────────
document.getElementById('subSwitchAccount')?.addEventListener('click', async (e) => {
  e.preventDefault();
  await subLogOut(cfg);
  subShowGate('auth');
});

// ─── FORGOT PASSWORD ────────────────────────────────────────
document.getElementById('subForgotPassword')?.addEventListener('click', (e) => {
  e.preventDefault();
  // Open password reset in browser
  const resetUrl = `${ENV.SUPABASE_URL}/auth/v1/recover`;
  // For now, just open the Supabase-hosted reset page
  // In production, this would be a custom page on clinicalflow.ai
  const email = document.getElementById('subLoginEmail').value.trim();
  if (email && window.__TAURI__) {
    window.__TAURI__.shell.open(`https://clinicalflow.ai/reset-password?email=${encodeURIComponent(email)}`);
  } else if (window.__TAURI__) {
    window.__TAURI__.shell.open('https://clinicalflow.ai/reset-password');
  }
});
```

---

# PART F: SETTINGS.JS INTEGRATION

## F1. Account Display in Settings Drawer

**File:** `src/settings.js`

Add a function to populate the account section when the settings drawer opens. Call this from wherever settings are initialized or when the drawer opens.

```javascript
// ═══════════════════════════════════════════════════════════════
// ACCOUNT SETTINGS
// ═══════════════════════════════════════════════════════════════

/**
 * Populate the account section in the settings drawer.
 * Call when: settings drawer opens, or after subscription state changes.
 */
function loadAccountSettings() {
  const email    = cfg.get('ms-supabase-email');
  const tier     = cfg.get('ms-sub-tier');
  const status   = cfg.get('ms-sub-status');
  const trialEnds = cfg.get('ms-trial-ends');
  const subEnds  = cfg.get('ms-sub-ends');

  // Email
  const emailEl = document.getElementById('settingsEmail');
  if (emailEl) emailEl.textContent = email || '—';

  // Plan name
  const planEl = document.getElementById('settingsPlan');
  if (planEl) {
    planEl.textContent = {
      'trial': 'Free Trial',
      'pro': 'ClinicalFlow Pro ($79/mo)',
      'team': 'ClinicalFlow Team ($69/seat/mo)',
      'enterprise': 'Enterprise'
    }[tier] || '—';
  }

  // Status with color coding
  const statusEl = document.getElementById('settingsSubStatus');
  if (statusEl) {
    const statusMap = {
      'trial':    { text: '● Active (trial)',   color: '#2DD4BF' },
      'active':   { text: '● Active',           color: '#34D399' },
      'past_due': { text: '⚠ Payment due',      color: '#FBBF24' },
      'canceled': { text: '○ Canceled',          color: '#94A3B8' },
      'expired':  { text: '✕ Expired',           color: '#F87171' }
    };
    const s = statusMap[status] || { text: '—', color: '#94A3B8' };
    statusEl.textContent = s.text;
    statusEl.style.color = s.color;
  }

  // Trial end date
  const trialRow = document.getElementById('settingsTrialRow');
  const trialEl  = document.getElementById('settingsTrialEnds');
  if (trialRow && trialEl) {
    if (status === 'trial' && trialEnds) {
      const daysLeft = Math.max(0, Math.ceil(
        (new Date(trialEnds).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      ));
      trialEl.textContent = `${daysLeft} day${daysLeft !== 1 ? 's' : ''} remaining`;
      trialRow.style.display = 'flex';
    } else {
      trialRow.style.display = 'none';
    }
  }

  // Subscription renewal date
  const subEndsRow = document.getElementById('settingsSubEndsRow');
  const subEndsEl  = document.getElementById('settingsSubEnds');
  if (subEndsRow && subEndsEl) {
    if ((status === 'active' || status === 'canceled') && subEnds) {
      const date = new Date(subEnds);
      subEndsEl.textContent = date.toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric'
      });
      subEndsRow.style.display = 'flex';
    } else {
      subEndsRow.style.display = 'none';
    }
  }
}

// ─── MANAGE BILLING (from settings) ─────────────────────────
document.getElementById('settingsManageBilling')?.addEventListener('click', async () => {
  try {
    await subOpenBillingPortal(cfg);
  } catch (err) {
    console.error('[settings] Billing portal error:', err);
    // Show a toast or inline message
  }
});

// ─── LOGOUT (from settings) ────────────────────────────────
document.getElementById('settingsLogout')?.addEventListener('click', async () => {
  await subLogOut(cfg);
  // Restart the app to trigger the full auth flow again
  if (window.__TAURI__) {
    // Reload the webview
    window.location.reload();
  }
});
```

**Integration point:** Call `loadAccountSettings()` wherever you currently initialize settings or when the drawer opens. For example, if there's a function that runs when the settings gear icon is clicked, add it there.

---

# PART G: TESTING CHECKLIST

Run these tests manually using Stripe test mode.

## Auth Flow Tests

| # | Scenario | Steps | Expected |
|---|----------|-------|----------|
| 1 | Fresh install | Launch app | PIN creation → subscription gate (signup visible) |
| 2 | Sign up | Fill name/email/password → click "Start Free Trial" | Account created → gate closes → welcome wizard appears |
| 3 | Normal reopen (< 7 days) | Close and reopen app | PIN entry → cached subscription check (no network) → main app |
| 4 | Reopen after 8 days | Close, wait 8+ days, reopen | PIN entry → network verification → main app |
| 5 | Offline reopen (< 30 days) | Turn off WiFi → reopen | PIN entry → offline grace → main app |
| 6 | Offline reopen (> 30 days) | Simulate 31-day gap | PIN entry → "connect to internet" screen |
| 7 | New device login | Install on second Mac → launch | PIN creation → subscription gate (login tab) → log in → main app |
| 8 | Wrong password | Enter wrong password on login | Error: "Invalid login credentials" |
| 9 | Short password signup | Enter 5-char password | Error: "Password must be at least 8 characters" |

## Payment Flow Tests

| # | Scenario | Steps | Expected |
|---|----------|-------|----------|
| 10 | Trial expires | Wait for trial end (or set trial_ends_at in past via Supabase) → reopen | Upgrade screen with plan cards |
| 11 | Upgrade (annual) | Select annual → click "Upgrade Now" | Default browser opens Stripe Checkout |
| 12 | Complete payment | Use card `4242 4242 4242 4242` in Stripe | App polls → detects active → gate closes |
| 13 | Payment fails | Use card `4000 0000 0000 0002` | Stripe shows decline → app keeps polling → timeout → shows retry message |
| 14 | Manage billing | Settings → Manage Billing | Browser opens Stripe Customer Portal |
| 15 | Cancel subscription | Cancel via Stripe portal | App still works until period end → then shows upgrade screen |

## Settings Tests

| # | Scenario | Expected |
|---|----------|----------|
| 16 | Open settings (trial user) | Shows email, "Free Trial", "● Active (trial)", days remaining |
| 17 | Open settings (pro user) | Shows email, "ClinicalFlow Pro ($79/mo)", "● Active", renewal date |
| 18 | Logout | Click logout → app reloads → PIN screen → subscription gate (login tab) |

---

# PART H: FILES SUMMARY

### New Files (3)

| File | Lines (est.) | Purpose |
|------|-------------|---------|
| `src/subscription.js` | ~280 | Subscription logic: check, signup, login, checkout, portal, logout, refresh |
| `src/env.js` | ~5 | Build-time Supabase URL and anon key |
| `src/env.example.js` | ~5 | Committed template for env.js |

### Modified Files (5)

| File | Changes |
|------|---------|
| `src/index.html` | Add `<script src="env.js">`, `<script src="subscription.js">`, `#subscriptionGate` div (~90 lines HTML), account section in settings drawer (~30 lines HTML) |
| `src/styles.css` | Subscription gate + plan card styles (~200 lines CSS) |
| `src/auth.js` | Insert subscription check block at step (d) in `checkAuthAndInit()`, add gate controller functions + event handlers (~180 lines JS) |
| `src/settings.js` | Add `loadAccountSettings()` function + billing/logout handlers (~70 lines JS) |
| `src-tauri/tauri.conf.json` | Add `https://*.supabase.co` to CSP `connect-src` |

### NOT Modified (7)

| File | Reason |
|------|--------|
| `src-tauri/src/auth.rs` | PIN system completely unchanged |
| `src-tauri/src/crypto.rs` | Encryption unchanged |
| `src-tauri/src/storage.rs` | Config storage unchanged — subscription data goes in the same encrypted JSON blob |
| `src-tauri/src/audio.rs` | Recording unchanged |
| `src-tauri/src/logging.rs` | Logging unchanged |
| `src-tauri/src/lib.rs` | No new Tauri commands — all HTTP goes through JS fetch |
| `src-tauri/Cargo.toml` | No new Rust dependencies |

### New Config Keys (stored in encrypted config.json alongside existing keys)

| Key | Added by |
|-----|----------|
| `ms-license-key` | subscription.js (signup/login) |
| `ms-sub-status` | subscription.js (verify) |
| `ms-sub-tier` | subscription.js (verify) |
| `ms-sub-verified` | subscription.js (verify) |
| `ms-trial-ends` | subscription.js (signup/verify) |
| `ms-sub-ends` | subscription.js (verify) |
| `ms-sub-reason` | subscription.js (verify) |
| `ms-sub-days-left` | subscription.js (verify) |
| `ms-supabase-email` | subscription.js (signup/login) |
| `ms-supabase-token` | subscription.js (signup/login) |
| `ms-supabase-refresh` | subscription.js (signup/login) |
