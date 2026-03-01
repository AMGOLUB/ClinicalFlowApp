// ────────────────────────────────────────────────────────────
// create-checkout — Creates a Stripe Checkout Session for
// Pro or Team subscription plans.
// ────────────────────────────────────────────────────────────

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import Stripe from 'https://esm.sh/stripe@14?target=deno';
import {
  getServiceClient,
  getTokenFromRequest,
  corsHeaders,
  jsonResponse,
} from '../_shared/supabase-admin.ts';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2023-10-16',
});

const PRICE_MAP: Record<string, string> = {
  pro_monthly:  Deno.env.get('STRIPE_PRICE_PRO_MONTHLY')!,
  pro_annual:   Deno.env.get('STRIPE_PRICE_PRO_ANNUAL')!,
  team_monthly: Deno.env.get('STRIPE_PRICE_TEAM_MONTHLY')!,
  team_annual:  Deno.env.get('STRIPE_PRICE_TEAM_ANNUAL')!,
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // ── Auth ──
  const token = getTokenFromRequest(req);
  if (!token) return jsonResponse({ error: 'Unauthorized' }, 401);

  const supabase = getServiceClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return jsonResponse({ error: 'Invalid token' }, 401);

  try {
    const { plan, seats = 1 } = await req.json();

    const priceId = PRICE_MAP[plan];
    if (!priceId) return jsonResponse({ error: `Unknown plan: ${plan}` }, 400);

    // ── Get or create Stripe customer ──
    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .single();

    let customerId = profile?.stripe_customer_id;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;
      await supabase
        .from('profiles')
        .update({ stripe_customer_id: customerId })
        .eq('id', user.id);
    }

    // ── Create checkout session ──
    const isTeam = plan.startsWith('team_');
    const quantity = isTeam ? Math.max(1, seats) : 1;

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity }],
      success_url: 'https://clinicalflow.us/account.html?checkout=success',
      cancel_url: 'https://clinicalflow.us/account.html?checkout=cancelled',
      subscription_data: {
        metadata: {
          supabase_user_id: user.id,
          plan,
          seats: String(quantity),
        },
      },
      metadata: { supabase_user_id: user.id },
    });

    return jsonResponse({ url: session.url });
  } catch (err) {
    console.error('[create-checkout]', err);
    return jsonResponse({ error: 'Checkout failed', details: (err as Error).message }, 500);
  }
});
