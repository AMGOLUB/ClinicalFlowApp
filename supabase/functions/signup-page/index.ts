// ────────────────────────────────────────────────────────────
// signup-page — Serves a branded HTML signup page for
// ClinicalFlow. Opens in the user's default browser from the
// Tauri app. Handles signup + email verification redirect.
// ────────────────────────────────────────────────────────────

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

serve((req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  return new Response(buildPage(SUPABASE_URL, SUPABASE_ANON_KEY), {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
});

// ── HTML Builder ──────────────────────────────────────────

function buildPage(url: string, key: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ClinicalFlow — Create Your Account</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"><\/script>
<style>
/* ── Reset ─────────────────────────────────────── */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

/* ── Theme tokens (matches ClinicalFlow app) ───── */
:root {
  --bg-primary:    #0B0F14;
  --bg-secondary:  #111820;
  --bg-tertiary:   #1A2332;
  --accent:        #0ACDCF;
  --accent-dim:    rgba(10,205,207,0.15);
  --accent-glow:   rgba(10,205,207,0.35);
  --accent-hover:  #0DE5E7;
  --accent-dark:   #078A8C;
  --text-primary:  #F1F5F9;
  --text-secondary:#CBD5E1;
  --text-tertiary: #64748B;
  --text-quaternary:#475569;
  --border-default:rgba(255,255,255,0.1);
  --border-active: rgba(10,205,207,0.4);
  --error:         #F87171;
  --error-bg:      rgba(248,113,113,0.1);
  --success:       #34D399;
  --success-bg:    rgba(52,211,153,0.1);
  --warn-yellow:   #FBBF24;
  --warn-orange:   #FB923C;
}

body {
  font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
  background: var(--bg-primary);
  color: var(--text-primary);
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow-x: hidden;
}

/* ── Ambient glow behind the card ──────────────── */
body::before {
  content: '';
  position: fixed;
  top: 30%;
  left: 50%;
  width: 600px;
  height: 600px;
  transform: translate(-50%, -50%);
  background: radial-gradient(ellipse at center, var(--accent-dim) 0%, transparent 70%);
  pointer-events: none;
  z-index: 0;
}

/* ── Screen management ─────────────────────────── */
.screen {
  display: none;
  width: 100%;
  max-width: 440px;
  padding: 0 20px;
  position: relative;
  z-index: 1;
}
.screen.active {
  display: block;
  animation: fadeSlideIn 0.35s ease-out;
}

@keyframes fadeSlideIn {
  from { opacity: 0; transform: translateY(16px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* ── Card ──────────────────────────────────────── */
.card {
  background: var(--bg-secondary);
  border: 1px solid var(--border-default);
  border-radius: 16px;
  padding: 40px 32px;
  box-shadow: 0 8px 40px rgba(0,0,0,0.4), 0 0 80px rgba(10,205,207,0.04);
  backdrop-filter: blur(20px);
}

/* ── Logo / Header ─────────────────────────────── */
.logo-section {
  text-align: center;
  margin-bottom: 32px;
}
.logo-icon {
  width: 56px;
  height: 56px;
  color: var(--accent);
  margin-bottom: 20px;
  filter: drop-shadow(0 0 12px var(--accent-glow));
}
.logo-section h1 {
  font-size: 24px;
  font-weight: 700;
  margin-bottom: 8px;
  letter-spacing: -0.02em;
}
.logo-section p {
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1.5;
}

/* ── Form fields ───────────────────────────────── */
.field {
  margin-bottom: 18px;
}
.field label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  margin-bottom: 6px;
}
.field input {
  width: 100%;
  padding: 12px 14px;
  background: rgba(255,255,255,0.04);
  border: 1px solid var(--border-default);
  border-radius: 8px;
  color: var(--text-primary);
  font-family: inherit;
  font-size: 14px;
  transition: border-color 0.2s, box-shadow 0.2s;
  outline: none;
}
.field input::placeholder {
  color: var(--text-quaternary);
}
.field input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-dim);
}
.field input.error {
  border-color: var(--error);
  box-shadow: 0 0 0 3px var(--error-bg);
}

/* ── Password strength meter ───────────────────── */
.strength-meter {
  display: flex;
  gap: 4px;
  margin-top: 8px;
  height: 4px;
}
.strength-bar {
  flex: 1;
  height: 100%;
  border-radius: 2px;
  background: var(--border-default);
  transition: background 0.3s ease;
}
.strength-bar.active.s1 { background: var(--error); }
.strength-bar.active.s2 { background: var(--warn-orange); }
.strength-bar.active.s3 { background: var(--warn-yellow); }
.strength-bar.active.s4 { background: var(--success); }

.strength-label {
  font-size: 11px;
  margin-top: 4px;
  color: var(--text-tertiary);
  transition: color 0.3s;
}

/* ── Match indicator ───────────────────────────── */
.match-indicator {
  font-size: 11px;
  margin-top: 4px;
  opacity: 0;
  transition: opacity 0.2s, color 0.2s;
}
.match-indicator.show { opacity: 1; }
.match-indicator.match { color: var(--success); }
.match-indicator.no-match { color: var(--error); }

/* ── Buttons ───────────────────────────────────── */
.btn-primary {
  width: 100%;
  padding: 14px;
  border: none;
  border-radius: 10px;
  background: linear-gradient(135deg, var(--accent), var(--accent-dark));
  color: #fff;
  font-family: inherit;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
  overflow: hidden;
}
.btn-primary:hover:not(:disabled) {
  background: linear-gradient(135deg, var(--accent-hover), var(--accent));
  box-shadow: 0 4px 20px var(--accent-glow);
  transform: translateY(-1px);
}
.btn-primary:active:not(:disabled) {
  transform: translateY(0);
}
.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-secondary {
  width: 100%;
  padding: 14px;
  border: 1px solid var(--border-default);
  border-radius: 10px;
  background: transparent;
  color: var(--text-primary);
  font-family: inherit;
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}
.btn-secondary:hover {
  background: rgba(255,255,255,0.04);
  border-color: rgba(255,255,255,0.2);
}

/* ── Google OAuth button ───────────────────────── */
.btn-google {
  width: 100%;
  padding: 14px;
  border: 1px solid var(--border-default);
  border-radius: 10px;
  background: rgba(255,255,255,0.04);
  color: var(--text-primary);
  font-family: inherit;
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  transition: all 0.2s ease;
  margin-bottom: 24px;
}
.btn-google:hover {
  background: rgba(255,255,255,0.08);
  border-color: rgba(255,255,255,0.2);
}
.btn-google svg {
  width: 18px;
  height: 18px;
}

/* ── Divider ───────────────────────────────────── */
.divider {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 24px;
  color: var(--text-quaternary);
  font-size: 13px;
}
.divider::before,
.divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--border-default);
}

/* ── Error / Status messages ───────────────────── */
.error-msg {
  display: none;
  color: var(--error);
  font-size: 13px;
  text-align: center;
  margin-top: 14px;
  padding: 10px 14px;
  background: var(--error-bg);
  border-radius: 8px;
  animation: fadeSlideIn 0.2s ease-out;
}
.error-msg.show { display: block; }

/* ── Terms / Footer text ───────────────────────── */
.terms {
  text-align: center;
  font-size: 12px;
  color: var(--text-tertiary);
  margin-top: 16px;
  line-height: 1.6;
}
.terms a {
  color: var(--accent);
  text-decoration: none;
}
.terms a:hover {
  text-decoration: underline;
}

.app-link {
  text-align: center;
  font-size: 13px;
  color: var(--text-tertiary);
  margin-top: 24px;
}
.app-link strong {
  color: var(--text-secondary);
  font-weight: 500;
}

/* ── Trust signals ─────────────────────────────── */
.trust-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  margin-top: 24px;
  padding-top: 20px;
  border-top: 1px solid var(--border-default);
}
.trust-item {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: var(--text-tertiary);
  white-space: nowrap;
}
.trust-item svg {
  width: 14px;
  height: 14px;
  color: var(--accent);
  flex-shrink: 0;
}

/* ── Pending screen ────────────────────────────── */
.email-highlight {
  color: var(--accent);
  font-weight: 600;
}
.resend-link {
  color: var(--accent);
  text-decoration: none;
  cursor: pointer;
  font-size: 13px;
}
.resend-link:hover { text-decoration: underline; }
.resend-link.disabled {
  opacity: 0.4;
  pointer-events: none;
}
.resend-note {
  color: var(--text-tertiary);
  font-size: 13px;
  margin-top: 20px;
  text-align: center;
}

/* ── Success checkmark animation ───────────────── */
.checkmark-circle {
  width: 72px;
  height: 72px;
  margin: 0 auto 24px;
}
.checkmark-circle svg {
  width: 72px;
  height: 72px;
}
.checkmark-bg {
  fill: var(--success-bg);
  opacity: 0;
  animation: checkFadeIn 0.4s 0.1s ease-out forwards;
}
.checkmark-path {
  stroke: var(--success);
  stroke-width: 3;
  stroke-linecap: round;
  stroke-linejoin: round;
  fill: none;
  stroke-dasharray: 36;
  stroke-dashoffset: 36;
  animation: checkDraw 0.5s 0.35s ease-out forwards;
}
@keyframes checkFadeIn {
  from { opacity: 0; transform: scale(0.8); }
  to   { opacity: 1; transform: scale(1); }
}
@keyframes checkDraw {
  to { stroke-dashoffset: 0; }
}

/* ── Envelope animation ────────────────────────── */
.envelope-icon {
  width: 56px;
  height: 56px;
  color: var(--accent);
  margin-bottom: 20px;
  animation: envelopeBounce 0.6s ease-out;
  filter: drop-shadow(0 0 12px var(--accent-glow));
}
@keyframes envelopeBounce {
  0%   { transform: scale(0.5) translateY(10px); opacity: 0; }
  60%  { transform: scale(1.05) translateY(-4px); opacity: 1; }
  100% { transform: scale(1) translateY(0); }
}

/* ── Spinner ───────────────────────────────────── */
.spinner {
  display: inline-block;
  width: 18px;
  height: 18px;
  border: 2px solid rgba(255,255,255,0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
  vertical-align: middle;
  margin-right: 8px;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}

/* ── Responsive ────────────────────────────────── */
@media (max-width: 500px) {
  .card { padding: 32px 20px; }
  .trust-bar { flex-direction: column; gap: 8px; }
}
</style>
</head>
<body>

<!-- ═══════════════ SCREEN 1: SIGNUP FORM ═══════════════ -->
<div id="signupScreen" class="screen active">
  <div class="card">
    <div class="logo-section">
      <svg class="logo-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
        <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
        <line x1="12" y1="19" x2="12" y2="23"/>
        <line x1="8" y1="23" x2="16" y2="23"/>
      </svg>
      <h1>Start your free trial</h1>
      <p>14 days free &mdash; no credit card required</p>
    </div>

    <!-- Google OAuth -->
    <button class="btn-google" id="googleBtn">
      <svg viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
      Continue with Google
    </button>

    <div class="divider">or sign up with email</div>

    <!-- Form -->
    <div class="field">
      <label for="fullName">Full Name</label>
      <input type="text" id="fullName" placeholder="Dr. Jane Smith" autocomplete="name" spellcheck="false">
    </div>
    <div class="field">
      <label for="email">Email</label>
      <input type="email" id="email" placeholder="you@practice.com" autocomplete="email" spellcheck="false">
    </div>
    <div class="field">
      <label for="password">Password</label>
      <input type="password" id="password" placeholder="Min 8 characters" autocomplete="new-password">
      <div class="strength-meter">
        <div class="strength-bar" id="sb1"></div>
        <div class="strength-bar" id="sb2"></div>
        <div class="strength-bar" id="sb3"></div>
        <div class="strength-bar" id="sb4"></div>
      </div>
      <div class="strength-label" id="strengthLabel">&nbsp;</div>
    </div>
    <div class="field">
      <label for="confirmPw">Confirm Password</label>
      <input type="password" id="confirmPw" placeholder="Re-enter password" autocomplete="new-password">
      <div class="match-indicator" id="matchIndicator"></div>
    </div>

    <button class="btn-primary" id="signupBtn">Create Account</button>
    <div class="error-msg" id="signupError"></div>

    <div class="terms">
      By signing up, you agree to our
      <a href="https://clinicalflow.us/terms-of-service.html" target="_blank" rel="noopener">Terms of Service</a> and
      <a href="https://clinicalflow.us/privacy-policy.html" target="_blank" rel="noopener">Privacy Policy</a>.
    </div>

    <div class="app-link">
      Already have an account? <strong>Log in from the ClinicalFlow app</strong>
    </div>

    <!-- Trust signals -->
    <div class="trust-bar">
      <div class="trust-item">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        AES-256 encrypted
      </div>
      <div class="trust-item">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
        HIPAA-aligned
      </div>
      <div class="trust-item">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
        Data stays on your device
      </div>
    </div>
  </div>
</div>

<!-- ═══════════════ SCREEN 2: CHECK YOUR EMAIL ═════════ -->
<div id="pendingScreen" class="screen">
  <div class="card">
    <div class="logo-section">
      <svg class="envelope-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="2" y="4" width="20" height="16" rx="2"/>
        <path d="M22 4l-10 8L2 4"/>
      </svg>
      <h1>Check your email</h1>
      <p>We sent a verification link to<br><span class="email-highlight" id="pendingEmail"></span></p>
      <p style="margin-top:12px; color: var(--text-tertiary); font-size: 13px;">
        Click the link in your email to activate your<br>14-day free trial.
      </p>
    </div>

    <button class="btn-primary" id="backToAppBtn" style="margin-top:8px">
      Open ClinicalFlow &amp; Log In
    </button>

    <div class="resend-note">
      Didn't receive it? Check spam or
      <a class="resend-link" id="resendLink">Resend email</a>
    </div>
  </div>
</div>

<!-- ═══════════════ SCREEN 3: VERIFIED SUCCESS ═════════ -->
<div id="successScreen" class="screen">
  <div class="card">
    <div class="logo-section">
      <div class="checkmark-circle">
        <svg viewBox="0 0 72 72">
          <circle class="checkmark-bg" cx="36" cy="36" r="36"/>
          <path class="checkmark-path" d="M22 36l10 10 18-20"/>
        </svg>
      </div>
      <h1>You're all set!</h1>
      <p>Your account is verified and your <strong style="color:var(--accent)">14-day free trial</strong> is now active.</p>
      <p style="margin-top: 12px; color: var(--text-tertiary); font-size: 13px;">
        Open ClinicalFlow and log in with your credentials.
      </p>
    </div>

    <button class="btn-primary" id="launchAppBtn">
      Launch ClinicalFlow
    </button>
    <p style="text-align:center; margin-top:10px; font-size:12px; color:var(--text-tertiary);">
      Or open ClinicalFlow from your Applications folder
    </p>
  </div>
</div>

<!-- ═══════════════ SCREEN 4: ERROR ════════════════════ -->
<div id="errorScreen" class="screen">
  <div class="card">
    <div class="logo-section">
      <svg class="logo-icon" viewBox="0 0 24 24" fill="none" stroke="var(--error)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <line x1="15" y1="9" x2="9" y2="15"/>
        <line x1="9" y1="9" x2="15" y2="15"/>
      </svg>
      <h1>Something went wrong</h1>
      <p id="errorDetail" style="color: var(--text-tertiary);">The verification link may have expired.</p>
    </div>
    <button class="btn-primary" id="retryBtn">Try Again</button>
  </div>
</div>

<!-- ═══════════════ JAVASCRIPT ═════════════════════════ -->
<script>
(function() {
  'use strict';

  const SUPABASE_URL = '${url}';
  const SUPABASE_ANON_KEY = '${key}';
  const REDIRECT_URL = SUPABASE_URL + '/functions/v1/signup-page';
  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // ── Screen management ─────────────────────────
  function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const el = document.getElementById(id);
    if (el) {
      // Force reflow to re-trigger animation
      el.offsetHeight;
      el.classList.add('active');
    }
  }

  // ── Password strength ─────────────────────────
  function calcStrength(pw) {
    let score = 0;
    if (pw.length >= 8)  score++;
    if (pw.length >= 12) score++;
    if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
    if (/\\d/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    // Map 0-5 → 0-4
    return Math.min(4, score);
  }

  const strengthLabels = ['', 'Weak', 'Fair', 'Good', 'Strong'];
  const strengthClasses = ['', 's1', 's2', 's3', 's4'];

  const pwInput = document.getElementById('password');
  const bars = [document.getElementById('sb1'), document.getElementById('sb2'),
                document.getElementById('sb3'), document.getElementById('sb4')];
  const strengthLabel = document.getElementById('strengthLabel');

  pwInput.addEventListener('input', () => {
    const s = calcStrength(pwInput.value);
    bars.forEach((b, i) => {
      b.className = 'strength-bar' + (i < s ? ' active ' + strengthClasses[s] : '');
    });
    strengthLabel.textContent = pwInput.value ? strengthLabels[s] : '';
    strengthLabel.style.color = s === 0 ? 'var(--text-tertiary)' :
      s === 1 ? 'var(--error)' : s === 2 ? 'var(--warn-orange)' :
      s === 3 ? 'var(--warn-yellow)' : 'var(--success)';
    updateMatch();
  });

  // ── Confirm password match ────────────────────
  const confirmInput = document.getElementById('confirmPw');
  const matchIndicator = document.getElementById('matchIndicator');

  function updateMatch() {
    const pw = pwInput.value;
    const cpw = confirmInput.value;
    if (!cpw) {
      matchIndicator.classList.remove('show');
      return;
    }
    matchIndicator.classList.add('show');
    if (pw === cpw) {
      matchIndicator.className = 'match-indicator show match';
      matchIndicator.textContent = 'Passwords match';
    } else {
      matchIndicator.className = 'match-indicator show no-match';
      matchIndicator.textContent = 'Passwords do not match';
    }
  }
  confirmInput.addEventListener('input', updateMatch);

  // ── Error display ─────────────────────────────
  const errEl = document.getElementById('signupError');
  function showError(msg) {
    errEl.textContent = msg;
    errEl.classList.add('show');
  }
  function hideError() {
    errEl.classList.remove('show');
  }

  // ── Signup handler ────────────────────────────
  const signupBtn = document.getElementById('signupBtn');
  let _signupEmail = '';

  signupBtn.addEventListener('click', async () => {
    hideError();
    const name = document.getElementById('fullName').value.trim();
    const email = document.getElementById('email').value.trim();
    const pw = pwInput.value;
    const cpw = confirmInput.value;

    // Validate
    if (!name) return showError('Please enter your full name.');
    if (!email || !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email))
      return showError('Please enter a valid email address.');
    if (pw.length < 8) return showError('Password must be at least 8 characters.');
    if (calcStrength(pw) < 2) return showError('Please choose a stronger password.');
    if (pw !== cpw) return showError('Passwords do not match.');

    signupBtn.disabled = true;
    signupBtn.innerHTML = '<span class="spinner"></span>Creating account\u2026';

    try {
      const { data, error } = await sb.auth.signUp({
        email,
        password: pw,
        options: {
          data: { full_name: name },
          emailRedirectTo: REDIRECT_URL,
        },
      });

      if (error) throw error;

      // Supabase returns fake success with empty identities array for
      // duplicate emails (anti-enumeration). Only trigger on explicit empty
      // array — undefined/null means identities weren't populated (new signup).
      if (Array.isArray(data?.user?.identities) && data.user.identities.length === 0) {
        throw new Error('An account with this email already exists. Try logging in.');
      }

      _signupEmail = email;
      document.getElementById('pendingEmail').textContent = email;
      showScreen('pendingScreen');
    } catch (err) {
      showError(err.message || 'Signup failed. Please try again.');
    } finally {
      signupBtn.disabled = false;
      signupBtn.textContent = 'Create Account';
    }
  });

  // ── Google OAuth handler ──────────────────────
  document.getElementById('googleBtn').addEventListener('click', async () => {
    try {
      const { error } = await sb.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: REDIRECT_URL,
        },
      });
      if (error) throw error;
    } catch (err) {
      showError(err.message || 'Google sign-in failed.');
    }
  });

  // ── Resend verification email ─────────────────
  const resendLink = document.getElementById('resendLink');
  resendLink.addEventListener('click', async (e) => {
    e.preventDefault();
    if (resendLink.classList.contains('disabled')) return;
    resendLink.classList.add('disabled');
    resendLink.textContent = 'Sending\u2026';

    try {
      const { error } = await sb.auth.resend({
        type: 'signup',
        email: _signupEmail,
        options: { emailRedirectTo: REDIRECT_URL },
      });
      if (error) throw error;
      resendLink.textContent = 'Sent! Check your inbox.';
    } catch (err) {
      resendLink.textContent = 'Failed \u2014 try again';
      resendLink.classList.remove('disabled');
    }

    setTimeout(() => {
      resendLink.textContent = 'Resend email';
      resendLink.classList.remove('disabled');
    }, 30000);
  });

  // ── "Open ClinicalFlow" from pending screen ───
  document.getElementById('backToAppBtn').addEventListener('click', () => {
    window.location.href = 'clinicalflow://login';
    setTimeout(() => {
      // Fallback: the deep link didn't work
      alert('Open the ClinicalFlow app from your Applications folder and log in.');
    }, 1500);
  });

  // ── "Launch ClinicalFlow" from success screen ─
  document.getElementById('launchAppBtn').addEventListener('click', () => {
    window.location.href = 'clinicalflow://login';
    setTimeout(() => {
      alert('Open the ClinicalFlow app from your Applications folder and log in.');
    }, 1500);
  });

  // ── "Try Again" from error screen ─────────────
  document.getElementById('retryBtn').addEventListener('click', () => {
    showScreen('signupScreen');
  });

  // ── Enter key submits ─────────────────────────
  document.querySelectorAll('#signupScreen input').forEach(input => {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') signupBtn.click();
    });
  });

  // ── Email verification redirect detection ─────
  // Supabase puts tokens in the URL hash after email confirmation:
  // #access_token=...&refresh_token=...&type=signup
  async function handleRedirect() {
    const hash = window.location.hash;
    if (hash && hash.includes('access_token')) {
      const params = new URLSearchParams(hash.substring(1));
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');
      const type = params.get('type');

      if (accessToken && (type === 'signup' || type === 'email' || type === 'magiclink')) {
        try {
          const { error } = await sb.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken || '',
          });
          if (error) throw error;
          // Clear the hash so refreshing doesn't re-trigger
          history.replaceState(null, '', window.location.pathname);
          showScreen('successScreen');
          return;
        } catch (err) {
          document.getElementById('errorDetail').textContent = err.message;
          showScreen('errorScreen');
          return;
        }
      }
    }

    // Also handle PKCE flow (?code=...)
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    if (code) {
      try {
        const { error } = await sb.auth.exchangeCodeForSession(code);
        if (error) throw error;
        history.replaceState(null, '', window.location.pathname);
        showScreen('successScreen');
        return;
      } catch (err) {
        document.getElementById('errorDetail').textContent = err.message;
        showScreen('errorScreen');
        return;
      }
    }

    // Check for error in hash (e.g., expired link)
    if (hash && hash.includes('error')) {
      const params = new URLSearchParams(hash.substring(1));
      const desc = params.get('error_description') || 'The link may have expired.';
      document.getElementById('errorDetail').textContent = decodeURIComponent(desc.replace(/\\+/g, ' '));
      showScreen('errorScreen');
    }
  }

  handleRedirect();
})();
<\/script>

</body>
</html>`;
}
