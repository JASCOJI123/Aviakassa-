// Oddiy fayl-bazasi (JSON). Kichik/o'rta yuklamali botlar uchun yetarli.
// Kelajakda PostgreSQL'ga ko'chirish kerak bo'lsa, faqat shu faylni almashtirish yetarli
// — chunki qolgan qism (routes, bot.js) faqat shu moduldagi funksiyalarni chaqiradi.

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const DEFAULT_DB = {
  users: {},       // chatId -> { chatId, telegramId, username, firstName, phone, createdAt }
  orders: [],       // { id, chatId, telegramUsername, firstName, phone, from, to, tripType,
                     //   departDate, returnDate, passengers, travelClass, comment,
                     //   status, operatorNote, createdAt, updatedAt }
  nextOrderId: 12584 // TZ namunasidagi boshlang'ich raqam
};

function ensureDB() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify(DEFAULT_DB, null, 2));
  }
}

function readDB() {
  ensureDB();
  const raw = fs.readFileSync(DB_FILE, 'utf-8');
  try {
    return JSON.parse(raw);
  } catch (e) {
    console.error('DB parse xatosi, standart bazaga qaytarilmoqda:', e.message);
    return JSON.parse(JSON.stringify(DEFAULT_DB));
  }
}

function writeDB(db) {
  ensureDB();
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function saveUser({ chatId, telegramId, username, firstName, phone }) {
  const db = readDB();
  const existing = db.users[chatId] || {};
  db.users[chatId] = {
    chatId,
    telegramId: telegramId ?? existing.telegramId ?? null,
    username: username ?? existing.username ?? null,
    firstName: firstName ?? existing.firstName ?? null,
    phone: phone ?? existing.phone ?? null,
    createdAt: existing.createdAt || new Date().toISOString()
  };
  writeDB(db);
  return db.users[chatId];
}

function getUser(chatId) {
  const db = readDB();
  return db.users[chatId] || null;
}

function createOrder(orderData) {
  const db = readDB();
  const id = db.nextOrderId;
  db.nextOrderId += 1;
  const order = {
    id,
    status: 'pending', // pending -> contacted -> found -> cancelled
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...orderData
  };
  db.orders.push(order);
  writeDB(db);
  return order;
}

function getOrder(id) {
  const db = readDB();
  return db.orders.find((o) => o.id === Number(id)) || null;
}

function getOrdersByChatId(chatId) {
  const db = readDB();
  return db.orders
    .filter((o) => String(o.chatId) === String(chatId))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function updateOrderStatus(id, status, extra = {}) {
  const db = readDB();
  const order = db.orders.find((o) => o.id === Number(id));
  if (!order) return null;
  order.status = status;
  order.updatedAt = new Date().toISOString();
  Object.assign(order, extra);
  writeDB(db);
  return order;
}

function getAllOrders({ status, phone, fromCity, operator, dateFrom, dateTo } = {}) {
  const db = readDB();
  let orders = db.orders;
  if (status) orders = orders.filter((o) => o.status === status);
  if (phone) orders = orders.filter((o) => (o.phone || '').includes(phone));
  if (fromCity) orders = orders.filter((o) => o.from === fromCity || o.to === fromCity);
  if (operator) orders = orders.filter((o) => o.operatorUsername === operator);
  if (dateFrom) orders = orders.filter((o) => o.createdAt >= dateFrom);
  if (dateTo) orders = orders.filter((o) => o.createdAt <= dateTo);
  return orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

module.exports = {
  saveUser,
  getUser,
  createOrder,
  getOrder,
  getOrdersByChatId,
  updateOrderStatus,
  getAllOrders
};
