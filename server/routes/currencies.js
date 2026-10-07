import { Router } from 'express';
import { getDb } from '../database/init.js';

const router = Router();

// GET /api/currencies — all available currencies (master list, no auth needed)
router.get('/', (req, res) => {
  const db = getDb();
  const currencies = db.prepare('SELECT * FROM currencies ORDER BY code').all();
  res.json(currencies);
});

export default router;
