require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const { Telegraf } = require('telegraf');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

mongoose.connect(process.env.MONGODB_URI);

const UserSchema = new mongoose.Schema({
  telegramId: { type: String, unique: true },
  username: String,
  firstName: String,
  lastName: String,
  starsCount: { type: Number, default: 0 },
  lastStarDate: Date,
  achievements: [String],
});
const User = mongoose.model('User', UserSchema);

const StarSchema = new mongoose.Schema({
  id: { type: Number, unique: true },
  name: String,
  message: String,
  constellation: String,
  constellationId: String,
  position: { x: Number, y: Number, z: Number },
  photo: String,
  voice: String,
  likes: { type: Number, default: 0 },
  reactions: { type: Map, of: Number, default: {} },
  creatorId: String,
  creatorUsername: String,
  mentions: [String],
  createdAt: { type: Date, default: Date.now },
});
const Star = mongoose.model('Star', StarSchema);

const bot = new Telegraf(process.env.BOT_TOKEN);

bot.start((ctx) => {
  const payload = ctx.payload;
  if (payload && payload.startsWith('star_')) {
    const starId = payload.replace('star_', '');
    ctx.reply(`✨ Звезда найдена! Откройте её в приложении:`, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🌠 Открыть звезду', web_app: { url: `${process.env.WEBAPP_URL}?star=${starId}` } }]
        ]
      }
    });
  } else {
    ctx.reply('🌟 Добро пожаловать в Omnium! Зажги свою звезду в приложении.', {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🚀 Открыть приложение', web_app: { url: process.env.WEBAPP_URL } }]
        ]
      }
    });
  }
});

async function sendMentionNotification(mentionedUsername, starId, starName) {
  try {
    const user = await User.findOne({ username: mentionedUsername.replace('@', '') });
    if (user && user.telegramId) {
      await bot.telegram.sendMessage(
        user.telegramId,
        `💫 Тебя упомянули в звезде «${starName}»!\nОткрой: ${process.env.WEBAPP_URL}?star=${starId}`
      );
    }
  } catch (e) { console.error('Ошибка уведомления:', e); }
}

// API
app.get('/api/stars', async (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  const skip = parseInt(req.query.skip) || 0;
  const stars = await Star.find().sort({ createdAt: -1 }).skip(skip).limit(limit);
  const total = await Star.countDocuments();
  res.json({ stars, total });
});

app.get('/api/stars/:id', async (req, res) => {
  const star = await Star.findOne({ id: parseInt(req.params.id) });
  if (!star) return res.status(404).json({ error: 'Звезда не найдена' });
  res.json(star);
});

app.post('/api/stars', async (req, res) => {
  const { name, message, constellation, constellationId, position, photo, voice, creatorId, creatorUsername } = req.body;
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
    constellation,
    constellationId,
    position,
    photo,
    voice,
    creatorId,
    creatorUsername,
    mentions,
  });
  await star.save();

  if (user) {
    user.starsCount += 1;
    user.lastStarDate = new Date();
    await user.save();
  }

  for (const username of mentions) {
    await sendMentionNotification(username, star.id, name);
  }

  res.status(201).json(star);
});

app.put('/api/stars/:id/like', async (req, res) => {
  const star = await Star.findOne({ id: parseInt(req.params.id) });
  if (!star) return res.status(404).json({ error: 'Не найдено' });
  star.likes = (star.likes || 0) + 1;
  await star.save();
  res.json({ likes: star.likes });
});

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

app.get('/api/achievements/:telegramId', async (req, res) => {
  const user = await User.findOne({ telegramId: req.params.telegramId });
  if (!user) return res.json({ achievements: [] });
  res.json({ achievements: user.achievements || [] });
});

if (process.env.BOT_TOKEN && process.env.RENDER_EXTERNAL_URL) {
  bot.telegram.setWebhook(`${process.env.RENDER_EXTERNAL_URL}/webhook`)
    .then(() => console.log('Вебхук установлен'))
    .catch(err => console.error('Ошибка установки вебхука:', err));
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});
