import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf } from 'telegraf';
import { ExchangeRequestService } from './exchange-request.service';

@Injectable()
export class ExpirationService {
  constructor(
    @InjectBot() private readonly bot: Telegraf,
    private readonly exchangeRequestService: ExchangeRequestService,
  ) {}

  @Cron('*/30 * * * * *') // Каждые 30 секунд
  async checkExpiredRequests() {
    try {
      const expiredRequests = await this.exchangeRequestService.getExpiredRequests();
      
      if (expiredRequests.length === 0) {
        return;
      }

      console.log(`Найдено ${expiredRequests.length} истекших заявок`);

      // Отправляем уведомления пользователям
      for (const request of expiredRequests) {
        await this.notifyUserAboutExpiration(request);
      }

      // Помечаем заявки как истекшие
      const requestIds = expiredRequests.map(r => r.id);
      await this.exchangeRequestService.markAsExpired(requestIds);

      console.log(`Помечено как истекшие: заявки #${requestIds.join(', #')}`);
    } catch (error) {
      console.error('Ошибка при проверке истекших заявок:', error);
    }
  }

  private async notifyUserAboutExpiration(request: any) {
    const operationType = request.operationType === 'buy' ? 'покупку' : 'продажу';
    
    const message = `⏰ Срок действия курса по заявке #${request.id} истек!

📋 Заявка: ${operationType} ${request.amount} ${request.currency}
🏙️ Город: ${request.city}
💱 Курс: ${request.exchangeRate}
📅 Время истечения: ${new Date(request.expiresAt).toLocaleString('ru-RU')}

Для получения актуального курса создайте новую заявку командой /start`;

    try {
      await this.bot.telegram.sendMessage(request.user.telegramId, message);
      console.log(`Уведомление об истечении отправлено пользователю ${request.user.telegramId} по заявке #${request.id}`);
    } catch (error) {
      console.error(`Ошибка отправки уведомления пользователю ${request.user.telegramId}:`, error);
    }
  }
}
