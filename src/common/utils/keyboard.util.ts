import { InlineKeyboardMarkup } from 'telegraf/types';

/**
 * Создает постоянную клавиатуру внизу экрана
 */
export function createPersistentKeyboard() {
  return {
    keyboard: [
      [{ text: '💰 Купить USDT' }]
    ],
    resize_keyboard: true,
    one_time_keyboard: false
  };
}

/**
 * Отправляет сообщение с inline-кнопками и устанавливает постоянную клавиатуру
 * @param bot - экземпляр Telegraf бота
 * @param userId - ID пользователя
 * @param message - текст сообщения
 * @param inlineKeyboard - inline-клавиатура
 * @param options - дополнительные опции для сообщения
 */
export async function sendMessageWithKeyboards(
  bot: any,
  userId: number,
  message: string,
  inlineKeyboard: InlineKeyboardMarkup,
  options: any = {}
) {
  const persistentKeyboard = createPersistentKeyboard();

  // Отправляем основное сообщение с inline-кнопками
  const result = await bot.telegram.sendMessage(userId, message, {
    reply_markup: inlineKeyboard,
    ...options,
  });

  // Отправляем отдельное короткое сообщение с постоянной клавиатурой
  await bot.telegram.sendMessage(userId, 'Если вы ошиблись или хотите купить еще, используйте кнопку "💰 Купить USDT":', {
    reply_markup: persistentKeyboard,
  });

  return result;
}

/**
 * Отправляет простое сообщение с постоянной клавиатурой
 * @param bot - экземпляр Telegraf бота
 * @param userId - ID пользователя
 * @param message - текст сообщения
 * @param options - дополнительные опции для сообщения
 */
export async function sendMessageWithPersistentKeyboard(
  bot: any,
  userId: number,
  message: string,
  options: any = {}
) {
  const persistentKeyboard = createPersistentKeyboard();

  return await bot.telegram.sendMessage(userId, message, {
    reply_markup: persistentKeyboard,
    ...options,
  });
}
