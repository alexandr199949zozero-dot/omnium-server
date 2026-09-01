require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const { Telegraf } = require('telegraf');
const cron = require('node-cron');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ===== MongoDB =====
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// ===== Схемы =====
const UserSchema = new mongoose.Schema({
  telegramId: { type: String, unique: true },
  username: String,
  firstName: String,
  lastName: String,
  starsCount: { type: Number, default: 0 },
  likesReceived: { type: Number, default: 0 },
  lastStarDate: Date,
  achievements: [String],
  level: { type: Number, default: 1 },
});
const User = mongoose.model('User', UserSchema);

const StarSchema = new mongoose.Schema({
  id: { type: Number, unique: true },
  name: String,
  message: String,
  year: { type: Number, default: null },
  anonymous: { type: Boolean, default: false },
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
const Star = mongoose.model('Star', StarSchema);

// ===== Бот =====
const bot = new Telegraf(process.env.BOT_TOKEN);

// --- Хелперы для ачивок ---
function getAchievements(stars, user) {
  const total = stars.length;
  const likes = stars.reduce((sum, s) => sum + (s.likes || 0), 0);
  const withPhoto = stars.filter(s => s.photo).length;
  const consts = new Set(stars.map(s => s.constellationId));
  const ach = [];
  if (total >= 1) ach.push({ id: 'first', label: '🌟 Первая звезда', unlocked: true, progress: 1, max: 1 });
  if (total >= 5) ach.push({ id: 'five', label: '🌟 5 звёзд', unlocked: total >= 5, progress: Math.min(total, 5), max: 5 });
  if (total >= 10) ach.push({ id: 'ten', label: '🌟 10 звёзд', unlocked: total >= 10, progress: Math.min(total, 10), max: 10 });
  if (likes >= 10) ach.push({ id: 'likes10', label: '❤️ 10 лайков', unlocked: likes >= 10, progress: Math.min(likes, 10), max: 10 });
  if (likes >= 50) ach.push({ id: 'likes50', label: '❤️ 50 лайков', unlocked: likes >= 50, progress: Math.min(likes, 50), max: 50 });
  if (withPhoto >= 3) ach.push({ id: 'photo3', label: '📸 3 фото', unlocked: withPhoto >= 3, progress: Math.min(withPhoto, 3), max: 3 });
  if (consts.size >= 3) ach.push({ id: 'explorer', label: '🚀 Исследователь', unlocked: consts.size >= 3, progress: Math.min(consts.size, 3), max: 3 });
  return ach;
}

function getUserLevel(stars) {
  const total = stars.length;
  if (total >= 10) return { level: 3, label: '🌟 Легенда' };
  if (total >= 3) return { level: 2, label: '🌠 Исследователь' };
  return { level: 1, label: '🌱 Новичок' };
}

// --- Команды бота ---
bot.start((ctx) => {
  const payload = ctx.payload;
  const user = ctx.from;
  (async () => {
    await User.findOneAndUpdate(
      { telegramId: String(user.id) },
      { 
        username: user.username || '',
        firstName: user.first_name || '',
        lastName: user.last_name || '',
      },
      { upsert: true, new: true }
    );
  })();

  if (payload && payload.startsWith('star_')) {
    const starId = payload.replace('star_', '');
    ctx.replyWithMarkdown(
      `🌟 *В твою честь зажжена звезда!*\n\nОткрой её в приложении, чтобы увидеть.`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🌠 Открыть звезду', web_app: { url: `${process.env.WEBAPP_URL}?star=${starId}` } }]
          ]
        }
      }
    );
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

// Обработка кнопок
bot.action('stats', async (ctx) => {
  await ctx.answerCbQuery();
  const user = await User.findOne({ telegramId: String(ctx.from.id) });
  const stars = await Star.find({ creatorId: String(ctx.from.id) });
  const totalStars = await Star.countDocuments();
  const allLikes = await Star.aggregate([{ $group: { _id: null, total: { $sum: '$likes' } } }]);
  const totalLikes = allLikes.length > 0 ? allLikes[0].total : 0;
  const level = getUserLevel(stars);
  const ach = getAchievements(stars, user);
  const unlocked = ach.filter(a => a.unlocked).length;

  ctx.replyWithMarkdown(
    `📊 *Твоя статистика*\n\n` +
    `👤 Уровень: *${level.label}* (${level.level})\n` +
    `⭐ Создано звёзд: *${stars.length}*\n` +
    `❤️ Получено лайков: *${user?.likesReceived || 0}*\n` +
    `🏆 Достижений: *${unlocked} / ${ach.length}*\n\n` +
    `🌌 Всего звёзд в галактике: *${totalStars}*\n` +
    `❤️ Всего лайков: *${totalLikes}*`
  );
});

bot.action('invite', async (ctx) => {
  await ctx.answerCbQuery();
  const link = `https://t.me/${ctx.botInfo.username}?start=invite`;
  ctx.replyWithMarkdown(
    `👥 *Пригласи друга в Omnium!*\n\n` +
    `Поделись ссылкой, и когда друг зажжёт свою первую звезду, ты получишь бонус ✨\n\n` +
    `🔗 [Отправить ссылку](${link})`
  );
});

// Команда /stats
bot.command('stats', async (ctx) => {
  const user = await User.findOne({ telegramId: String(ctx.from.id) });
  const stars = await Star.find({ creatorId: String(ctx.from.id) });
  const totalStars = await Star.countDocuments();
  const allLikes = await Star.aggregate([{ $group: { _id: null, total: { $sum: '$likes' } } }]);
  const totalLikes = allLikes.length > 0 ? allLikes[0].total : 0;
  const level = getUserLevel(stars);
  const ach = getAchievements(stars, user);
  const unlocked = ach.filter(a => a.unlocked).length;

  ctx.replyWithMarkdown(
    `📊 *Твоя статистика*\n\n` +
    `👤 Уровень: *${level.label}* (${level.level})\n` +
    `⭐ Создано звёзд: *${stars.length}*\n` +
    `❤️ Получено лайков: *${user?.likesReceived || 0}*\n` +
    `🏆 Достижений: *${unlocked} / ${ach.length}*\n\n` +
    `🌌 Всего звёзд в галактике: *${totalStars}*\n` +
    `❤️ Всего лайков: *${totalLikes}*`
  );
});

// Команда /invite
bot.command('invite', async (ctx) => {
  const link = `https://t.me/${ctx.botInfo.username}?start=invite`;
  ctx.replyWithMarkdown(
    `👥 *Пригласи друга в Omnium!*\n\n` +
    `Поделись ссылкой, и когда друг зажжёт свою первую звезду, ты получишь бонус ✨\n\n` +
    `🔗 [Отправить ссылку](${link})`
  );
});

// Уведомления об упоминаниях
async function sendMentionNotification(mentionedUsername, starId, starName) {
  try {
    const user = await User.findOne({ username: mentionedUsername.replace('@', '') });
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

// ===== API =====

// Получить все звёзды (с пагинацией)
app.get('/api/stars', async (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  const skip = parseInt(req.query.skip) || 0;
  const sort = req.query.sort || 'createdAt';
  const order = req.query.order === 'asc' ? 1 : -1;
  const stars = await Star.find().sort({ [sort]: order }).skip(skip).limit(limit);
  const total = await Star.countDocuments();
  res.json({ stars, total });
});

// Получить одну звезду
app.get('/api/stars/:id', async (req, res) => {
  const star = await Star.findOne({ id: parseInt(req.params.id) });
  if (!star) return res.status(404).json({ error: 'Звезда не найдена' });
  res.json(star);
});

// Создать звезду
app.post('/api/stars', async (req, res) => {
  const { name, message, year, anonymous, constellation, constellationId, position, photo, creatorId, creatorUsername } = req.body;
  if (!name) return res.status(400).json({ error: 'Имя обязательно' });

  const user = await User.findOne({ telegramId: creatorId });
  if (user && user.lastStarDate && new Date(user.lastStarDate).toDateString() === new Date().toDateString()) {
    return res.status(429).json({ error: 'Сегодня ты уже зажёг звезду. Попробуй завтра!' });
  }

  const mentions = [];
  if (message) {
    const regex = /@(\w+)/g;
    let match;
    while ((match = regex.exec(message)) !== null) {
      mentions.push(match[1]);
    }
  }

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
    creatorId: anonymous ? null : creatorId,
    creatorUsername: anonymous ? null : creatorUsername,
    mentions,
  });
  await star.save();

  if (user) {
    user.starsCount += 1;
    user.lastStarDate = new Date();
    const level = getUserLevel(await Star.find({ creatorId }));
    user.level = level.level;
    await user.save();
  } else {
    const newUser = new User({ telegramId: creatorId, username: creatorUsername, starsCount: 1, lastStarDate: new Date(),
      level: 1 });
    await newUser.save();
  }

  // Ачивки (проверяем после сохранения)
  const userStars = await Star.find({ creatorId });
  const ach = getAchievements(userStars, user);
  const unlocked = ach.filter(a => a.unlocked).map(a => a.id);
  if (user) {
    user.achievements = unlocked;
    await user.save();
  }

  // Уведомления
  for (const username of mentions) {
    await sendMentionNotification(username, star.id, name);
  }

  res.status(201).json(star);
});

// Лайк
app.put('/api/stars/:id/like', async (req, res) => {
  const star = await Star.findOne({ id: parseInt(req.params.id) });
  if (!star) return res.status(404).json({ error: 'Не найдено' });
  star.likes = (star.likes || 0) + 1;
  await star.save();
  if (star.creatorId) {
    const creator = await User.findOne({ telegramId: star.creatorId });
    if (creator) {
      creator.likesReceived = (creator.likesReceived || 0) + 1;
      await creator.save();
    }
  }
  res.json({ likes: star.likes });
});

// Реакция
app.put('/api/stars/:id/reaction', async (req, res) => {
  const { emoji } = req.body;
  if (!emoji) return res.status(400).json({ error: 'Эмодзи обязателен' });
  const star = await Star.findOne({ id: parseInt(req.params.id) });
  if (!star) return res.status(404).json({ error: 'Не найдено' });
  if (!star.reactions) star.reactions = new Map();
  const current = star.reactions.get(emoji) || 0;
  star.reactions.set(emoji, current + 1);
  await star.save();
  res.json({ reactions: Object.fromEntries(star.reactions) });
});

// Получить достижения пользователя с прогрессом
app.get('/api/achievements/:telegramId', async (req, res) => {
  const user = await User.findOne({ telegramId: req.params.telegramId });
  const stars = await Star.find({ creatorId: req.params.telegramId });
  const ach = getAchievements(stars, user);
  res.json({ achievements: ach });
});

// Получить уровень пользователя
app.get('/api/user-level/:telegramId', async (req, res) => {
  const stars = await Star.find({ creatorId: req.params.telegramId });
  const level = getUserLevel(stars);
  res.json(level);
});

// Статистика (общая)
app.get('/api/stats', async (req, res) => {
  const totalStars = await Star.countDocuments();
  const totalUsers = await User.countDocuments();
  const allLikes = await Star.aggregate([{ $group: { _id: null, total: { $sum: '$likes' } } }]);
  const totalLikes = allLikes.length > 0 ? allLikes[0].total : 0;
  res.json({ totalStars, totalUsers, totalLikes });
});

// ===== Вебхук для бота =====
app.use(bot.webhookCallback('/webhook'));

// ===== Ежедневное напоминание (cron) =====
cron.schedule('0 10 * * *', async () => {
  console.log('⏰ Запуск ежедневного напоминания...');
  const users = await User.find();
  const today = new Date().toDateString();
  for (const user of users) {
    if (!user.lastStarDate || new Date(user.lastStarDate).toDateString() !== today) {
      try {
        await bot.telegram.sendMessage(
          user.telegramId,
          `🌟 *Доброе утро!*\n\nСегодня ты ещё не зажёг звезду. Возможно, кто-то ждёт своего момента вечности?\n\n✨ Нажми "Открыть приложение" и создай новую звезду!`,
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: '🚀 Открыть приложение', web_app: { url: process.env.WEBAPP_URL } }]
              ]
            },
            parse_mode: 'Markdown'
          }
        );
        console.log(`✅ Напоминание отправлено пользователю ${user.telegramId}`);
      } catch (e) { console.error(`Ошибка напоминания ${user.telegramId}:`, e); }
    }
  }
}, {
  timezone: "Europe/Moscow"
});

// ===== Запуск сервера =====
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});

// Установка вебхука при старте
if (process.env.BOT_TOKEN && process.env.RENDER_EXTERNAL_URL) {
  const webhookUrl = `${process.env.RENDER_EXTERNAL_URL}/webhook`;
  bot.telegram.setWebhook(webhookUrl)
    .then(() => console.log(`Вебхук установлен: ${webhookUrl}`))
    .catch(err => console.error('Ошибка установки вебхука:', err));
}
