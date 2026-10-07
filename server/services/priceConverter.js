/**
 * Price conversion engine.
 * Resolution order for a given (shop, country, product):
 *   1. Product-level price override rule (exact price, no conversion)
 *   2. All-products percentage or fixed adjustment rule
 *   3. Exchange rate x country-level percentage/fixed adjustment
 * Rounding is applied last, after all adjustments.
 */
import { dbGet, dbAll } from '../database/init.js';
import { getRate } from './exchangeRate.js';

function applyRounding(price, rule) {
  switch (rule) {
    case 'nearest_99': return Math.floor(price) + 0.99;
    case 'nearest_95': return Math.floor(price) + 0.95;
    case 'nearest_integer': return Math.round(price);
    case 'nearest_10': return Math.round(price / 10) * 10;
    case 'nearest_50': return Math.round(price / 50) * 50;
    case 'nearest_100': return Math.round(price / 100) * 100;
    default: return price;
  }
}

export async function convertPrice(shopId, basePrice, baseCurrency, countryCode, productId = null) {
  if (!basePrice || basePrice <= 0) return { price: basePrice, currency: baseCurrency, converted: false };

  const country = await dbGet(
    'SELECT * FROM countries WHERE shop_id = $1 AND country_code = $2 AND is_enabled = 1',
    [shopId, countryCode]
  );

  if (!country) return { price: basePrice, currency: baseCurrency, converted: false };

  const targetCurrency = country.currency_code;

  const rules = await dbAll(`
    SELECT * FROM pricing_rules
    WHERE shop_id = $1 AND country_code = $2 AND is_enabled = 1
    ORDER BY priority DESC, CASE rule_type WHEN 'product' THEN 1 WHEN 'collection' THEN 2 ELSE 3 END ASC
  `, [shopId, countryCode]);

  let overrideRule = null;
  for (const rule of rules) {
    if (rule.rule_type === 'product' && productId && rule.shopify_resource_id === String(productId)) {
      overrideRule = rule; break;
    }
    if (rule.rule_type === 'all' && !overrideRule) overrideRule = rule;
  }

  if (overrideRule?.price_override != null) {
    return { price: applyRounding(overrideRule.price_override, country.rounding_rule), currency: targetCurrency, converted: true, source: 'override' };
  }

  const rate = await getRate(shopId, baseCurrency, targetCurrency);
  if (!rate) return { price: basePrice, currency: baseCurrency, converted: false };

  let converted = basePrice * rate;

  if (country.price_adjustment_type === 'percentage' && country.price_adjustment_value) {
    converted *= (1 + country.price_adjustment_value / 100);
  } else if (country.price_adjustment_type === 'fixed' && country.price_adjustment_value) {
    converted += country.price_adjustment_value;
  }

  if (overrideRule?.percentage_adjustment != null) {
    converted *= (1 + overrideRule.percentage_adjustment / 100);
  }

  return { price: applyRounding(converted, country.rounding_rule), currency: targetCurrency, converted: true };
}

export async function formatPrice(price, currencyCode) {
  const currency = await dbGet('SELECT * FROM currencies WHERE code = $1', [currencyCode]);
  if (!currency) return `${currencyCode} ${price.toFixed(2)}`;
  const formatted = price.toFixed(currency.decimal_places).replace(/\B(?=(\d{3})+(?!\d))/g, currency.thousand_separator);
  return currency.symbol_position === 'before' ? `${currency.symbol}${formatted}` : `${formatted} ${currency.symbol}`;
}
