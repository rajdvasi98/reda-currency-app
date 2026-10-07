/**
 * Shopify Script Tag helpers.
 * Script tags inject the storefront widget JS into every theme page automatically,
 * so merchants don't need to edit their theme code.
 */
import { getDb } from '../database/init.js';

export async function installScriptTag(shop, accessToken, appHost) {
  const scriptUrl = `${appHost}/widget/currency-widget.js`;

  const query = `
    mutation scriptTagCreate($input: ScriptTagInput!) {
      scriptTagCreate(input: $input) {
        scriptTag {
          id
          src
          displayScope
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const variables = {
    input: {
      src: scriptUrl,
      displayScope: 'ALL',
    },
  };

  const response = await shopifyGraphQL(shop, accessToken, query, variables);
  const result = response?.scriptTagCreate;

  if (result?.userErrors?.length > 0) {
    console.error('Script tag install errors:', result.userErrors);
    return null;
  }

  console.log('Script tag installed:', result?.scriptTag?.id);
  return result?.scriptTag;
}

export async function removeScriptTags(shop, accessToken, appHost) {
  const scriptUrl = `${appHost}/widget/currency-widget.js`;

  // List existing script tags matching our URL
  const listQuery = `
    query {
      scriptTags(first: 10, src: "${scriptUrl}") {
        edges {
          node { id }
        }
      }
    }
  `;

  const listRes = await shopifyGraphQL(shop, accessToken, listQuery, {});
  const tags = listRes?.scriptTags?.edges?.map(e => e.node.id) || [];

  const deleteQuery = `
    mutation scriptTagDelete($id: ID!) {
      scriptTagDelete(id: $id) {
        deletedScriptTagId
        userErrors { field message }
      }
    }
  `;

  for (const id of tags) {
    await shopifyGraphQL(shop, accessToken, deleteQuery, { id });
  }
}

async function shopifyGraphQL(shop, accessToken, query, variables) {
  const res = await fetch(`https://${shop}/admin/api/2024-01/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': accessToken,
    },
    body: JSON.stringify({ query, variables }),
  });

  const json = await res.json();
  return json?.data;
}
