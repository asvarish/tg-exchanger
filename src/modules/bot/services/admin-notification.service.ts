import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf } from 'telegraf';
import { ExchangeRequest } from '../../../common/entities/exchange-request.entity';
import { User } from '../../../common/entities/user.entity';
import { InlineKeyboardMarkup } from 'telegraf/types';
import { formatUSDT, formatCurrency, formatNumber } from '../../../common/utils/format-number.util';
import { sendMessageWithKeyboards } from '../../../common/utils/keyboard.util';

@Injectable()
export class AdminNotificationService {
  private logger = new Logger(AdminNotificationService.name);
  constructor(
    @InjectBot() private bot: Telegraf,
    private configService: ConfigService,
  ) {}

  async sendDefaultMenu(telegramId: number, isAdmin: boolean): Promise<void> {
    if (isAdmin) {
      const adminKeyboard: InlineKeyboardMarkup = {
        inline_keyboard: [
          [
            { text: '📋 Новые заявки', callback_data: 'admin_active_requests' },
            { text: '✅ Подтвержденные', callback_data: 'admin_confirmed_requests' },
          ],
          [
            { text: '📊 История', callback_data: 'admin_stats' },
          ],
        ],
      };

      await this.bot.telegram.sendMessage(
        telegramId,
        '🔧 Админ-панель',
        { reply_markup: adminKeyboard }
      );
    } else {
      // Обычная клавиатура Telegram (не inline)
      const userKeyboard = {
        keyboard: [
          [{ text: '💰 Купить USDT' }]
        ],
        resize_keyboard: true,
        one_time_keyboard: false
      };

      // Inline-кнопка на приветственном сообщении
      const inlineKeyboard: InlineKeyboardMarkup = {
        inline_keyboard: [
          [
            { text: '💰 Купить USDT', callback_data: 'buy_usdt' }
          ]
        ]
      };

      await this.bot.telegram.sendMessage(
        telegramId,
        `💰 Добро пожаловать в обменник USDT!

Я помогу вам узнать актуальный курс USDT.`,
        { 
          reply_markup: userKeyboard,
          parse_mode: 'HTML'
        }
      );

      // Отправляем отдельное сообщение с inline-кнопкой
      await this.bot.telegram.sendMessage(
        telegramId,
        '💡 Нажмите кнопку ниже или используйте клавиатуру:',
        { reply_markup: inlineKeyboard }
      );
    }
  }

  async sendInputKeyboard(telegramId: number, message: string): Promise<void> {
    // При ожидании ввода - убираем клавиатуру, показываем только поле ввода
    const removeKeyboard = {
      remove_keyboard: true as const
    };

    await this.bot.telegram.sendMessage(
      telegramId,
      message,
      { reply_markup: removeKeyboard }
    );
  }

  async sendNoInputKeyboard(telegramId: number, message: string): Promise<void> {
    // Когда ввод не нужен - показываем клавиатуру с кнопкой "Купить USDT"
    const noInputKeyboard = {
      keyboard: [
        [{ text: '💰 Купить USDT' }]
      ],
      resize_keyboard: true,
      one_time_keyboard: false
    };

    await this.bot.telegram.sendMessage(
      telegramId,
      message,
      { reply_markup: noInputKeyboard }
    );
  }

  async sendRequestToAdmin(request: ExchangeRequest, user: User): Promise<void> {
    const adminChatId = this.configService.get('ADMIN_CHAT_ID');
    
    if (!adminChatId) {
      this.logger.error('ADMIN_CHAT_ID не настроен в .env файле');
      return;
    }

    const userInfo = user.username ? `@${user.username}` : `${user.firstName}`;
    
    // Получаем имя бота для ссылки
    const botInfo = await this.bot.telegram.getMe();
    const botUsername = botInfo.username;

    const message = `🔔 Новая заявка <b>#${request.id}</b>

👤 Клиент: <b>${userInfo}</b>
📞 Telegram ID: <b>${user.telegramId}</b>
💱 Операция: <b>покупка USDT</b>
💰 Валюта: <b>₮ USDT</b>
💵 Сумма: <b>${formatUSDT(request.amount)}</b>
🏙️ Город: <b>${request.city}</b>
📅 Дата: <b>${new Date().toLocaleString('ru-RU')}</b>

🤖 Для ответа используйте команду /admin в боте`;

    try {
      const sentMessage = await this.bot.telegram.sendMessage(
        adminChatId,
        message,
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: '🤖 Открыть админ-панель в боте',
                  url: `https://t.me/${botUsername}?start=admin_panel`,
                },
              ],
            ],
          },
        }
      );

      // Сохраним ID сообщения для последующего редактирования
      await this.saveAdminMessageId(request.id, sentMessage.message_id);
    } catch (error) {
      this.logger.error('Ошибка отправки сообщения администратору:', error);
    }
  }

  async sendRateToUser(userId: number, requestId: number, adminMessage: string, currency: string, amount: number): Promise<void> {
    this.logger.log(`Отправляем курс пользователю ${userId} по заявке #${requestId}`);
    
    // Извлекаем курс из сообщения админа
    const rateMatch = adminMessage.match(/^(\d+(?:\.\d+)?)/);
    const rate = rateMatch ? parseFloat(rateMatch[1]) : 0;
    
    // Рассчитываем стоимость в рублях
    const totalRub = rate * amount;
    
    const message = `💱 Ответ по заявке <b>#${requestId}</b>

💰 Курс: <b>${formatCurrency(rate, '₽', 2)}</b> за 1 USDT
💵 Сумма: <b>${formatUSDT(amount)}</b>
💸 Итого к оплате: <b>${formatCurrency(totalRub, '₽', 2)}</b>

<b>⚠️ Курс действителен только ${formatNumber(10)} минут!</b>

Что вы хотите сделать?`;

    const inlineKeyboard = {
      inline_keyboard: [
        [
          {
            text: '✅ Бронирую',
            callback_data: `book_${requestId}`,
          },
        ],
        [
          {
            text: '💬 Спасибо, я просто уточнял',
            callback_data: `clarify_${requestId}`,
          },
        ],
        [
          {
            text: '⏳ Жду информацию от клиента',
            callback_data: `wait_info_${requestId}`,
          },
        ],
      ],
    };

    try {
      const result = await sendMessageWithKeyboards(
        this.bot,
        userId,
        message,
        inlineKeyboard,
        { parse_mode: 'HTML' }
      );
      this.logger.log(`Сообщение отправлено пользователю ${userId}, message_id: ${result.message_id}`);
    } catch (error) {
      this.logger.error('Ошибка отправки курса пользователю:', error);
      throw error;
    }
  }

  async sendExpiredMessage(userId: number, requestId: number): Promise<void> {
    const message = `⏰ Время действия курса по заявке #${requestId} истекло.

Курс больше не действителен. Для получения нового курса используйте кнопку "💰 Купить USDT" на клавиатуре.`;

    // Отправляем обычную клавиатуру без возможности ввода
    await this.sendNoInputKeyboard(userId, message);
  }

  async updateAdminMessage(requestId: number, statusText: string): Promise<void> {
    const adminChatId = this.configService.get('ADMIN_CHAT_ID');
    
    if (!adminChatId) {
      return;
    }

    try {
      // Здесь можно найти сообщение по requestId и обновить его
      // Пока просто отправляем новое сообщение
      await this.bot.telegram.sendMessage(
        adminChatId,
        `📋 Обновление заявки <b>#${requestId}:</b> ${statusText}`,
        { parse_mode: 'HTML' }
      );
    } catch (error) {
      this.logger.error('Ошибка обновления сообщения админа:', error);
    }
  }

  private formatCurrency(currency: string): string {
    const currencyMap = {
      'USD': '💵 USD',
      'EUR': '💶 EUR',
      'RUB': '₽ RUB',
      'USDT': '₮ USDT',
    };
    return currencyMap[currency] || currency;
  }

  async sendUserActionToAdmin(
    requestId: number, 
    action: string, 
    userInfo: { username?: string; firstName?: string; telegramId: number }
  ): Promise<void> {
    const adminChatId = this.configService.get('ADMIN_CHAT_ID');
    
    if (!adminChatId) {
      this.logger.error('ADMIN_CHAT_ID не настроен в .env файле');
      return;
    }

    const actionTexts = {
      'book': '✅ ЗАБРОНИРОВАЛ заявку',
      'clarify': '💬 Просто уточнял курс',
      'wait_info': '⏳ Ждет дополнительную информацию',
      'cancelled': '❌ Заявка ОТМЕНЕНА администратором',
      'completed': '✅ ОБМЕН ЗАВЕРШЕН администратором'
    };

    const actionText = actionTexts[action] || 'Выполнил действие';
    const userDisplayName = userInfo.username ? `@${userInfo.username}` : userInfo.firstName;

    const message = `📋 Обновление заявки <b>#${requestId}</b>

👤 Клиент: <b>${userDisplayName}</b>
📞 Telegram ID: <b>${userInfo.telegramId}</b>
🎯 Действие: <b>${actionText}</b>

📅 <b>${new Date().toLocaleString('ru-RU')}</b>`;

    try {
      await this.bot.telegram.sendMessage(adminChatId, message, { parse_mode: 'HTML' });
      this.logger.log(`Уведомление о действии пользователя отправлено в админ-канал: заявка #${requestId}, действие: ${action}`);
    } catch (error) {
      this.logger.error('Ошибка отправки уведомления о действии пользователя:', error);
    }
  }

  private async saveAdminMessageId(requestId: number, messageId: number): Promise<void> {
    // Здесь будем сохранять ID сообщения в базу данных
    // Пока просто логируем
    this.logger.log(`Сохранен ID сообщения ${messageId} для заявки ${requestId}`);
  }
}
