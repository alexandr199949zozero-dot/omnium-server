// ===== В схему StarSchema добавляем поля =====
const StarSchema = new mongoose.Schema({
  id: { type: Number, unique: true },
  name: String,
  message: String,
  year: { type: Number, default: null },         // год события
  anonymous: { type: Boolean, default: false },  // анонимный режим
  constellation: String,
  constellationId: String,
  position: { x: Number, y: Number, z: Number },
  photo: String,
  likes: { type: Number, default: 0 },
  reactions: { type: Map, of: Number, default: {} },
  creatorId: String,
  creatorUsername: String,
  mentions: [String],
  createdAt: { type: Date, default: Date.now },
});

// ===== Обновлённое приветствие бота =====
bot.start((ctx) => {
  const payload = ctx.payload;
  if (payload && payload.startsWith('star_')) {
    const starId = payload.replace('star_', '');
    ctx.reply(`🌟 *В твою честь зажжена звезда!*\n\nОткрой её в приложении, чтобы увидеть.`, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🌠 Открыть звезду', web_app: { url: `${process.env.WEBAPP_URL}?star=${starId}` } }]
        ]
      },
      parse_mode: 'Markdown'
    });
  } else {
    ctx.replyWithMarkdown(
      `🌟 *Omnium — зажги звезду в честь человека*\n\n` +
      `Здесь каждая звезда становится вечным символом. Ты можешь зажечь её:\n` +
      `• в память об ушедшем\n` +
      `• в честь любимого человека\n` +
      `• для друга или коллеги\n` +
      `• анонимно — и человек получит уведомление!\n\n` +
      `✨ *Как это работает:*\n` +
      `• Напиши имя и послание\n` +
      `• Укажи год (например, год знакомства)\n` +
      `• Добавь фото (по желанию)\n` +
      `• Отметь «Анонимно», если хочешь остаться скрытым\n` +
      `• Упомяни @username, чтобы отправить уведомление\n\n` +
      `Создай звезду и пусть она сияет вечно.`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🚀 Зажечь звезду', web_app: { url: process.env.WEBAPP_URL } }],
            [{ text: '📊 Статистика', callback_data: 'stats' }, { text: '👥 Пригласить', callback_data: 'invite' }]
          ]
        }
      }
    );
  }
});

// ===== Обновлённый эндпоинт создания звезды (добавляем year и anonymous) =====
app.post('/api/stars', async (req, res) => {
  const { name, message, year, anonymous, constellation, constellationId, position, photo, creatorId, creatorUsername } = req.body;
  if (!name) return res.status(400).json({ error: 'Имя обязательно' });

  // ... проверка лимита и т.д.

  const star = new Star({
    id: Date.now(),
    name,
    message,
    year: year || null,
    anonymous: anonymous || false,
    constellation,
    constellationId,
    position,
    photo,
    creatorId: anonymous ? null : creatorId,   // если анонимно, не сохраняем создателя
    creatorUsername: anonymous ? null : creatorUsername,
    // ... остальные поля
  });
  await star.save();

  // Уведомления (если есть упоминания)
  if (message) {
    const mentions = message.match(/@(\w+)/g) || [];
    for (const m of mentions) {
      const username = m.replace('@', '');
      await sendMentionNotification(username, star.id, name);
    }
  }

  res.status(201).json(star);
});

// ===== Функция уведомления (уже есть) =====
async function sendMentionNotification(mentionedUsername, starId, starName) {
  try {
    const user = await User.findOne({ username: mentionedUsername });
    if (user && user.telegramId) {
      await bot.telegram.sendMessage(
        user.telegramId,
        `🌟 *В твою честь зажгли звезду!*\n\nИмя: *${starName}*\n\nОткрой её в приложении:`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '🌠 Открыть звезду', web_app: { url: `${process.env.WEBAPP_URL}?star=${starId}` } }]
            ]
          },
          parse_mode: 'Markdown'
        }
      );
    }
  } catch (e) { console.error('Ошибка уведомления:', e); }
}
