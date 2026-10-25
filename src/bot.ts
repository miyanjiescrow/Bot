import { Telegraf } from 'telegraf';
import { config } from '../config'; // Wait, I can't import Python config.
// I need to use process.env for BOT_TOKEN in Node.js.

const bot = new Telegraf(process.env.BOT_TOKEN || '');

bot.start((ctx) => {
  ctx.reply('سلام! به سامانه جامع اسکرو میانجی (Miyanji Escrow) خوش آمدید.');
});

bot.help((ctx) => {
  ctx.reply('برای استفاده از خدمات، از منو استفاده کنید.');
});

// Skeleton handlers based on main.py
// I'll add more as I migrate auth_handlers.py, user.py, etc.

export { bot };
