// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const { Telegraf } = require('telegraf');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ===== MongoDB =====
mongoose.connect(process.env.MONGODB_URI);

// ... (схемы такие же, как выше) ...

// ===== Telegram Bot =====
let bot = null;
if (process.env.BOT_TOKEN) {
  bot = new Telegraf(process.env.BOT_TOKEN);
  // Обработчик команды /start
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
} else {
  console.warn('BOT_TOKEN не задан. Бот не будет работать.');
}

// Функция отправки уведомления (использует bot)
async function sendMentionNotification(mentionedUsername, starId, starName) {
  if (!bot) return;
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

// ... остальные функции и API (без изменений) ...

// ===== Запуск =====
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});

// НЕ устанавливаем вебхук автоматически – мы сделаем это вручную через браузер.
