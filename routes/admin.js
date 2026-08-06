const express = require('express');
const db = require('../lib/db');
const { STATUS_LABELS } = require('../bot');

function requireAdmin(adminPassword) {
  return (req, res, next) => {
    const supplied = req.headers['x-admin-password'] || req.query.password;
    if (!adminPassword || supplied !== adminPassword) {
      return res.status(401).json({ error: 'Parol noto\'g\'ri.' });
    }
    next();
  };
}

function buildRouter({ adminPassword }) {
  const router = express.Router();
  router.use(requireAdmin(adminPassword));

  // Buyurtmalar ro'yxati (filtrlar bilan)
  router.get('/orders', async (req, res) => {
    try {
      const { status, phone, city, dateFrom, dateTo } = req.query;
      const orders = await db.getAllOrders({
        status: status || undefined,
        phone: phone || undefined,
        fromCity: city || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined
      });
      res.json({
        ok: true,
        orders: orders.map((o) => ({ ...o, statusLabel: STATUS_LABELS[o.status] || o.status }))
      });
    } catch (err) {
      console.error('GET /api/admin/orders xatosi:', err);
      res.status(500).json({ error: 'Server xatosi.' });
    }
  });

  // Statistika
  router.get('/stats', async (req, res) => {
   try {
    const orders = await db.getAllOrders();
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const monthStr = now.toISOString().slice(0, 7);

    const byStatus = {};
    const routeCounts = {};
    let dailyCount = 0;
    let monthlyCount = 0;
    const uniqueCustomers = new Set();

    for (const o of orders) {
      byStatus[o.status] = (byStatus[o.status] || 0) + 1;
      const routeKey = `${o.from} → ${o.to}`;
      routeCounts[routeKey] = (routeCounts[routeKey] || 0) + 1;
      if ((o.createdAt || '').slice(0, 10) === todayStr) dailyCount++;
      if ((o.createdAt || '').slice(0, 7) === monthStr) monthlyCount++;
      uniqueCustomers.add(o.chatId);
    }

    const topRoutes = Object.entries(routeCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([route, count]) => ({ route, count }));

    res.json({
      ok: true,
      totalOrders: orders.length,
      byStatus,
      dailyCount,
      monthlyCount,
      uniqueCustomers: uniqueCustomers.size,
      topRoutes
    });
   } catch (err) {
    console.error('GET /api/admin/stats xatosi:', err);
    res.status(500).json({ error: 'Server xatosi.' });
   }
  });

  return router;
}

module.exports = buildRouter;
