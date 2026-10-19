/**
 * Shopify Billing API integration.
 * Plans: monthly ($5/mo) and annual ($50/yr).
 * Uses Shopify app subscriptions (GraphQL Billing API).
 */
import { dbGet, dbRun } from '../database/init.js';

export const PLANS = {
  monthly: {
    id: 'monthly',
    name: 'Multi Currency Converter — Monthly',
    price: 5.00,
    interval: 'EVERY_30_DAYS',
    trialDays: 7,
    currencyCode: 'USD',
  },
  annual: {
    id: 'annual',
    name: 'Multi Currency Converter — Annual',
    price: 50.00,
    interval: 'ANNUAL',
    trialDays: 7,
    currencyCode: 'USD',
  },
};

/**
 * Create a Shopify App Subscription (GraphQL Billing API).
 * Returns the confirmation URL to redirect the merchant to.
 */
export async function createSubscription(shop, accessToken, planId, returnUrl) {
  const plan = PLANS[planId];
  if (!plan) throw new Error(`Unknown plan: ${planId}`);

  const mutation = `
    mutation appSubscriptionCreate($name: String!, $lineItems: [AppSubscriptionLineItemInput!]!, $returnUrl: URL!, $trialDays: Int, $test: Boolean) {
      appSubscriptionCreate(name: $name, lineItems: $lineItems, returnUrl: $returnUrl, trialDays: $trialDays, test: $test) {
        appSubscription {
          id
          status
        }
        confirmationUrl
        userErrors {
          field
          message
        }
      }
    }
  `;

  // Development stores (including Shopify's review stores) can only accept test charges.
  const shopInfo = await shopifyGraphQL(shop, accessToken, '{ shop { plan { partnerDevelopment } } }', {});

  const variables = {
    name: plan.name,
    returnUrl,
    trialDays: plan.trialDays,
    test: shopInfo?.shop?.plan?.partnerDevelopment === true,
    lineItems: [
      {
        plan: {
          appRecurringPricingDetails: {
            price: { amount: plan.price, currencyCode: plan.currencyCode },
            interval: plan.interval,
          },
        },
      },
    ],
  };

  const res = await shopifyGraphQL(shop, accessToken, mutation, variables);
  const result = res?.appSubscriptionCreate;

  if (result?.userErrors?.length > 0) {
    throw new Error(result.userErrors.map(e => e.message).join(', '));
  }

  return {
    confirmationUrl: result?.confirmationUrl,
    subscriptionId: result?.appSubscription?.id,
  };
}

/**
 * Fetch the current active subscription for a shop.
 */
export async function getActiveSubscription(shop, accessToken) {
  const query = `
    query {
      appInstallation {
        activeSubscriptions {
          id
          name
          status
          trialDays
          currentPeriodEnd
          lineItems {
            plan {
              pricingDetails {
                ... on AppRecurringPricing {
                  price { amount currencyCode }
                  interval
                }
              }
            }
          }
        }
      }
    }
  `;

  const res = await shopifyGraphQL(shop, accessToken, query, {});
  return res?.appInstallation?.activeSubscriptions?.[0] || null;
}

/**
 * Mirror the shop's live Shopify subscription into the local table, which gates the
 * admin features and the storefront widget. Returns the local row, or null if none.
 */
export async function syncSubscription(shopId, shop, accessToken) {
  const live = await getActiveSubscription(shop, accessToken);
  if (!live || live.status !== 'ACTIVE') {
    await dbRun('DELETE FROM subscriptions WHERE shop_id = $1', [shopId]);
    return null;
  }
  await dbRun(`
    INSERT INTO subscriptions (shop_id, plan, status, shopify_charge_id, current_period_end)
    VALUES ($1, $2, 'active', $3, $4)
    ON CONFLICT(shop_id) DO UPDATE SET
      plan = excluded.plan, status = 'active',
      shopify_charge_id = excluded.shopify_charge_id,
      current_period_end = excluded.current_period_end,
      updated_at = NOW()
  `, [shopId, live.name.includes('Annual') ? 'annual' : 'monthly', live.id, live.currentPeriodEnd]);
  return dbGet('SELECT * FROM subscriptions WHERE shop_id = $1', [shopId]);
}

/**
 * Cancel an active subscription.
 */
export async function cancelSubscription(shop, accessToken, subscriptionId) {
  const mutation = `
    mutation appSubscriptionCancel($id: ID!) {
      appSubscriptionCancel(id: $id) {
        appSubscription { id status }
        userErrors { field message }
      }
    }
  `;

  const res = await shopifyGraphQL(shop, accessToken, mutation, { id: subscriptionId });
  return res?.appSubscriptionCancel;
}

export async function shopifyGraphQL(shop, accessToken, query, variables) {
  const res = await fetch(`https://${shop}/admin/api/2026-04/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': accessToken,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) throw new Error(`Shopify GraphQL error: ${res.status}`);
  const json = await res.json();

  if (json.errors?.length > 0) {
    throw new Error(json.errors.map(e => e.message).join(', '));
  }

  return json.data;
}
