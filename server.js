require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Telegraf } = require('telegraf');

const { setupBot } = require('./bot');
const buildOrdersRouter = require('./routes/orders');
const buildAdminRouter = require('./routes/admin');
const db = require('./lib/db');

const BOT_TOKEN = process.env.BOT_TOKEN;
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'changeme';
const OPERATOR_CHAT_IDS = (process.env.OPERATOR_CHAT_IDS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

// Render bu o'zgaruvchini avtomatik beradi. Boshqa hostingda WEBHOOK_URL'ni qo'lda kiriting.
const BASE_URL = process.env.RENDER_EXTERNAL_URL || process.env.WEBHOOK_URL;

if (!BOT_TOKEN) {
  console.error('XATOLIK: BOT_TOKEN environment variable topilmadi. .env yoki Render Environment sozlamalarida kiriting.');
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error('XATOLIK: DATABASE_URL environment variable topilmadi. Render PostgreSQL yarating va ulanish satrini qo\'shing.');
  process.exit(1);
}
if (!OPERATOR_CHAT_IDS.length) {
  console.warn('OGOHLANTIRISH: OPERATOR_CHAT_IDS bo\'sh. Operatorlar buyurtma xabarlarini olmaydi.');
}
if (!BASE_URL) {
  console.warn('OGOHLANTIRISH: WEBHOOK_URL/RENDER_EXTERNAL_URL topilmadi. Webhook o\'rnatilmaydi (lokal test rejimi).');
}

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const bot = new Telegraf(BOT_TOKEN);
const miniAppUrl = BASE_URL ? `${BASE_URL}/` : 'http://localhost:' + PORT + '/';

setupBot(bot, { operatorChatIds: OPERATOR_CHAT_IDS, miniAppUrl });

// ---------- API routes ----------
app.use('/api/orders', buildOrdersRouter({ bot, botToken: BOT_TOKEN, operatorChatIds: OPERATOR_CHAT_IDS }));
app.use('/api/admin', buildAdminRouter({ adminPassword: ADMIN_PASSWORD }));

app.get('/health', (req, res) => res.json({ ok: true }));

// ---------- Telegram webhook ----------
const WEBHOOK_PATH = `/webhook/${BOT_TOKEN}`;
app.use(bot.webhookCallback(WEBHOOK_PATH));

(async () => {
  try {
    await db.initDb();
    console.log('PostgreSQL bazasi tayyor (jadvallar tekshirildi/yaratildi).');
  } catch (e) {
    console.error('Bazaga ulanishda xatolik:', e.message);
    process.exit(1);
  }

  app.listen(PORT, async () => {
    console.log(`Server ${PORT}-portda ishga tushdi.`);
    if (BASE_URL) {
      try {
        await bot.telegram.setWebhook(`${BASE_URL}${WEBHOOK_PATH}`);
        console.log('Webhook o\'rnatildi:', `${BASE_URL}${WEBHOOK_PATH}`);
      } catch (e) {
        console.error('Webhook o\'rnatishda xatolik:', e.message);
      }
    } else {
      console.log('BASE_URL yo\'q — bot polling rejimida ishga tushirilmoqda (lokal test uchun).');
      bot.launch();
    }
  });
})();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
