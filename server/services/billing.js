/**
 * Shopify Billing API integration.
 * Plans: monthly ($5/mo) and annual ($50/yr).
 * Uses Shopify's recurring application charges (REST) or app subscriptions (GraphQL).
 */

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

  const variables = {
    name: plan.name,
    returnUrl,
    trialDays: plan.trialDays,
    test: process.env.NODE_ENV !== 'production',
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

async function shopifyGraphQL(shop, accessToken, query, variables) {
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
