const { Markup } = require('telegraf');
const db = require('./lib/db');

const STATUS_LABELS = {
  pending: '🟡 Ko\'rib chiqilmoqda',
  contacted: '🔵 Operator bog\'landi',
  found: '🟢 Chipta tayyor',
  cancelled: '🔴 Bekor qilindi'
};

const STATUS_USER_MESSAGES = {
  contacted: (o) => `☎️ Operator sizning #${o.id} raqamli so'rovingiz bo'yicha siz bilan bog'lanmoqchi. Tez orada qo'ng'iroq qiladi yoki yozadi.`,
  found: (o) => `🎫 Xushxabar! #${o.id} raqamli so'rovingiz uchun chipta topildi. Operator tafsilotlarni yuboradi.`,
  cancelled: (o) => `🔴 #${o.id} raqamli so'rovingiz bekor qilindi. Savol bo'lsa, operator bilan bog'laning yoki yangi so'rov yuboring.`
};

function classLabel(c) {
  return c || 'Economy';
}

function formatPassengers(p) {
  const parts = [];
  if (p.adults) parts.push(`${p.adults} katta`);
  if (p.children) parts.push(`${p.children} bola`);
  if (p.infants) parts.push(`${p.infants} chaqaloq`);
  return parts.length ? parts.join(', ') : '1 katta';
}

function formatOrderMessage(order) {
  const lines = [
    '🆕 Yangi buyurtma',
    '',
    `👤 Ism: ${order.firstName || '-'}`,
    `🔗 Username: ${order.username ? '@' + order.username : '-'}`,
    `📞 Telefon: ${order.phone || '-'}`,
    '',
    `✈️ Qayerdan: ${order.from}`,
    `📍 Qayerga: ${order.to}`,
    '',
    `📅 Ketish: ${order.departDate}`,
    `📅 Qaytish: ${order.returnDate || '—'}`,
    '',
    `👨 Yo'lovchilar: ${formatPassengers(order.passengers)}`,
    `💺 Klass: ${classLabel(order.travelClass)}`,
    ''
  ];
  if (order.comment) {
    lines.push(`📝 Izoh: ${order.comment}`, '');
  }
  lines.push(`Buyurtma ID: #${order.id}`);
  return lines.join('\n');
}

function operatorKeyboard(orderId, status) {
  const buttons = [
    Markup.button.callback(
      status === 'pending' ? '✅ Qabul qilindi' : '✅ Qabul qilindi',
      `order:${orderId}:pending_ack`
    ),
    Markup.button.callback('☎️ Bog\'landim', `order:${orderId}:contacted`),
    Markup.button.callback('🎫 Chipta topildi', `order:${orderId}:found`),
    Markup.button.callback('❌ Bekor qilindi', `order:${orderId}:cancelled`)
  ];
  return Markup.inlineKeyboard(buttons, { columns: 2 });
}

async function notifyOperators(bot, order, operatorChatIds) {
  const text = formatOrderMessage(order);
  const keyboard = operatorKeyboard(order.id, order.status);
  const sentMessages = [];
  for (const chatId of operatorChatIds) {
    try {
      const msg = await bot.telegram.sendMessage(chatId, text, keyboard);
      sentMessages.push({ chatId, messageId: msg.message_id });
    } catch (e) {
      console.error(`Operator chatiga yuborib bo'lmadi (${chatId}):`, e.message);
    }
  }
  return sentMessages;
}

function setupBot(bot, { operatorChatIds, miniAppUrl }) {
  // ---------- /start ----------
  bot.start(async (ctx) => {
    const chatId = String(ctx.chat.id);
    const existing = db.getUser(chatId);

    if (existing && existing.phone) {
      await ctx.reply(
        `Xush kelibsiz, ${ctx.from.first_name || ''}! ✈️\n\nAviachipta topish uchun quyidagi tugmani bosing.`,
        Markup.keyboard([
          Markup.button.webApp('✈️ Chipta qidirish', miniAppUrl)
        ]).resize()
      );
      return;
    }

    db.saveUser({
      chatId,
      telegramId: ctx.from.id,
      username: ctx.from.username,
      firstName: ctx.from.first_name
    });

    await ctx.reply(
      'Assalomu alaykum! ✈️ AVIAKASSA botiga xush kelibsiz.\n\n' +
      'Bu yerda siz o\'zingizga qulay parvoz yo\'nalishi va sanasini belgilaysiz, ' +
      'operatorimiz esa sizga eng mos aviachiptalarni topib beradi.\n\n' +
      'Davom etish uchun telefon raqamingizni yuboring.',
      Markup.keyboard([
        Markup.button.contactRequest('📱 Telefon raqamni yuborish')
      ]).resize()
    );
  });

  // ---------- Contact (phone number) ----------
  bot.on('contact', async (ctx) => {
    const chatId = String(ctx.chat.id);
    const contact = ctx.message.contact;

    if (contact.user_id && contact.user_id !== ctx.from.id) {
      await ctx.reply('Iltimos, o\'zingizning telefon raqamingizni yuboring.');
      return;
    }

    db.saveUser({
      chatId,
      telegramId: ctx.from.id,
      username: ctx.from.username,
      firstName: ctx.from.first_name,
      phone: contact.phone_number
    });

    await ctx.reply(
      'Rahmat! ✅ Endi parvoz yo\'nalishi va sanasini belgilash uchun quyidagi tugmani bosing.',
      Markup.keyboard([
        Markup.button.webApp('✈️ Chipta qidirish', miniAppUrl)
      ]).resize()
    );
  });

  // ---------- Mini App data (fallback, agar frontend sendData orqali yuborsa) ----------
  bot.on('web_app_data', async (ctx) => {
    await ctx.reply('So\'rovingiz qabul qilindi, operator tez orada bog\'lanadi. 🙌');
  });

  // ---------- /my_orders ----------
  bot.command('my_orders', async (ctx) => {
    const chatId = String(ctx.chat.id);
    const orders = db.getOrdersByChatId(chatId);
    if (!orders.length) {
      await ctx.reply('Sizda hali so\'rovlar yo\'q. ✈️ Chipta qidirish tugmasidan foydalaning.');
      return;
    }
    const lines = orders.slice(0, 10).map((o) =>
      `#${o.id} — ${o.from} → ${o.to} (${o.departDate})\n${STATUS_LABELS[o.status] || o.status}`
    );
    await ctx.reply('📋 Mening so\'rovlarim:\n\n' + lines.join('\n\n'));
  });

  // ---------- Operator: status tugmalari ----------
  bot.on('callback_query', async (ctx) => {
    const data = ctx.callbackQuery.data || '';
    const match = data.match(/^order:(\d+):(pending_ack|contacted|found|cancelled)$/);
    if (!match) return;

    const [, orderIdStr, action] = match;
    const orderId = Number(orderIdStr);
    const order = db.getOrder(orderId);

    if (!order) {
      await ctx.answerCbQuery('Buyurtma topilmadi.');
      return;
    }

    const statusMap = {
      pending_ack: 'pending',
      contacted: 'contacted',
      found: 'found',
      cancelled: 'cancelled'
    };
    const newStatus = statusMap[action];
    const operatorName = ctx.from.username ? '@' + ctx.from.username : ctx.from.first_name;

    const updated = db.updateOrderStatus(orderId, newStatus, { operatorUsername: ctx.from.username || null });

    // Operator xabarini yangilash
    try {
      await ctx.editMessageText(
        formatOrderMessage(updated) + `\n\n— Holat: ${STATUS_LABELS[newStatus]} (${operatorName})`,
        operatorKeyboard(orderId, newStatus)
      );
    } catch (e) {
      // xabar tahrirlab bo'lmasa, e'tiborsiz qoldiramiz
    }

    // Foydalanuvchiga avtomatik xabar
    const userMsgFn = STATUS_USER_MESSAGES[newStatus];
    if (userMsgFn) {
      try {
        await bot.telegram.sendMessage(updated.chatId, userMsgFn(updated));
      } catch (e) {
        console.error('Foydalanuvchiga xabar yuborib bo\'lmadi:', e.message);
      }
    }

    await ctx.answerCbQuery('Holat yangilandi ✅');
  });
}

module.exports = { setupBot, notifyOperators, formatOrderMessage, STATUS_LABELS };
