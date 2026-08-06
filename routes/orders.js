const express = require('express');
const db = require('../lib/db');
const { verifyInitData } = require('../lib/telegramAuth');
const { notifyOperators, STATUS_LABELS } = require('../bot');

const CLASSES = ['Economy', 'Premium Economy', 'Business', 'First'];
const BAGGAGE_OPTIONS = ['with', 'without'];
const TIME_OPTIONS = ['morning', 'afternoon', 'evening'];

function buildRouter({ bot, botToken, operatorChatIds }) {
  const router = express.Router();

  // Yangi so'rov yaratish (Mini App submit qilganda)
  router.post('/', async (req, res) => {
    try {
      const {
        initData, from, to, tripType, departDate, returnDate,
        passengers, travelClass, baggage, budget, flightTime, comment
      } = req.body || {};

      const { valid, user } = verifyInitData(initData, botToken);
      if (!valid || !user) {
        return res.status(401).json({ error: 'Telegram autentifikatsiyasi muvaffaqiyatsiz.' });
      }

      if (!from || !to || typeof from !== 'string' || typeof to !== 'string' || from === to) {
        return res.status(400).json({ error: 'Yo\'nalish noto\'g\'ri.' });
      }
      if (from.length > 120 || to.length > 120) {
        return res.status(400).json({ error: 'Yo\'nalish nomi juda uzun.' });
      }
      if (!departDate) {
        return res.status(400).json({ error: 'Ketish sanasi kiritilmagan.' });
      }
      if (tripType === 'roundTrip' && !returnDate) {
        return res.status(400).json({ error: 'Qaytish sanasi kiritilmagan.' });
      }

      const chatId = String(user.id);
      const existingUser = await db.getUser(chatId);
      await db.saveUser({
        chatId,
        telegramId: user.id,
        username: user.username,
        firstName: user.first_name,
        phone: existingUser ? existingUser.phone : null
      });

      const order = await db.createOrder({
        chatId,
        telegramId: user.id,
        username: user.username || null,
        firstName: user.first_name || null,
        phone: existingUser ? existingUser.phone : null,
        from,
        to,
        tripType: tripType === 'roundTrip' ? 'roundTrip' : 'oneWay',
        departDate,
        returnDate: tripType === 'roundTrip' ? returnDate : null,
        passengers: {
          adults: Number(passengers?.adults) || 1,
          children: Number(passengers?.children) || 0,
          infants: Number(passengers?.infants) || 0
        },
        travelClass: CLASSES.includes(travelClass) ? travelClass : 'Economy',
        baggage: BAGGAGE_OPTIONS.includes(baggage) ? baggage : 'with',
        budget: (budget && (budget.min || budget.max)) ? {
          min: Number.isFinite(Number(budget.min)) && budget.min !== null ? Number(budget.min) : null,
          max: Number.isFinite(Number(budget.max)) && budget.max !== null ? Number(budget.max) : null,
          currency: budget.currency === 'USD' ? 'USD' : 'UZS'
        } : null,
        flightTime: Array.isArray(flightTime)
          ? flightTime.filter((t) => TIME_OPTIONS.includes(t)).slice(0, 4)
          : [],
        comment: (comment || '').slice(0, 500)
      });

      await notifyOperators(bot, order, operatorChatIds);

      res.json({ ok: true, orderId: order.id, status: order.status });
    } catch (err) {
      console.error('POST /api/orders xatosi:', err);
      res.status(500).json({ error: 'Server xatosi. Qaytadan urinib ko\'ring.' });
    }
  });

  // Foydalanuvchining o'z so'rovlari ("Mening so'rovlarim")
  router.get('/', async (req, res) => {
    try {
      const { initData } = req.query;
      const { valid, user } = verifyInitData(initData, botToken);
      if (!valid || !user) {
        return res.status(401).json({ error: 'Telegram autentifikatsiyasi muvaffaqiyatsiz.' });
      }
      const chatId = String(user.id);
      const rawOrders = await db.getOrdersByChatId(chatId);
      const orders = rawOrders.map((o) => ({
        id: o.id,
        from: o.from,
        to: o.to,
        departDate: o.departDate,
        returnDate: o.returnDate,
        travelClass: o.travelClass,
        baggage: o.baggage,
        budget: o.budget,
        flightTimePrefs: o.flightTimePrefs,
        status: o.status,
        statusLabel: STATUS_LABELS[o.status] || o.status,
        createdAt: o.createdAt
      }));
      res.json({ ok: true, orders });
    } catch (err) {
      console.error('GET /api/orders xatosi:', err);
      res.status(500).json({ error: 'Server xatosi.' });
    }
  });

  return router;
}

module.exports = buildRouter;
