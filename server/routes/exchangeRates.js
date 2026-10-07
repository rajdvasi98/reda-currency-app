import { Router } from 'express';
import { getDb } from '../database/init.js';
import { requireShopAuth } from '../middleware/shopAuth.js';
import { fetchAndStoreRates, getRatesForShop, setManualRate } from '../services/exchangeRate.js';

const router = Router();
router.use(requireShopAuth);

// GET /api/exchange-rates
router.get('/', (req, res) => {
  const rates = getRatesForShop(req.shopId);
  res.json(rates);
});

// POST /api/exchange-rates/refresh — fetch latest rates from external API
router.post('/refresh', async (req, res) => {
  const baseCurrency = req.shopRow.default_currency;
  const result = await fetchAndStoreRates(req.shopId, baseCurrency);
  res.json(result);
});

// PUT /api/exchange-rates/:id — manual override
router.put('/:id', (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM exchange_rates WHERE id = ? AND shop_id = ?').get(req.params.id, req.shopId);
  if (!existing) return res.status(404).json({ error: 'Rate not found' });

  const { rate } = req.body;
  if (!rate || isNaN(rate) || rate <= 0) {
    return res.status(400).json({ error: 'Valid rate required' });
  }

  setManualRate(req.shopId, existing.from_currency, existing.to_currency, parseFloat(rate));
  const updated = db.prepare('SELECT * FROM exchange_rates WHERE id = ?').get(req.params.id);
  res.json(updated);
});

export default router;
