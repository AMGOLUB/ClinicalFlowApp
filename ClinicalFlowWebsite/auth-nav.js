/* ═══════════════════════════════════════════════════════════════
   auth-nav.js — Shared Auth-Aware Navigation Module

   Included on every page. Transforms the nav based on Supabase
   auth state: logged-out shows default buttons, logged-in shows
   user avatar pill with dropdown.
   ═══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  // ── Constants ──────────────────────────────────────────────
  var SUPABASE_URL = 'https://seuinmmslazvibotoupm.supabase.co';
  var SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNldWlubW1zbGF6dmlib3RvdXBtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMjM4MjAsImV4cCI6MjA4Nzc5OTgyMH0.YE4e8bf6Q_4zfvu9zLpaMIrfbnsf6Z9ucf2mSebyrqY';

  // ── Bail if Supabase CDN didn't load ───────────────────────
  if (typeof supabase === 'undefined') {
    var cta = document.querySelector('.nav-cta');
    if (cta) cta.classList.remove('nav-cta--loading');
    console.warn('[auth-nav] Supabase CDN not loaded — showing logged-out nav.');
    return;
  }

  // ── Supabase singleton ─────────────────────────────────────
  if (!window.__cfSupabase) {
    window.__cfSupabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  }
  var sb = window.__cfSupabase;

  // ── Find nav-cta ───────────────────────────────────────────
  var navCta = document.querySelector('.nav-cta');
  if (!navCta) return; // Page has no nav — nothing to do

  // Store original HTML for reverting on sign-out
  var originalNavHtml = navCta.innerHTML;

  // ── Helpers ────────────────────────────────────────────────

  function getPlanBadge(profile) {
    if (!profile || !profile.status) return null;

    var status = profile.status;

    if (status === 'pending_verification') {
      return { cls: 'nav-plan-badge--pending', text: 'Verify Email' };
    }

    if (status === 'trial') {
      var daysLeft = profile.trial_ends_at
        ? Math.ceil((new Date(profile.trial_ends_at) - new Date()) / 86400000)
        : 0;
      if (daysLeft <= 0) {
        return { cls: 'nav-plan-badge--expired', text: 'Trial Expired' };
      }
      var dayText = daysLeft === 1 ? 'Trial \u00b7 Last day' : 'Trial \u00b7 ' + daysLeft + ' days left';
      return { cls: 'nav-plan-badge--trial', text: dayText };
    }

    if (status === 'active') {
      var planNames = {
        pro_monthly: 'Pro Plan', pro_annual: 'Pro Plan',
        team_monthly: 'Team Plan', team_annual: 'Team Plan'
      };
      var label = (profile.selected_plan && planNames[profile.selected_plan]) || 'Active';
      return { cls: 'nav-plan-badge--active', text: label };
    }

    if (status === 'past_due') {
      return { cls: 'nav-plan-badge--past-due', text: 'Payment Issue' };
    }

    if (status === 'expired' || status === 'canceled') {
      return { cls: 'nav-plan-badge--expired', text: 'Expired' };
    }

    return null;
  }

  function buildLoggedInHtml(firstName, initial, fullName, email) {
    return ''
      + '<div class="nav-user" id="navUser">'
      +   '<button class="nav-user-btn" id="navUserBtn" aria-expanded="false" aria-haspopup="true">'
      +     '<div class="nav-avatar" aria-hidden="true">' + initial + '</div>'
      +     '<span class="nav-user-name">' + firstName + '</span>'
      +     '<svg class="nav-user-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
      +          'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
      +       '<polyline points="6 9 12 15 18 9"/>'
      +     '</svg>'
      +   '</button>'
      +   '<div class="nav-dropdown" id="navDropdown" role="menu">'
      +     '<div class="nav-dropdown-header">'
      +       '<div class="nav-dropdown-name">' + escHtml(fullName || email) + '</div>'
      +       '<div class="nav-dropdown-email">' + escHtml(email) + '</div>'
      +       '<div class="nav-dropdown-plan" id="navDropdownPlan"></div>'
      +     '</div>'
      +     '<div class="nav-dropdown-divider"></div>'
      +     '<a href="welcome.html" class="nav-dropdown-item" role="menuitem">'
      +       '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
      +         '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'
      +         '<polyline points="9 22 9 12 15 12 15 22"/>'
      +       '</svg>'
      +       'Dashboard'
      +     '</a>'
      +     '<a href="get-started.html" class="nav-dropdown-item" role="menuitem">'
      +       '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
      +         '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>'
      +         '<polyline points="7 10 12 15 17 10"/>'
      +         '<line x1="12" x2="12" y1="15" y2="3"/>'
      +       '</svg>'
      +       'Download App'
      +     '</a>'
      +     '<a href="account.html" class="nav-dropdown-item" role="menuitem">'
      +       '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
      +         '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>'
      +         '<circle cx="12" cy="7" r="4"/>'
      +       '</svg>'
      +       'Account Settings'
      +     '</a>'
      +     '<a href="docs.html" class="nav-dropdown-item" role="menuitem">'
      +       '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
      +         '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>'
      +         '<path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>'
      +       '</svg>'
      +       'Documentation'
      +     '</a>'
      +     '<div class="nav-dropdown-divider"></div>'
      +     '<button class="nav-dropdown-item nav-dropdown-item--danger" id="navSignOut" role="menuitem">'
      +       '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
      +         '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>'
      +         '<polyline points="16 17 21 12 16 7"/>'
      +         '<line x1="21" x2="9" y1="12" y2="12"/>'
      +       '</svg>'
      +       'Sign Out'
      +     '</button>'
      +   '</div>'
      + '</div>';
  }

  function escHtml(str) {
    var el = document.createElement('span');
    el.textContent = str || '';
    return el.innerHTML;
  }

  function renderLoggedOutNav() {
    navCta.innerHTML = originalNavHtml;
    navCta.classList.remove('nav-cta--loading');
  }

  function attachDropdownHandlers() {
    var navUser = document.getElementById('navUser');
    var navUserBtn = document.getElementById('navUserBtn');
    var navSignOut = document.getElementById('navSignOut');

    if (!navUser || !navUserBtn) return;

    // Toggle dropdown
    navUserBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      var isOpen = navUser.classList.toggle('open');
      navUserBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });

    // Close on outside click
    document.addEventListener('click', function (e) {
      if (navUser.classList.contains('open') && !navUser.contains(e.target)) {
        navUser.classList.remove('open');
        navUserBtn.setAttribute('aria-expanded', 'false');
      }
    });

    // Close on Escape
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && navUser.classList.contains('open')) {
        navUser.classList.remove('open');
        navUserBtn.setAttribute('aria-expanded', 'false');
        navUserBtn.focus();
      }
    });

    // Sign Out
    if (navSignOut) {
      navSignOut.addEventListener('click', async function () {
        navSignOut.disabled = true;
        navSignOut.textContent = 'Signing out\u2026';
        await sb.auth.signOut();
        window.location.href = 'index.html';
      });
    }
  }

  // ── Main logic ─────────────────────────────────────────────

  async function initAuthNav() {
    try {
      var result = await sb.auth.getSession();
      var session = result.data.session;

      if (!session) {
        // No session → show logged-out nav (already in HTML)
        navCta.classList.remove('nav-cta--loading');
        return;
      }

      // ── Session exists — render logged-in nav immediately ──
      var user = session.user;
      var fullName = (user.user_metadata && user.user_metadata.full_name) || '';
      var email = user.email || '';
      var firstName = fullName ? fullName.split(' ')[0] : email.split('@')[0];
      var initial = ((firstName || email)[0] || '?').toUpperCase();

      navCta.innerHTML = buildLoggedInHtml(firstName, initial, fullName, email);
      navCta.classList.remove('nav-cta--loading');
      attachDropdownHandlers();

      // ── Fetch profile in background for plan badge ──
      try {
        var profileResult = await sb
          .from('profiles')
          .select('status, selected_plan, trial_ends_at, subscription_ends_at')
          .eq('id', user.id)
          .single();

        var profile = profileResult.data;
        var badge = getPlanBadge(profile);
        var planEl = document.getElementById('navDropdownPlan');

        if (badge && planEl) {
          if (profile.status === 'pending_verification') {
            planEl.innerHTML = '<button class="nav-plan-badge ' + badge.cls + '" id="navResendVerify">' + badge.text + '</button>';
            var resendBtn = document.getElementById('navResendVerify');
            resendBtn.addEventListener('click', function (e) {
              e.stopPropagation();
              if (resendBtn.disabled) return;
              resendBtn.disabled = true;
              resendBtn.textContent = 'Sending\u2026';
              sb.auth.resend({
                type: 'signup',
                email: email,
                options: { emailRedirectTo: window.location.origin + '/signup.html' }
              }).then(function (result) {
                if (result.error) {
                  resendBtn.textContent = 'Failed \u2014 retry';
                  resendBtn.disabled = false;
                } else {
                  resendBtn.textContent = 'Sent! Check inbox';
                  setTimeout(function () {
                    resendBtn.textContent = 'Verify Email';
                    resendBtn.disabled = false;
                  }, 30000);
                }
              });
            });
          } else {
            planEl.innerHTML = '<span class="nav-plan-badge ' + badge.cls + '">' + badge.text + '</span>';
          }
        }
      } catch (profileErr) {
        console.warn('[auth-nav] Profile fetch failed — nav still works, no badge:', profileErr);
      }

    } catch (err) {
      // Session check failed — show logged-out state
      console.warn('[auth-nav] Session check failed:', err);
      navCta.classList.remove('nav-cta--loading');
    }
  }

  // ── Auth state change listener ─────────────────────────────
  // Track whether initial auth check is done to avoid reacting
  // to the INITIAL_SESSION event that fires immediately on subscribe.
  var initialCheckDone = false;

  sb.auth.onAuthStateChange(function (event) {
    if (!initialCheckDone) return; // Ignore initial event — initAuthNav handles it

    if (event === 'SIGNED_OUT') {
      renderLoggedOutNav();
    }
    if (event === 'SIGNED_IN') {
      // User signed in from another tab — reload to update nav
      window.location.reload();
    }
  });

  // ── Run ────────────────────────────────────────────────────
  initAuthNav().then(function () { initialCheckDone = true; });

})();
