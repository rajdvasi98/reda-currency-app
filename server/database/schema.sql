CREATE TABLE IF NOT EXISTS shops (
  id SERIAL PRIMARY KEY,
  shop_domain TEXT UNIQUE NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  default_currency TEXT DEFAULT 'USD',
  is_active INTEGER DEFAULT 1,
  installed_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS currencies (
  id SERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  symbol TEXT NOT NULL,
  symbol_position TEXT DEFAULT 'before',
  decimal_places INTEGER DEFAULT 2,
  thousand_separator TEXT DEFAULT ',',
  decimal_separator TEXT DEFAULT '.'
);

CREATE TABLE IF NOT EXISTS countries (
  id SERIAL PRIMARY KEY,
  shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  country_code TEXT NOT NULL,
  country_name TEXT NOT NULL,
  currency_code TEXT NOT NULL,
  flag_emoji TEXT DEFAULT '',
  is_enabled INTEGER DEFAULT 1,
  price_adjustment_type TEXT DEFAULT 'exchange_rate',
  price_adjustment_value REAL DEFAULT 0,
  rounding_rule TEXT DEFAULT 'none',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(shop_id, country_code)
);

CREATE TABLE IF NOT EXISTS exchange_rates (
  id SERIAL PRIMARY KEY,
  shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  from_currency TEXT NOT NULL,
  to_currency TEXT NOT NULL,
  rate REAL NOT NULL DEFAULT 1,
  source TEXT DEFAULT 'auto',
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(shop_id, from_currency, to_currency)
);

CREATE TABLE IF NOT EXISTS pricing_rules (
  id SERIAL PRIMARY KEY,
  shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  country_code TEXT NOT NULL,
  rule_type TEXT NOT NULL DEFAULT 'all',
  shopify_resource_id TEXT,
  resource_title TEXT,
  price_override REAL,
  percentage_adjustment REAL,
  priority INTEGER DEFAULT 0,
  is_enabled INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS settings (
  id SERIAL PRIMARY KEY,
  shop_id INTEGER UNIQUE NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  auto_detect_enabled INTEGER DEFAULT 1,
  widget_position TEXT DEFAULT 'bottom-left',
  widget_bg_color TEXT DEFAULT '#1a1a2e',
  widget_text_color TEXT DEFAULT '#ffffff',
  widget_accent_color TEXT DEFAULT '#e94560',
  auto_update_rates INTEGER DEFAULT 1,
  rate_update_interval INTEGER DEFAULT 24,
  fallback_country TEXT DEFAULT 'US',
  show_flags INTEGER DEFAULT 1,
  show_country_name INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id SERIAL PRIMARY KEY,
  shop_id INTEGER UNIQUE NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  plan TEXT NOT NULL DEFAULT 'free',
  status TEXT NOT NULL DEFAULT 'pending',
  shopify_charge_id TEXT,
  trial_ends_at TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gdpr_requests (
  id SERIAL PRIMARY KEY,
  shop_domain TEXT NOT NULL,
  topic TEXT NOT NULL,
  payload TEXT,
  received_at TIMESTAMPTZ DEFAULT NOW()
);
