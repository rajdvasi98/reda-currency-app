import { Router } from 'express';
import { dbAll } from '../database/init.js';

const router = Router();

// GET /api/currencies — all available currencies (master list, no auth needed)
router.get('/', async (req, res) => {
  const currencies = await dbAll('SELECT * FROM currencies ORDER BY code');
  res.json(currencies);
});

export default router;
