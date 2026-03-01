# Supabase Email Templates for ClinicalFlow

Paste these into **Supabase Dashboard → Authentication → Email Templates**.

---

## 1. Confirm Signup

**Subject:** `Verify your ClinicalFlow account`

**Body:**

```html
<div style="max-width:520px;margin:40px auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <div style="background:#0F172A;border-radius:16px 16px 0 0;padding:32px 40px;text-align:center;">
    <div style="display:inline-flex;align-items:center;gap:10px;">
      <div style="width:36px;height:36px;background:#0891B2;border-radius:10px;display:flex;align-items:center;justify-content:center;">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v4a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v1a7 7 0 0 1-14 0v-1"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
      </div>
      <span style="color:#fff;font-size:20px;font-weight:700;letter-spacing:-0.02em;">Clinical<span style="color:#0891B2;">Flow</span></span>
    </div>
  </div>
  <div style="background:#ffffff;border:1px solid #E2E8F0;border-top:none;border-radius:0 0 16px 16px;padding:40px;">
    <h1 style="font-size:24px;font-weight:700;color:#0F172A;margin:0 0 12px;">Verify your email</h1>
    <p style="font-size:15px;color:#475569;line-height:1.6;margin:0 0 28px;">
      Thanks for creating a ClinicalFlow account. Click the button below to verify your email address and start your <strong style="color:#0891B2;">14-day free trial</strong>.
    </p>
    <a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#0891B2;color:#fff;text-decoration:none;font-size:15px;font-weight:600;padding:14px 32px;border-radius:8px;">
      Verify Email Address
    </a>
    <p style="font-size:13px;color:#94A3B8;line-height:1.5;margin:28px 0 0;">
      If you didn't create a ClinicalFlow account, you can safely ignore this email.
    </p>
    <hr style="border:none;border-top:1px solid #E2E8F0;margin:28px 0;">
    <p style="font-size:12px;color:#94A3B8;margin:0;text-align:center;">
      ClinicalFlow — AI-powered clinical documentation<br>
      <a href="https://clinicalflow.us" style="color:#0891B2;text-decoration:none;">clinicalflow.us</a>
    </p>
  </div>
</div>
```

---

## 2. Reset Password (Magic Link)

**Subject:** `Reset your ClinicalFlow password`

**Body:**

```html
<div style="max-width:520px;margin:40px auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <div style="background:#0F172A;border-radius:16px 16px 0 0;padding:32px 40px;text-align:center;">
    <div style="display:inline-flex;align-items:center;gap:10px;">
      <div style="width:36px;height:36px;background:#0891B2;border-radius:10px;display:flex;align-items:center;justify-content:center;">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v4a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v1a7 7 0 0 1-14 0v-1"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
      </div>
      <span style="color:#fff;font-size:20px;font-weight:700;letter-spacing:-0.02em;">Clinical<span style="color:#0891B2;">Flow</span></span>
    </div>
  </div>
  <div style="background:#ffffff;border:1px solid #E2E8F0;border-top:none;border-radius:0 0 16px 16px;padding:40px;">
    <h1 style="font-size:24px;font-weight:700;color:#0F172A;margin:0 0 12px;">Reset your password</h1>
    <p style="font-size:15px;color:#475569;line-height:1.6;margin:0 0 28px;">
      We received a request to reset your ClinicalFlow password. Click the button below to choose a new password.
    </p>
    <a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#0891B2;color:#fff;text-decoration:none;font-size:15px;font-weight:600;padding:14px 32px;border-radius:8px;">
      Reset Password
    </a>
    <p style="font-size:13px;color:#94A3B8;line-height:1.5;margin:28px 0 0;">
      This link expires in 24 hours. If you didn't request a password reset, you can safely ignore this email.
    </p>
    <hr style="border:none;border-top:1px solid #E2E8F0;margin:28px 0;">
    <p style="font-size:12px;color:#94A3B8;margin:0;text-align:center;">
      ClinicalFlow — AI-powered clinical documentation<br>
      <a href="https://clinicalflow.us" style="color:#0891B2;text-decoration:none;">clinicalflow.us</a>
    </p>
  </div>
</div>
```

---

## 3. Magic Link (if enabled)

**Subject:** `Your ClinicalFlow login link`

**Body:**

```html
<div style="max-width:520px;margin:40px auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <div style="background:#0F172A;border-radius:16px 16px 0 0;padding:32px 40px;text-align:center;">
    <div style="display:inline-flex;align-items:center;gap:10px;">
      <div style="width:36px;height:36px;background:#0891B2;border-radius:10px;display:flex;align-items:center;justify-content:center;">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v4a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v1a7 7 0 0 1-14 0v-1"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
      </div>
      <span style="color:#fff;font-size:20px;font-weight:700;letter-spacing:-0.02em;">Clinical<span style="color:#0891B2;">Flow</span></span>
    </div>
  </div>
  <div style="background:#ffffff;border:1px solid #E2E8F0;border-top:none;border-radius:0 0 16px 16px;padding:40px;">
    <h1 style="font-size:24px;font-weight:700;color:#0F172A;margin:0 0 12px;">Your login link</h1>
    <p style="font-size:15px;color:#475569;line-height:1.6;margin:0 0 28px;">
      Click the button below to log in to your ClinicalFlow account. This link is valid for one use.
    </p>
    <a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#0891B2;color:#fff;text-decoration:none;font-size:15px;font-weight:600;padding:14px 32px;border-radius:8px;">
      Log In to ClinicalFlow
    </a>
    <p style="font-size:13px;color:#94A3B8;line-height:1.5;margin:28px 0 0;">
      If you didn't request this link, you can safely ignore this email.
    </p>
    <hr style="border:none;border-top:1px solid #E2E8F0;margin:28px 0;">
    <p style="font-size:12px;color:#94A3B8;margin:0;text-align:center;">
      ClinicalFlow — AI-powered clinical documentation<br>
      <a href="https://clinicalflow.us" style="color:#0891B2;text-decoration:none;">clinicalflow.us</a>
    </p>
  </div>
</div>
```

---

## How to Apply

1. Go to **https://supabase.com/dashboard/project/seuinmmslazvibotoupm/auth/templates**
2. For each template type (Confirm signup, Reset password, Magic link):
   - Update the **Subject** field
   - Replace the **Body** with the HTML above (copy everything inside the ```html blocks)
   - Click **Save**
