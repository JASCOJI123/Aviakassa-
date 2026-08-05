const express = require('express');
const db = require('../lib/db');
const { verifyInitData } = require('../lib/telegramAuth');
const { notifyOperators, STATUS_LABELS } = require('../bot');

const CITIES_FROM = ['Toshkent', 'Samarqand', 'Buxoro', 'Moskva', 'Istanbul'];
const CITIES_TO = ['Istanbul', 'Dubay', 'Seul', 'Moskva'];
const CLASSES = ['Economy', 'Premium Economy', 'Business', 'First'];

function buildRouter({ bot, botToken, operatorChatIds }) {
  const router = express.Router();

  // Yangi so'rov yaratish (Mini App submit qilganda)
  router.post('/', async (req, res) => {
    try {
      const {
        initData, from, to, tripType, departDate, returnDate,
        passengers, travelClass, comment
      } = req.body || {};

      const { valid, user } = verifyInitData(initData, botToken);
      if (!valid || !user) {
        return res.status(401).json({ error: 'Telegram autentifikatsiyasi muvaffaqiyatsiz.' });
      }

      if (!from || !to || from === to) {
        return res.status(400).json({ error: 'Yo\'nalish noto\'g\'ri.' });
      }
      if (!CITIES_FROM.includes(from) && !CITIES_TO.includes(from)) {
        return res.status(400).json({ error: 'Noma\'lum shahar (qayerdan).' });
      }
      if (!departDate) {
        return res.status(400).json({ error: 'Ketish sanasi kiritilmagan.' });
      }
      if (tripType === 'roundTrip' && !returnDate) {
        return res.status(400).json({ error: 'Qaytish sanasi kiritilmagan.' });
      }

      const chatId = String(user.id);
      const existingUser = db.getUser(chatId);
      db.saveUser({
        chatId,
        telegramId: user.id,
        username: user.username,
        firstName: user.first_name,
        phone: existingUser ? existingUser.phone : null
      });

      const order = db.createOrder({
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
  router.get('/', (req, res) => {
    try {
      const { initData } = req.query;
      const { valid, user } = verifyInitData(initData, botToken);
      if (!valid || !user) {
        return res.status(401).json({ error: 'Telegram autentifikatsiyasi muvaffaqiyatsiz.' });
      }
      const chatId = String(user.id);
      const orders = db.getOrdersByChatId(chatId).map((o) => ({
        id: o.id,
        from: o.from,
        to: o.to,
        departDate: o.departDate,
        returnDate: o.returnDate,
        travelClass: o.travelClass,
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
