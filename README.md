# ✈️ Aviakassa — Telegram Bot + Mini App

Mijoz botga kiradi → telefon raqamini qoldiradi → Mini App orqali yo'nalish/sana/yo'lovchi/klass tanlaydi →
so'rov operatorga (Telegram guruh yoki shaxsiy chat) avtomatik yuboriladi → operator tugmalar orqali holatni
o'zgartiradi → mijozga avtomatik xabar boradi.

## Tarkibi

```
aviakassa-bot/
├── server.js          # Asosiy fayl — Express + Telegraf webhook
├── bot.js              # Bot logikasi (start, telefon, statuslar, operator tugmalari)
├── lib/
│   ├── db.js            # PostgreSQL bazasi (jadvallar avtomatik yaratiladi)
│   └── telegramAuth.js  # Mini App so'rovlarini tekshirish (xavfsizlik)
├── routes/
│   ├── orders.js        # Mini App uchun API (buyurtma yaratish/ko'rish)
│   └── admin.js         # Admin panel API (statistika, filtrlar)
└── public/
    ├── index.html        # Mini App (mijozga ko'rinadigan forma)
    └── admin.html        # Admin panel (brauzerda ochiladi)
```

## 1-qadam — Bot yaratish

1. Telegram'da [@BotFather](https://t.me/BotFather)'ga kiring.
2. `/newbot` → nom va username bering → **BOT_TOKEN**'ni saqlab qo'ying.
3. `/mybots` → botingiz → **Bot Settings → Menu Button** → keyinroq (3-qadamdan keyin) Mini App URL'ni shu yerga qo'yasiz.

## 2-qadam — Operator chat ID'ni topish

Operator buyurtma xabarlarini oladigan joy — bu shaxsiy chat yoki guruh bo'lishi mumkin.

- Shaxsiy chat uchun: operator botga `/start` yozadi, keyin [@userinfobot](https://t.me/userinfobot) orqali o'z ID'sini oladi.
- Guruh uchun: botni guruhga qo'shing, guruhga biror xabar yozing, so'ng
  `https://api.telegram.org/bot<TOKEN>/getUpdates` orqali `chat.id`'ni toping (guruh ID odatda `-` bilan boshlanadi).

Bir nechta operator bo'lsa, ID'larni vergul bilan yozasiz: `111111111,-100222222222`.

## 3-qadam — PostgreSQL baza yaratish (Render)

1. [render.com](https://render.com) → **New → PostgreSQL**.
2. Nom bering (masalan `aviakassa-db`), region tanlang, **Free** tarifni tanlang → **Create Database**.
3. Baza tayyor bo'lgach, uning sahifasida **Connections** bo'limidan **Internal Database URL**'ni nusxalab oling
   (`postgresql://...` bilan boshlanadi). Bu manzilni keyingi qadamda `DATABASE_URL` sifatida ishlatasiz.

   > Internal URL faqat Render ichidagi xizmatlar orasida ishlaydi — bizga aynan shu kerak, chunki
   > bot ham Render'da ishlaydi. Agar bazani boshqa joydan (masalan, lokal kompyuterdan) ulamoqchi
   > bo'lsangiz, o'sha sahifadagi **External Database URL**'ni ishlating.

Jadvallar (`users`, `orders`) birinchi marta server ishga tushganda **avtomatik** yaratiladi — qo'shimcha
buyruq yozish shart emas.

## 4-qadam — GitHub'ga joylash

```bash
git init
git add .
git commit -m "Aviakassa bot + mini app"
git branch -M main
git remote add origin https://github.com/<username>/aviakassa-bot.git
git push -u origin main
```

`.env` fayli **hech qachon** GitHub'ga yuklanmaydi (`.gitignore`da bor) — bu to'g'ri, chunki
tokenlar Render sozlamalarida alohida kiritiladi.

## 5-qadam — Render'da deploy qilish

1. [render.com](https://render.com) → **New → Web Service**.
2. GitHub repo'ingizni tanlang.
3. Sozlamalar:
   - **Environment**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: Free (yoki istalgan)
4. **Environment Variables** bo'limida quyidagilarni qo'shing:

   | Key | Value |
   |---|---|
   | `BOT_TOKEN` | BotFather'dan olingan token |
   | `DATABASE_URL` | 3-qadamda nusxalangan Internal Database URL |
   | `OPERATOR_CHAT_IDS` | 2-qadamda topilgan ID(lar) |
   | `ADMIN_PASSWORD` | admin panel uchun o'zingiz o'ylab topgan parol |

   `WEBHOOK_URL` va `PORT`'ni kiritish shart emas — Render ularni (`RENDER_EXTERNAL_URL`, `PORT`)
   avtomatik beradi, `server.js` shundan foydalanadi.

5. **Create Web Service** — deploy tugagach, Render sizga domen beradi, masalan:
   `https://aviakassa-bot.onrender.com`

   Server ishga tushganda konsolda `Webhook o'rnatildi: ...` yozuvini ko'rasiz — bu bot Telegram bilan
   bog'langanini bildiradi.

## 6-qadam — Mini App URL'ni BotFather'ga qo'yish

1. [@BotFather](https://t.me/BotFather) → `/mybots` → botingiz → **Bot Settings → Menu Button**.
2. **Edit Menu Button URL** → Render bergan domenni kiriting: `https://aviakassa-bot.onrender.com`
3. Tugma nomini xohlasangiz o'zgartiring, masalan: `✈️ Chipta qidirish`

Shundan so'ng botga `/start` yozib sinab ko'rasiz: xush kelibsiz xabari → telefon so'raladi →
Mini App tugmasi chiqadi → forma to'ldirilib yuboriladi → operator chatiga xabar keladi.

## Admin panel

`https://<domeningiz>/admin.html` manzilida ochiladi, `ADMIN_PASSWORD`'ni kiritib kirasiz.
Statistika (jami/bugungi/oylik buyurtmalar, mijozlar soni, eng ko'p yo'nalishlar) va
filtrlanadigan buyurtmalar jadvali bor.

## ⚠️ Muhim eslatmalar

- **Baza haqida**: ma'lumotlar endi PostgreSQL'da saqlanadi — kod qayta deploy qilinganda yoki
  server qayta ishga tushganda buyurtmalar **o'chib ketmaydi**. Jadvallar (`users`, `orders`)
  server birinchi marta ishga tushganda avtomatik yaratiladi.
- **Render bepul PostgreSQL cheklovi**: Render'ning bepul PostgreSQL bazasi yaratilgandan
  **90 kundan so'ng avtomatik o'chiriladi** (Render siyosati). Jiddiy foydalanish uchun pullik
  tarifga o'tish yoki 90 kunga yaqin muddatda yangi baza yaratib ma'lumotlarni ko'chirish kerak
  bo'ladi.
- **Bepul tarif uyqisi**: Render'ning bepul Web Service'lari faolsiz qolsa "uxlab qoladi" va
  keyingi so'rovda 30–60 soniya kechikish bo'lishi mumkin. Bot doim tayyor turishi kerak bo'lsa,
  pullik tarif yoki "keep-alive" ping xizmati kerak bo'ladi.
- **Xavfsizlik**: Mini App'dan kelgan har bir so'rov Telegram imzosi (`initData`) orqali
  serverda tekshiriladi — soxta so'rovlar qabul qilinmaydi.

## Lokal test qilish (ixtiyoriy)

```bash
npm install
cp .env.example .env   # va BOT_TOKEN, DATABASE_URL'ni kiriting
npm start
```

Lokal test uchun ham PostgreSQL kerak — kompyuteringizda o'rnatilgan bo'lishi yoki Render'dagi
**External Database URL**'dan foydalanishingiz mumkin. `WEBHOOK_URL` bo'sh bo'lsa, bot avtomatik
**polling** rejimida ishlaydi (lokal test uchun qulay).
