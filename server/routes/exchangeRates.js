import { Router } from 'express';
import { dbGet } from '../database/init.js';
import { requireShopAuth } from '../middleware/shopAuth.js';
import { fetchAndStoreRates, getRatesForShop, setManualRate } from '../services/exchangeRate.js';

const router = Router();
router.use(requireShopAuth);

// GET /api/exchange-rates
router.get('/', async (req, res) => {
  const rates = await getRatesForShop(req.shopId);
  res.json(rates);
});

// POST /api/exchange-rates/refresh — fetch latest rates from external API
router.post('/refresh', async (req, res) => {
  const baseCurrency = req.shopRow.default_currency;
  const result = await fetchAndStoreRates(req.shopId, baseCurrency);
  res.json(result);
});

// PUT /api/exchange-rates/:id — manual override
router.put('/:id', async (req, res) => {
  const existing = await dbGet(
    'SELECT * FROM exchange_rates WHERE id = $1 AND shop_id = $2',
    [req.params.id, req.shopId]
  );
  if (!existing) return res.status(404).json({ error: 'Rate not found' });

  const { rate } = req.body;
  if (!rate || isNaN(rate) || rate <= 0) {
    return res.status(400).json({ error: 'Valid rate required' });
  }

  await setManualRate(req.shopId, existing.from_currency, existing.to_currency, parseFloat(rate));
  const updated = await dbGet('SELECT * FROM exchange_rates WHERE id = $1', [req.params.id]);
  res.json(updated);
});

export default router;
