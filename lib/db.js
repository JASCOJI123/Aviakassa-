// PostgreSQL bazasi. Barcha funksiyalar endi async (Promise qaytaradi) —
// chaqirganda albatta `await` bilan ishlatilishi kerak.

const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;
const useSSL = connectionString && !/localhost|127\.0\.0\.1/.test(connectionString);

const pool = new Pool({
  connectionString,
  ssl: useSSL ? { rejectUnauthorized: false } : false
});

pool.on('error', (err) => {
  console.error('Kutilmagan PostgreSQL xatosi:', err.message);
});

const ORDER_ID_START = 12584; // TZ namunasidagi boshlang'ich raqam

async function initDb() {
  if (!connectionString) {
    throw new Error('DATABASE_URL topilmadi. Render PostgreSQL yaratib, ulanish satrini Environment Variables ga qo\'shing.');
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      chat_id TEXT PRIMARY KEY,
      telegram_id BIGINT,
      username TEXT,
      first_name TEXT,
      phone TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY,
      chat_id TEXT NOT NULL,
      telegram_id BIGINT,
      username TEXT,
      first_name TEXT,
      phone TEXT,
      from_city TEXT NOT NULL,
      to_city TEXT NOT NULL,
      trip_type TEXT NOT NULL DEFAULT 'oneWay',
      depart_date TEXT NOT NULL,
      return_date TEXT,
      passengers JSONB NOT NULL DEFAULT '{"adults":1,"children":0,"infants":0}',
      travel_class TEXT NOT NULL DEFAULT 'Economy',
      baggage TEXT NOT NULL DEFAULT 'with',
      comment TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      operator_username TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_orders_chat_id ON orders (chat_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status);`);

  // Eski deploy'larda (baggage ustuni bo'lmagan) jadvalni yangilash
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS baggage TEXT NOT NULL DEFAULT 'with';`);
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS budget JSONB;`);
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS flight_time_prefs JSONB;`);

  // Buyurtma ID'lari TZ namunasidagi kabi #12584'dan boshlansin
  const { rows } = await pool.query(`SELECT last_value, is_called FROM orders_id_seq;`);
  const current = Number(rows[0].last_value);
  if (!rows[0].is_called || current < ORDER_ID_START) {
    await pool.query(`SELECT setval('orders_id_seq', $1, false);`, [ORDER_ID_START]);
  }
}

function mapUser(row) {
  if (!row) return null;
  return {
    chatId: row.chat_id,
    telegramId: row.telegram_id ? Number(row.telegram_id) : null,
    username: row.username,
    firstName: row.first_name,
    phone: row.phone,
    createdAt: row.created_at
  };
}

function mapOrder(row) {
  if (!row) return null;
  return {
    id: row.id,
    chatId: row.chat_id,
    telegramId: row.telegram_id ? Number(row.telegram_id) : null,
    username: row.username,
    firstName: row.first_name,
    phone: row.phone,
    from: row.from_city,
    to: row.to_city,
    tripType: row.trip_type,
    departDate: row.depart_date,
    returnDate: row.return_date,
    passengers: row.passengers,
    travelClass: row.travel_class,
    baggage: row.baggage,
    budget: row.budget,
    flightTimePrefs: row.flight_time_prefs,
    comment: row.comment,
    status: row.status,
    operatorUsername: row.operator_username,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function saveUser({ chatId, telegramId, username, firstName, phone }) {
  const { rows } = await pool.query(
    `
    INSERT INTO users (chat_id, telegram_id, username, first_name, phone)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (chat_id) DO UPDATE SET
      telegram_id = COALESCE(EXCLUDED.telegram_id, users.telegram_id),
      username    = COALESCE(EXCLUDED.username, users.username),
      first_name  = COALESCE(EXCLUDED.first_name, users.first_name),
      phone       = COALESCE(EXCLUDED.phone, users.phone)
    RETURNING *;
    `,
    [chatId, telegramId || null, username || null, firstName || null, phone || null]
  );
  return mapUser(rows[0]);
}

async function getUser(chatId) {
  const { rows } = await pool.query(`SELECT * FROM users WHERE chat_id = $1;`, [chatId]);
  return mapUser(rows[0]);
}

async function createOrder(orderData) {
  const {
    chatId, telegramId, username, firstName, phone,
    from, to, tripType, departDate, returnDate,
    passengers, travelClass, baggage, budget, flightTime, comment
  } = orderData;

  const { rows } = await pool.query(
    `
    INSERT INTO orders (
      chat_id, telegram_id, username, first_name, phone,
      from_city, to_city, trip_type, depart_date, return_date,
      passengers, travel_class, baggage, budget, flight_time_prefs, comment, status
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'pending')
    RETURNING *;
    `,
    [
      chatId, telegramId || null, username || null, firstName || null, phone || null,
      from, to, tripType || 'oneWay', departDate, returnDate || null,
      JSON.stringify(passengers || { adults: 1, children: 0, infants: 0 }),
      travelClass || 'Economy', baggage || 'with',
      budget ? JSON.stringify(budget) : null,
      flightTime && flightTime.length ? JSON.stringify(flightTime) : null,
      comment || null
    ]
  );
  return mapOrder(rows[0]);
}

async function getOrder(id) {
  const { rows } = await pool.query(`SELECT * FROM orders WHERE id = $1;`, [Number(id)]);
  return mapOrder(rows[0]);
}

async function getOrdersByChatId(chatId) {
  const { rows } = await pool.query(
    `SELECT * FROM orders WHERE chat_id = $1 ORDER BY created_at DESC;`,
    [String(chatId)]
  );
  return rows.map(mapOrder);
}

async function updateOrderStatus(id, status, extra = {}) {
  const { rows } = await pool.query(
    `
    UPDATE orders
    SET status = $1, updated_at = now(), operator_username = COALESCE($2, operator_username)
    WHERE id = $3
    RETURNING *;
    `,
    [status, extra.operatorUsername || null, Number(id)]
  );
  return mapOrder(rows[0]);
}

async function getAllOrders({ status, phone, fromCity, operator, dateFrom, dateTo } = {}) {
  const clauses = [];
  const values = [];

  if (status) {
    values.push(status);
    clauses.push(`status = $${values.length}`);
  }
  if (phone) {
    values.push(`%${phone}%`);
    clauses.push(`phone ILIKE $${values.length}`);
  }
  if (fromCity) {
    values.push(fromCity);
    const idx = values.length;
    clauses.push(`(from_city = $${idx} OR to_city = $${idx})`);
  }
  if (operator) {
    values.push(operator);
    clauses.push(`operator_username = $${values.length}`);
  }
  if (dateFrom) {
    values.push(dateFrom);
    clauses.push(`created_at >= $${values.length}`);
  }
  if (dateTo) {
    values.push(dateTo);
    clauses.push(`created_at <= $${values.length}`);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const { rows } = await pool.query(
    `SELECT * FROM orders ${where} ORDER BY created_at DESC;`,
    values
  );
  return rows.map(mapOrder);
}

module.exports = {
  initDb,
  saveUser,
  getUser,
  createOrder,
  getOrder,
  getOrdersByChatId,
  updateOrderStatus,
  getAllOrders
};
