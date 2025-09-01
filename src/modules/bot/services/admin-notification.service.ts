import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf } from 'telegraf';
import { ExchangeRequest } from '../../../common/entities/exchange-request.entity';
import { User } from '../../../common/entities/user.entity';

@Injectable()
export class AdminNotificationService {
  constructor(
    @InjectBot() private bot: Telegraf,
    private configService: ConfigService,
  ) {}

  async sendRequestToAdmin(request: ExchangeRequest, user: User): Promise<void> {
    const adminChatId = this.configService.get('ADMIN_CHAT_ID');
    
    if (!adminChatId) {
      console.error('ADMIN_CHAT_ID не настроен в .env файле');
      return;
    }

    const operationText = request.operationType === 'buy' ? 'Покупка' : 'Продажа';
    const userInfo = user.username ? `@${user.username}` : `${user.firstName}`;
    
    // Получаем имя бота для ссылки
    const botInfo = await this.bot.telegram.getMe();
    const botUsername = botInfo.username;

    const message = `🔔 Новая заявка #${request.id}

👤 Клиент: ${userInfo}
📞 Telegram ID: ${user.telegramId}
💱 Операция: ${operationText}
💰 Валюта: ${this.formatCurrency(request.currency)}
💵 Сумма: ${request.amount}
🏙️ Город: ${request.city}
📅 Дата: ${new Date().toLocaleString('ru-RU')}

🤖 Для ответа используйте команду /admin в боте`;

    try {
      const sentMessage = await this.bot.telegram.sendMessage(
        adminChatId,
        message,
        {
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
      console.error('Ошибка отправки сообщения администратору:', error);
    }
  }

  async sendRateToUser(userId: number, requestId: number, adminMessage: string, currency: string, amount: number, operationType: string): Promise<void> {
    console.log(`Отправляем курс пользователю ${userId} по заявке #${requestId}`);
    
    const operationText = operationType === 'buy' ? 'покупку' : 'продажу';
    
    const message = `💱 Ответ по заявке #${requestId}

${adminMessage}

⚠️ Курс действителен только 15 минут!

Что вы хотите сделать?`;

    const keyboard = {
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
      const result = await this.bot.telegram.sendMessage(userId, message, {
        reply_markup: keyboard,
      });
      console.log(`Сообщение отправлено пользователю ${userId}, message_id: ${result.message_id}`);
    } catch (error) {
      console.error('Ошибка отправки курса пользователю:', error);
      throw error;
    }
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
        `📋 Обновление заявки #${requestId}: ${statusText}`
      );
    } catch (error) {
      console.error('Ошибка обновления сообщения админа:', error);
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
      console.error('ADMIN_CHAT_ID не настроен в .env файле');
      return;
    }

    const actionTexts = {
      'book': '✅ ЗАБРОНИРОВАЛ заявку',
      'clarify': '💬 Просто уточнял курс',
      'wait_info': '⏳ Ждет дополнительную информацию',
      'cancelled': '❌ Заявка ОТМЕНЕНА администратором'
    };

    const actionText = actionTexts[action] || 'Выполнил действие';
    const userDisplayName = userInfo.username ? `@${userInfo.username}` : userInfo.firstName;

    const message = `📋 Обновление заявки #${requestId}

👤 Клиент: ${userDisplayName}
📞 Telegram ID: ${userInfo.telegramId}
🎯 Действие: ${actionText}

📅 ${new Date().toLocaleString('ru-RU')}`;

    try {
      await this.bot.telegram.sendMessage(adminChatId, message);
      console.log(`Уведомление о действии пользователя отправлено в админ-канал: заявка #${requestId}, действие: ${action}`);
    } catch (error) {
      console.error('Ошибка отправки уведомления о действии пользователя:', error);
    }
  }

  private async saveAdminMessageId(requestId: number, messageId: number): Promise<void> {
    // Здесь будем сохранять ID сообщения в базу данных
    // Пока просто логируем
    console.log(`Сохранен ID сообщения ${messageId} для заявки ${requestId}`);
  }
}
