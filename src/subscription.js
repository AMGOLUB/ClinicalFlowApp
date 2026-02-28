/* ============================================================
   CLINICALFLOW — Subscription Management
   License verification, auth (signup/login), Stripe checkout/portal.

   Two storage modes:
   - Pre-PIN:  session.json via tauriInvoke (before PIN entry)
   - Post-PIN: encrypted config via cfg.set() / cfg.get()

   Depends on: window.ENV.SUPABASE_URL, window.ENV.SUPABASE_ANON_KEY (from env.js)
   ============================================================ */

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

const SUB_VERIFY_URL   = () => `${window.ENV.SUPABASE_URL}/functions/v1/verify-license`;
const SUB_CHECKOUT_URL = () => `${window.ENV.SUPABASE_URL}/functions/v1/create-checkout`;
const SUB_PORTAL_URL   = () => `${window.ENV.SUPABASE_URL}/functions/v1/customer-portal`;
const SUB_AUTH_URL     = () => `${window.ENV.SUPABASE_URL}/auth/v1`;
const SUB_REST_URL     = () => `${window.ENV.SUPABASE_URL}/rest/v1`;

const VERIFY_INTERVAL_MS = 24 * 60 * 60 * 1000;   // re-verify every 24 hours
const OFFLINE_GRACE_MS   = 30 * 24 * 60 * 60 * 1000;   // allow offline for 30 days

// ═══════════════════════════════════════════════════════════════
// PRE-PIN SESSION STORAGE (session.json via Tauri)
// ═══════════════════════════════════════════════════════════════

let _prePinSession = null;

async function _loadPrePinSession() {
  if (!window.__TAURI__) return null;
  try {
    return await window.__TAURI__.core.invoke('load_pre_pin_session');
  } catch (e) {
    console.warn('[subscription] load_pre_pin_session failed:', e);
    return null;
  }
}

async function _savePrePinSession(session) {
  if (!window.__TAURI__) return;
  try {
    await window.__TAURI__.core.invoke('save_pre_pin_session', { session });
  } catch (e) {
    console.warn('[subscription] save_pre_pin_session failed:', e);
  }
}

export function getPrePinSession() {
  return _prePinSession;
}

/**
 * Sync pre-PIN session data into cfg after PIN entry.
 */
export async function syncSessionToCfg(cfg) {
  if (!_prePinSession) return;
  const s = _prePinSession;
  if (s.access_token)   cfg.set('ms-supabase-token', s.access_token);
  if (s.refresh_token)  cfg.set('ms-supabase-refresh', s.refresh_token);
  if (s.email)          cfg.set('ms-supabase-email', s.email);
  if (s.license_key)    cfg.set('ms-license-key', s.license_key);
  if (s.cached_status)  cfg.set('ms-sub-status', s.cached_status);
  if (s.cached_tier)    cfg.set('ms-sub-tier', s.cached_tier);
  if (s.last_verified)  cfg.set('ms-sub-verified', s.last_verified);
  if (s.trial_ends)     cfg.set('ms-trial-ends', s.trial_ends);
  if (s.sub_ends)       cfg.set('ms-sub-ends', s.sub_ends);
  if (s.days_left)      cfg.set('ms-sub-days-left', String(s.days_left));
  if (s.seats)          cfg.set('ms-sub-seats', String(s.seats));
  await cfg._flush();
}

/**
 * Migration: if cfg has tokens but session.json is empty,
 * populate session.json from cfg.
 */
export async function migrateSessionFromCfg(cfg) {
  if (_prePinSession && _prePinSession.license_key) return;
  const token = cfg.get('ms-supabase-token');
  const licenseKey = cfg.get('ms-license-key');
  if (!token || !licenseKey) return;
  _prePinSession = {
    email: cfg.get('ms-supabase-email') || '',
    access_token: token,
    refresh_token: cfg.get('ms-supabase-refresh') || '',
    license_key: licenseKey,
    license_blob: '',
    last_verified: cfg.get('ms-sub-verified') || '',
    cached_status: cfg.get('ms-sub-status') || '',
    cached_tier: cfg.get('ms-sub-tier') || '',
    trial_ends: cfg.get('ms-trial-ends') || '',
    sub_ends: cfg.get('ms-sub-ends') || '',
    seats: parseInt(cfg.get('ms-sub-seats', '0')) || 0,
    days_left: parseInt(cfg.get('ms-sub-days-left', '0')) || 0
  };
  await _savePrePinSession(_prePinSession);
}

// ═══════════════════════════════════════════════════════════════
// PRE-PIN SUBSCRIPTION CHECK
// ═══════════════════════════════════════════════════════════════

/**
 * Check subscription status BEFORE PIN entry.
 * Uses session.json (via Tauri) instead of cfg.
 */
export async function checkSubscriptionPrePin() {
  _prePinSession = await _loadPrePinSession();
  if (!_prePinSession || !_prePinSession.license_key) {
    return { valid: false, status: 'none', reason: 'not_registered' };
  }

  const session = _prePinSession;

  if (session.cached_status === 'pending_verification') {
    return { valid: false, status: 'pending_verification', reason: 'Please verify your email to activate your trial.' };
  }

  const now = Date.now();
  const lastVerifiedTime = session.last_verified ? new Date(session.last_verified).getTime() : 0;
  const timeSinceVerify  = now - lastVerifiedTime;

  // Recent verification — trust cache
  if (timeSinceVerify < VERIFY_INTERVAL_MS && session.cached_status) {
    if (session.cached_status === 'trial' && session.trial_ends) {
      if (new Date(session.trial_ends) < new Date()) {
        session.cached_status = 'expired';
        await _savePrePinSession(session);
        return { valid: false, status: 'expired', reason: 'Trial expired' };
      }
    }
    const isValid = ['trial', 'active', 'past_due'].includes(session.cached_status);
    return {
      valid: isValid, status: session.cached_status, reason: '',
      daysRemaining: session.days_left || null, tier: session.cached_tier, seats: session.seats
    };
  }

  // Need network verification
  try {
    const result = await _verifyLicensePrePin(session);

    if (result.status === 'pending_verification') {
      session.cached_status = 'pending_verification';
      await _savePrePinSession(session);
      return { valid: false, status: 'pending_verification', reason: result.reason || 'Please verify your email.' };
    }

    session.cached_status  = result.status;
    session.cached_tier    = result.tier;
    session.last_verified  = new Date().toISOString();
    session.days_left      = result.days_remaining || 0;
    if (result.trial_ends_at)        session.trial_ends   = result.trial_ends_at;
    if (result.subscription_ends_at) session.sub_ends     = result.subscription_ends_at;
    if (result.seats != null)        session.seats        = result.seats;
    if (result.license_blob)         session.license_blob = result.license_blob;
    await _savePrePinSession(session);
    _prePinSession = session;

    return {
      valid: result.valid, status: result.status, reason: result.reason,
      daysRemaining: result.days_remaining, tier: result.tier, seats: result.seats
    };
  } catch (networkError) {
    console.warn('[subscription] Pre-PIN verification failed (offline?):', networkError.message);

    // Offline: decrypt cached license blob
    if (session.license_blob && window.__TAURI__) {
      try {
        const payload = await window.__TAURI__.core.invoke('decrypt_license', { blob: session.license_blob });
        if (new Date(payload.valid_until).getTime() > now) {
          const isValid = ['trial', 'active'].includes(payload.status);
          return { valid: isValid, status: payload.status, reason: 'Offline — using cached license', tier: payload.tier };
        }
      } catch (e) {
        console.warn('[subscription] License blob decrypt failed:', e);
      }
    }

    // Within grace period
    if (lastVerifiedTime > 0 && timeSinceVerify < OFFLINE_GRACE_MS) {
      const isValid = ['trial', 'active'].includes(session.cached_status);
      return { valid: isValid, status: session.cached_status || 'unknown', reason: 'Offline — using cached subscription status' };
    }

    return { valid: false, status: 'expired', reason: 'Unable to verify subscription — please connect to the internet' };
  }
}

async function _verifyLicensePrePin(session) {
  const body = { license_key: session.license_key };
  if (window.__TAURI__) {
    try {
      const [h, n] = await window.__TAURI__.core.invoke('get_device_info');
      body.device_hash = h;
      body.device_name = n;
    } catch { /* ignore */ }
  }
  const response = await fetch(SUB_VERIFY_URL(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return await response.json();
}

async function _refreshTokenPrePin(session) {
  if (!session.refresh_token) return null;
  try {
    const response = await fetch(`${SUB_AUTH_URL()}/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': window.ENV.SUPABASE_ANON_KEY },
      body: JSON.stringify({ refresh_token: session.refresh_token })
    });
    const data = await response.json();
    if (data.access_token) {
      session.access_token  = data.access_token;
      session.refresh_token = data.refresh_token || session.refresh_token;
      await _savePrePinSession(session);
      return data.access_token;
    }
    return null;
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// PRE-PIN AUTH (LOGIN / SIGNUP / FORGOT PASSWORD)
// ═══════════════════════════════════════════════════════════════

export async function subLogInPrePin(email, password) {
  try {
    const response = await fetch(`${SUB_AUTH_URL()}/token?grant_type=password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': window.ENV.SUPABASE_ANON_KEY },
      body: JSON.stringify({ email, password })
    });
    const data = await response.json();

    if (data.error) {
      const msg = data.error_description || data.error.message || data.error;
      return { success: false, error: typeof msg === 'string' ? msg : 'Login failed' };
    }
    if (!data.access_token) {
      return { success: false, error: 'Login failed — no session returned' };
    }

    const licenseKey = await subFetchLicenseKey(data.access_token);

    _prePinSession = {
      email, access_token: data.access_token, refresh_token: data.refresh_token || '',
      license_key: licenseKey || '', license_blob: '', last_verified: '',
      cached_status: '', cached_tier: '', trial_ends: '', sub_ends: '',
      seats: 0, days_left: 0
    };
    await _savePrePinSession(_prePinSession);

    const subResult = await checkSubscriptionPrePin();
    return { success: true, subscription: subResult };
  } catch (err) {
    return { success: false, error: err.message || 'Network error — check your connection' };
  }
}

// Signup now happens on the web (signup-page Edge Function).
// The "Create Free Account" button opens the browser.

export async function subForgotPassword(email) {
  if (!email) return { success: false, error: 'Please enter your email address' };
  try {
    const response = await fetch(`${SUB_AUTH_URL()}/recover`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': window.ENV.SUPABASE_ANON_KEY },
      body: JSON.stringify({ email })
    });
    if (!response.ok) {
      const d = await response.json().catch(() => ({}));
      return { success: false, error: d.error?.message || d.error || 'Failed to send reset email' };
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message || 'Network error' };
  }
}

// ═══════════════════════════════════════════════════════════════
// PRE-PIN CHECKOUT / PORTAL / LOGOUT (with 401 retry)
// ═══════════════════════════════════════════════════════════════

export async function subOpenCheckoutPrePin(plan, seats = 1) {
  if (!_prePinSession?.access_token) throw new Error('Not logged in');

  async function _doFetch(token) {
    return fetch(SUB_CHECKOUT_URL(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ plan, seats })
    });
  }

  let response = await _doFetch(_prePinSession.access_token);
  if (response.status === 401) {
    const newToken = await _refreshTokenPrePin(_prePinSession);
    if (newToken) response = await _doFetch(newToken);
  }

  const data = await response.json();
  if (data.error) throw new Error(data.error);
  if (!data.url) throw new Error('No checkout URL returned');

  if (window.__TAURI__) {
    await window.__TAURI__.shell.open(data.url);
  } else {
    window.open(data.url, '_blank');
  }
}

export async function subOpenBillingPortalPrePin() {
  if (!_prePinSession?.access_token) throw new Error('Not logged in');

  async function _doFetch(token) {
    return fetch(SUB_PORTAL_URL(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
    });
  }

  let response = await _doFetch(_prePinSession.access_token);
  if (response.status === 401) {
    const newToken = await _refreshTokenPrePin(_prePinSession);
    if (newToken) response = await _doFetch(newToken);
  }

  const data = await response.json();
  if (data.error) throw new Error(data.error);

  if (window.__TAURI__) {
    await window.__TAURI__.shell.open(data.url);
  } else {
    window.open(data.url, '_blank');
  }
}

export async function subLogOutPrePin() {
  _prePinSession = null;
  if (window.__TAURI__) {
    try { await window.__TAURI__.core.invoke('clear_pre_pin_session'); }
    catch (e) { console.warn('[subscription] clear_pre_pin_session failed:', e); }
  }
}

// ═══════════════════════════════════════════════════════════════
// POST-PIN CHECK SUBSCRIPTION (cfg-based, used after PIN)
// ═══════════════════════════════════════════════════════════════

/**
 * Check subscription status (post-PIN, cfg-based).
 * 1. No license_key → not_registered
 * 2. Verified within 24h → trust cache
 * 3. Verified > 24h ago → call verify-license
 * 4. Network error + within 30 day grace → use cache
 * 5. Network error + grace expired → block
 */
export async function checkSubscription(cfg) {
  const licenseKey   = cfg.get('ms-license-key');
  const lastVerified = cfg.get('ms-sub-verified');
  const cachedStatus = cfg.get('ms-sub-status');

  if (!licenseKey) {
    return { valid: false, status: 'none', reason: 'not_registered' };
  }

  const now = Date.now();
  const lastVerifiedTime = lastVerified ? new Date(lastVerified).getTime() : 0;
  const timeSinceVerify  = now - lastVerifiedTime;

  // Case 2: recent verification — trust cache
  if (timeSinceVerify < VERIFY_INTERVAL_MS && cachedStatus) {
    if (cachedStatus === 'trial') {
      const trialEnds = cfg.get('ms-trial-ends');
      if (trialEnds && new Date(trialEnds) < new Date()) {
        cfg.set('ms-sub-status', 'expired');
        cfg.set('ms-sub-reason', 'Trial expired');
        await cfg._flush();
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

  // Case 3: need network verification
  try {
    const response = await fetch(SUB_VERIFY_URL(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ license_key: licenseKey })
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const result = await response.json();
    cfg.set('ms-sub-status', result.status);
    cfg.set('ms-sub-tier', result.tier);
    cfg.set('ms-sub-verified', new Date().toISOString());
    cfg.set('ms-sub-reason', result.reason || '');
    cfg.set('ms-sub-days-left', String(result.days_remaining || ''));
    if (result.trial_ends_at)        cfg.set('ms-trial-ends', result.trial_ends_at);
    if (result.subscription_ends_at) cfg.set('ms-sub-ends', result.subscription_ends_at);
    await cfg._flush();

    return {
      valid: result.valid,
      status: result.status,
      reason: result.reason,
      daysRemaining: result.days_remaining
    };
  } catch (networkError) {
    console.warn('[subscription] Verification failed (offline?):', networkError.message);

    // Case 4: within grace period
    if (lastVerifiedTime > 0 && timeSinceVerify < OFFLINE_GRACE_MS) {
      const isValid = ['trial', 'active'].includes(cachedStatus);
      return {
        valid: isValid,
        status: cachedStatus || 'unknown',
        reason: 'Offline — using cached subscription status'
      };
    }

    // Case 5: grace expired
    return {
      valid: false,
      status: 'expired',
      reason: 'Unable to verify subscription — please connect to the internet'
    };
  }
}

// ═══════════════════════════════════════════════════════════════
// POST-PIN AUTH (cfg-based)
// ═══════════════════════════════════════════════════════════════

export async function subLogIn(email, password, cfg) {
  try {
    const response = await fetch(`${SUB_AUTH_URL()}/token?grant_type=password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': window.ENV.SUPABASE_ANON_KEY
      },
      body: JSON.stringify({ email, password })
    });

    const data = await response.json();

    if (data.error) {
      const msg = data.error_description || data.error.message || data.error;
      return { success: false, error: typeof msg === 'string' ? msg : 'Login failed' };
    }
    if (!data.access_token) {
      return { success: false, error: 'Login failed — no session returned' };
    }

    cfg.set('ms-supabase-token', data.access_token);
    cfg.set('ms-supabase-refresh', data.refresh_token || '');
    cfg.set('ms-supabase-email', email);

    const licenseKey = await subFetchLicenseKey(data.access_token);
    if (licenseKey) cfg.set('ms-license-key', licenseKey);
    await cfg._flush();

    const subResult = await checkSubscription(cfg);
    return { success: true, subscription: subResult };
  } catch (err) {
    return { success: false, error: err.message || 'Network error — check your connection' };
  }
}

// ═══════════════════════════════════════════════════════════════
// FETCH LICENSE KEY
// ═══════════════════════════════════════════════════════════════

export async function subFetchLicenseKey(accessToken) {
  try {
    const response = await fetch(
      `${SUB_REST_URL()}/profiles?select=license_key&limit=1`,
      {
        headers: {
          'apikey': window.ENV.SUPABASE_ANON_KEY,
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
// POST-PIN CHECKOUT / PORTAL / LOGOUT / REFRESH
// ═══════════════════════════════════════════════════════════════

export async function subOpenCheckout(plan, cfg, seats = 1) {
  const token = cfg.get('ms-supabase-token');
  if (!token) throw new Error('Not logged in — please log in first');

  const response = await fetch(SUB_CHECKOUT_URL(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ plan, seats })
  });

  const data = await response.json();
  if (data.error) throw new Error(data.error);
  if (!data.url) throw new Error('No checkout URL returned');

  if (window.__TAURI__) {
    const { open } = window.__TAURI__.shell;
    await open(data.url);
  } else {
    window.open(data.url, '_blank');
  }
}

export async function subOpenBillingPortal(cfg) {
  const token = cfg.get('ms-supabase-token');
  if (!token) throw new Error('Not logged in');

  const response = await fetch(SUB_PORTAL_URL(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    }
  });

  const data = await response.json();
  if (data.error) throw new Error(data.error);

  if (window.__TAURI__) {
    const { open } = window.__TAURI__.shell;
    await open(data.url);
  } else {
    window.open(data.url, '_blank');
  }
}

export async function subLogOut(cfg) {
  cfg.set('ms-supabase-token', '');
  cfg.set('ms-supabase-refresh', '');
  await cfg._flush();
}

export async function subRefreshToken(cfg) {
  const refreshToken = cfg.get('ms-supabase-refresh');
  if (!refreshToken) return null;

  try {
    const response = await fetch(`${SUB_AUTH_URL()}/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': window.ENV.SUPABASE_ANON_KEY
      },
      body: JSON.stringify({ refresh_token: refreshToken })
    });

    const data = await response.json();
    if (data.access_token) {
      cfg.set('ms-supabase-token', data.access_token);
      cfg.set('ms-supabase-refresh', data.refresh_token || refreshToken);
      await cfg._flush();
      return data.access_token;
    }
    return null;
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// TRIAL WARNING
// ═══════════════════════════════════════════════════════════════

export function checkTrialWarning(subResult) {
  if (subResult.status !== 'trial' || !subResult.daysRemaining) return;
  if (subResult.daysRemaining > 3) return;

  const lastShown = localStorage.getItem('cf-trial-warning-date');
  const today = new Date().toISOString().slice(0, 10);
  if (lastShown === today) return;

  const toast = document.getElementById('trialWarningToast');
  const text = document.getElementById('trialWarningText');
  if (!toast || !text) return;

  const days = subResult.daysRemaining;
  text.textContent = days === 1
    ? 'Your trial ends tomorrow. Upgrade to keep using ClinicalFlow.'
    : `Your trial ends in ${days} days. Upgrade to keep using ClinicalFlow.`;
  toast.style.display = 'block';
  localStorage.setItem('cf-trial-warning-date', today);

  const dismissBtn = document.getElementById('trialWarningDismiss');
  if (dismissBtn) {
    dismissBtn.addEventListener('click', () => { toast.style.display = 'none'; }, { once: true });
  }
}

// ═══════════════════════════════════════════════════════════════
// SUBSCRIPTION GATE UI CONTROLLER
// ═══════════════════════════════════════════════════════════════

let _subGateResolve = null;
let _selectedPlan = 'pro_annual';
let _gateCfg = null;   // null = pre-PIN mode
let _seatCount = 1;

export function subShowGate(mode, message) {
  const gate         = document.getElementById('subscriptionGate');
  const loginForm    = document.getElementById('subLoginForm');
  const expiredForm  = document.getElementById('subExpiredForm');
  const pendingForm  = document.getElementById('subPendingForm');

  loginForm.style.display   = 'none';
  expiredForm.style.display = 'none';
  if (pendingForm) pendingForm.style.display = 'none';

  if (mode === 'auth') {
    loginForm.style.display = 'block';
  } else if (mode === 'expired') {
    expiredForm.style.display = 'block';
    if (message) {
      document.getElementById('subExpiredMessage').textContent = message;
      const titleEl = document.getElementById('subExpiredTitle');
      const ml = message.toLowerCase();
      if (ml.includes('trial'))                           titleEl.textContent = 'Your trial has expired';
      else if (ml.includes('cancel'))                     titleEl.textContent = 'Your subscription has ended';
      else if (ml.includes('payment') || ml.includes('overdue')) titleEl.textContent = 'Payment required';
      else if (ml.includes('internet') || ml.includes('verify')) titleEl.textContent = 'Verification required';
      else                                                titleEl.textContent = 'Subscription inactive';
    }
  } else if (mode === 'pending_verification') {
    if (pendingForm) pendingForm.style.display = 'block';
  }

  gate.style.display = 'flex';
}

export function subHideGate() {
  document.getElementById('subscriptionGate').style.display = 'none';
  if (_subGateResolve) {
    _subGateResolve();
    _subGateResolve = null;
  }
}

export function subWaitForGateClose() {
  return new Promise(resolve => { _subGateResolve = resolve; });
}

// ═══════════════════════════════════════════════════════════════
// INIT — bind all DOM event handlers (call once during startup)
// ═══════════════════════════════════════════════════════════════

export function initSubGate(cfg) {
  _gateCfg = cfg;   // null = pre-PIN mode

  // Login handler
  document.getElementById('subLoginBtn').addEventListener('click', _handleLogin);
  document.getElementById('subLoginPassword').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('subLoginBtn').click();
  });

  // "Create Free Account" → open signup page in browser
  document.getElementById('subOpenSignupBtn')?.addEventListener('click', async () => {
    const signupUrl = `${window.ENV.SUPABASE_URL}/functions/v1/signup-page`;
    if (window.__TAURI__?.shell) {
      await window.__TAURI__.shell.open(signupUrl);
    } else {
      window.open(signupUrl, '_blank');
    }
  });

  // Plan selection
  document.querySelectorAll('.sub-plan-card').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.sub-plan-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      _selectedPlan = card.dataset.plan;
      _updateSeatTotal();
    });
  });

  // Plan tier toggle (Pro / Team)
  document.querySelectorAll('.sub-plan-toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.sub-plan-toggle-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tier = btn.dataset.tier;
      const proPlans  = document.getElementById('subProPlans');
      const teamPlans = document.getElementById('subTeamPlans');
      const seatCtrl  = document.getElementById('subSeatControl');
      if (tier === 'team') {
        if (proPlans)  proPlans.style.display  = 'none';
        if (teamPlans) teamPlans.style.display = 'flex';
        if (seatCtrl)  seatCtrl.style.display  = 'flex';
        // Auto-select first team card if none selected
        const teamCards = teamPlans?.querySelectorAll('.sub-plan-card');
        const anySelected = teamPlans?.querySelector('.sub-plan-card.selected');
        if (!anySelected && teamCards?.length) {
          teamCards[0].classList.add('selected');
          _selectedPlan = teamCards[0].dataset.plan;
        }
      } else {
        if (proPlans)  proPlans.style.display  = 'flex';
        if (teamPlans) teamPlans.style.display = 'none';
        if (seatCtrl)  seatCtrl.style.display  = 'none';
        const proCards = proPlans?.querySelectorAll('.sub-plan-card');
        const anySelected = proPlans?.querySelector('.sub-plan-card.selected');
        if (!anySelected && proCards?.length) {
          proCards[1]?.classList.add('selected');  // annual
          _selectedPlan = proCards[1]?.dataset.plan || 'pro_annual';
        }
      }
      _updateSeatTotal();
    });
  });

  // Seat stepper
  document.getElementById('subSeatMinus')?.addEventListener('click', () => {
    if (_seatCount > 2) { _seatCount--; _updateSeatDisplay(); }
  });
  document.getElementById('subSeatPlus')?.addEventListener('click', () => {
    if (_seatCount < 100) { _seatCount++; _updateSeatDisplay(); }
  });
  _seatCount = 3;
  _updateSeatDisplay();

  // Upgrade handler
  document.getElementById('subUpgradeBtn').addEventListener('click', _handleUpgrade);

  // Manage billing from expired screen
  document.getElementById('subManageBillingExpired')?.addEventListener('click', async e => {
    e.preventDefault();
    try {
      if (_gateCfg) await subOpenBillingPortal(_gateCfg);
      else await subOpenBillingPortalPrePin();
    } catch (err) { console.error('[subscription] Billing portal error:', err); }
  });

  // Switch account from expired screen
  document.getElementById('subSwitchAccount')?.addEventListener('click', async e => {
    e.preventDefault();
    if (_gateCfg) await subLogOut(_gateCfg);
    else await subLogOutPrePin();
    subShowGate('auth');
  });

  // Forgot password — send Supabase reset email
  document.getElementById('subForgotPassword')?.addEventListener('click', async e => {
    e.preventDefault();
    const email = document.getElementById('subLoginEmail').value.trim();
    const errorEl = document.getElementById('subLoginError');
    const result = await subForgotPassword(email);
    if (result.success) {
      errorEl.textContent = 'Password reset email sent. Check your inbox.';
      errorEl.style.display = 'block';
      errorEl.style.color = 'var(--color-success, #10b981)';
    } else {
      errorEl.textContent = result.error;
      errorEl.style.display = 'block';
      errorEl.style.color = '';
    }
  });

  // Pending verification → go to login
  document.getElementById('subPendingLoginBtn')?.addEventListener('click', () => {
    subShowGate('auth');
  });
}

// ─── Seat display helpers ────────────────────────────────────

function _updateSeatDisplay() {
  const countEl = document.getElementById('subSeatCount');
  if (countEl) countEl.textContent = _seatCount;
  _updateSeatTotal();
}

function _updateSeatTotal() {
  const totalEl = document.getElementById('subSeatTotal');
  if (!totalEl) return;
  if (_selectedPlan === 'team_monthly') {
    totalEl.textContent = `$${_seatCount * 19}/mo`;
  } else if (_selectedPlan === 'team_annual') {
    totalEl.textContent = `$${_seatCount * 190}/yr`;
  } else {
    totalEl.textContent = '';
  }
}

// ─── Internal handlers ───────────────────────────────────────

async function _handleLogin() {
  const email    = document.getElementById('subLoginEmail').value.trim();
  const password = document.getElementById('subLoginPassword').value;
  const errorEl  = document.getElementById('subLoginError');
  const btn      = document.getElementById('subLoginBtn');

  if (!email || !password) {
    errorEl.textContent = 'Please enter your email and password.';
    errorEl.style.display = 'block';
    errorEl.style.color = '';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Logging in\u2026';
  errorEl.style.display = 'none';

  let result;
  if (_gateCfg) {
    result = await subLogIn(email, password, _gateCfg);
  } else {
    result = await subLogInPrePin(email, password);
  }

  if (result.success) {
    const sub = result.subscription;
    if (sub?.status === 'pending_verification') {
      subShowGate('pending_verification');
    } else if (sub?.valid) {
      subHideGate();
    } else {
      subShowGate('expired', sub?.reason || 'Subscription inactive');
    }
  } else {
    errorEl.textContent = result.error || 'Login failed. Please try again.';
    errorEl.style.display = 'block';
    errorEl.style.color = '';
  }

  btn.disabled = false;
  btn.textContent = 'Log In';
}

async function _handleUpgrade() {
  const btn = document.getElementById('subUpgradeBtn');
  btn.disabled = true;
  btn.textContent = 'Opening checkout\u2026';

  try {
    if (_gateCfg) {
      await subOpenCheckout(_selectedPlan, _gateCfg, _seatCount);
    } else {
      await subOpenCheckoutPrePin(_selectedPlan, _seatCount);
    }

    btn.textContent = 'Waiting for payment\u2026';

    let attempts = 0;
    const maxAttempts = 60;
    const pollInterval = setInterval(async () => {
      attempts++;

      let subResult;
      if (_gateCfg) {
        _gateCfg.set('ms-sub-verified', '');
        subResult = await checkSubscription(_gateCfg);
      } else {
        if (_prePinSession) {
          _prePinSession.last_verified = '';
          await _savePrePinSession(_prePinSession);
        }
        subResult = await checkSubscriptionPrePin();
      }

      if (subResult.valid && subResult.status === 'active') {
        clearInterval(pollInterval);
        subHideGate();
        return;
      }

      if (attempts >= maxAttempts) {
        clearInterval(pollInterval);
        btn.disabled = false;
        btn.textContent = 'Upgrade Now';
        const existing = btn.parentNode.querySelector('.sub-gate-error');
        if (!existing) {
          const errDiv = document.createElement('div');
          errDiv.className = 'sub-gate-error';
          errDiv.textContent = 'Payment not detected yet. If you completed checkout, try restarting the app.';
          btn.parentNode.insertBefore(errDiv, btn.nextSibling);
        }
      }
    }, 5000);
  } catch (err) {
    console.error('[subscription] Checkout error:', err);
    btn.disabled = false;
    btn.textContent = 'Upgrade Now';
  }
}
