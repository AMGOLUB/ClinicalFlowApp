import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock browser globals before importing ───────────────────
globalThis.window = {
  ENV: { SUPABASE_URL: 'https://test.supabase.co', SUPABASE_ANON_KEY: 'test-anon-key' },
  __TAURI__: null,
  open: vi.fn()
};
globalThis.document = {
  getElementById: () => null,
  querySelectorAll: () => [],
  querySelector: () => null
};
globalThis.fetch = vi.fn();
globalThis.localStorage = {
  _store: {},
  getItem(k) { return this._store[k] ?? null; },
  setItem(k, v) { this._store[k] = v; },
  removeItem(k) { delete this._store[k]; }
};

const {
  checkSubscription,
  subFetchLicenseKey,
  checkTrialWarning,
  subForgotPassword,
  getPrePinSession,
} = await import('../src/subscription.js');


// ═══════════════════════════════════════════════════════════════
// checkSubscription (post-PIN, cfg-based)
// ═══════════════════════════════════════════════════════════════

describe('checkSubscription', () => {
  let cfg;

  beforeEach(() => {
    cfg = {
      _data: {},
      get(k, fb) { return this._data[k] ?? fb; },
      set(k, v) { this._data[k] = v; },
      _flush: vi.fn()
    };
    fetch.mockReset();
  });

  it('returns not_registered when no license key', async () => {
    const result = await checkSubscription(cfg);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('not_registered');
  });

  it('trusts cache when verified within 24 hours', async () => {
    cfg._data = {
      'ms-license-key': 'test-key',
      'ms-sub-verified': new Date().toISOString(),
      'ms-sub-status': 'active',
      'ms-sub-tier': 'pro'
    };
    const result = await checkSubscription(cfg);
    expect(result.valid).toBe(true);
    expect(result.status).toBe('active');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('detects expired trial from cache', async () => {
    cfg._data = {
      'ms-license-key': 'test-key',
      'ms-sub-verified': new Date().toISOString(),
      'ms-sub-status': 'trial',
      'ms-trial-ends': new Date(Date.now() - 86400000).toISOString() // yesterday
    };
    const result = await checkSubscription(cfg);
    expect(result.valid).toBe(false);
    expect(result.status).toBe('expired');
    expect(result.reason).toBe('Trial expired');
  });

  it('calls verify-license when cache is stale (>24h)', async () => {
    cfg._data = {
      'ms-license-key': 'test-key',
      'ms-sub-verified': new Date(Date.now() - 25 * 3600 * 1000).toISOString(), // 25h ago
      'ms-sub-status': 'trial'
    };
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        valid: true, status: 'active', tier: 'pro',
        reason: '', days_remaining: null
      })
    });
    const result = await checkSubscription(cfg);
    expect(result.valid).toBe(true);
    expect(result.status).toBe('active');
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('uses offline grace period when network fails', async () => {
    cfg._data = {
      'ms-license-key': 'test-key',
      'ms-sub-verified': new Date(Date.now() - 2 * 86400000).toISOString(), // 2 days ago
      'ms-sub-status': 'active'
    };
    fetch.mockRejectedValueOnce(new Error('Network error'));
    const result = await checkSubscription(cfg);
    expect(result.valid).toBe(true);
    expect(result.reason).toContain('Offline');
  });

  it('blocks when grace period expired (>30 days)', async () => {
    cfg._data = {
      'ms-license-key': 'test-key',
      'ms-sub-verified': new Date(Date.now() - 31 * 86400000).toISOString(), // 31 days ago
      'ms-sub-status': 'active'
    };
    fetch.mockRejectedValueOnce(new Error('Network error'));
    const result = await checkSubscription(cfg);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('connect to the internet');
  });

  it('treats past_due as valid', async () => {
    cfg._data = {
      'ms-license-key': 'test-key',
      'ms-sub-verified': new Date().toISOString(),
      'ms-sub-status': 'past_due'
    };
    const result = await checkSubscription(cfg);
    expect(result.valid).toBe(true);
  });
});


// ═══════════════════════════════════════════════════════════════
// subFetchLicenseKey
// ═══════════════════════════════════════════════════════════════

describe('subFetchLicenseKey', () => {
  beforeEach(() => { fetch.mockReset(); });

  it('returns license_key from profile', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ license_key: 'abc-123' }]
    });
    const key = await subFetchLicenseKey('token-xyz');
    expect(key).toBe('abc-123');
    expect(fetch).toHaveBeenCalledOnce();
    const [url, opts] = fetch.mock.calls[0];
    expect(url).toContain('/rest/v1/profiles');
    expect(opts.headers['Authorization']).toBe('Bearer token-xyz');
  });

  it('returns null on failure', async () => {
    fetch.mockResolvedValueOnce({ ok: false });
    const key = await subFetchLicenseKey('bad-token');
    expect(key).toBeNull();
  });

  it('returns null on empty response', async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => [] });
    const key = await subFetchLicenseKey('token');
    expect(key).toBeNull();
  });
});


// ═══════════════════════════════════════════════════════════════
// subForgotPassword
// ═══════════════════════════════════════════════════════════════

describe('subForgotPassword', () => {
  beforeEach(() => { fetch.mockReset(); });

  it('returns error when email is empty', async () => {
    const result = await subForgotPassword('');
    expect(result.success).toBe(false);
    expect(result.error).toContain('email');
  });

  it('returns success on 200', async () => {
    fetch.mockResolvedValueOnce({ ok: true });
    const result = await subForgotPassword('test@example.com');
    expect(result.success).toBe(true);
    const [url] = fetch.mock.calls[0];
    expect(url).toContain('/auth/v1/recover');
  });

  it('returns error on failure', async () => {
    fetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: { message: 'Rate limited' } })
    });
    const result = await subForgotPassword('test@example.com');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Rate limited');
  });
});


// ═══════════════════════════════════════════════════════════════
// checkTrialWarning
// ═══════════════════════════════════════════════════════════════

describe('checkTrialWarning', () => {
  beforeEach(() => {
    localStorage._store = {};
  });

  it('does nothing for active (non-trial) subscriptions', () => {
    checkTrialWarning({ status: 'active', daysRemaining: 2 });
    // No toast element in our mock, so just verify no error thrown
  });

  it('does nothing when >3 days remaining', () => {
    checkTrialWarning({ status: 'trial', daysRemaining: 5 });
    expect(localStorage.getItem('cf-trial-warning-date')).toBeNull();
  });

  it('does not crash when DOM elements missing', () => {
    // With our null-returning getElementById mock, this should not throw
    expect(() => {
      checkTrialWarning({ status: 'trial', daysRemaining: 2 });
    }).not.toThrow();
  });
});


// ═══════════════════════════════════════════════════════════════
// getPrePinSession
// ═══════════════════════════════════════════════════════════════

describe('getPrePinSession', () => {
  it('returns null before any login', () => {
    expect(getPrePinSession()).toBeNull();
  });
});


// ═══════════════════════════════════════════════════════════════
// Verify interval constants
// ═══════════════════════════════════════════════════════════════

describe('verify interval', () => {
  it('uses 24-hour verification interval (not 7 days)', async () => {
    // If verified 25h ago with active status, it should call fetch
    const cfg = {
      _data: {
        'ms-license-key': 'key',
        'ms-sub-verified': new Date(Date.now() - 25 * 3600 * 1000).toISOString(),
        'ms-sub-status': 'active'
      },
      get(k, fb) { return this._data[k] ?? fb; },
      set(k, v) { this._data[k] = v; },
      _flush: vi.fn()
    };
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ valid: true, status: 'active', tier: 'pro' })
    });
    await checkSubscription(cfg);
    expect(fetch).toHaveBeenCalled();
  });

  it('trusts cache at 23 hours', async () => {
    const cfg = {
      _data: {
        'ms-license-key': 'key',
        'ms-sub-verified': new Date(Date.now() - 23 * 3600 * 1000).toISOString(),
        'ms-sub-status': 'active'
      },
      get(k, fb) { return this._data[k] ?? fb; },
      set(k, v) { this._data[k] = v; },
      _flush: vi.fn()
    };
    fetch.mockReset();
    await checkSubscription(cfg);
    expect(fetch).not.toHaveBeenCalled();
  });
});
