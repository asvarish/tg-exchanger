import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf } from 'telegraf';
import { ExchangeRequestService } from './exchange-request.service';
import { AdminNotificationService } from './admin-notification.service';
import { RequestStatus } from '../../../common/entities/exchange-request.entity';

@Injectable()
export class ExpirationService {
  private logger = new Logger(ExpirationService.name);
  constructor(
    @InjectBot() private readonly bot: Telegraf,
    private readonly exchangeRequestService: ExchangeRequestService,
    private readonly adminNotificationService: AdminNotificationService,
  ) {}

  @Cron('*/30 * * * * *') // Каждые 30 секунд
  async checkExpiredRequests() {
    try {
      const expiredRequests = await this.exchangeRequestService.getExpiredRequests();
      
      if (expiredRequests.length === 0) {
        return;
      }

      this.logger.log(`Найдено ${expiredRequests.length} истекших заявок`);

      // Отправляем уведомления пользователям
      for (const request of expiredRequests) {
        await this.notifyUserAboutExpiration(request);
      }

      // Помечаем заявки как истекшие
      const requestIds = expiredRequests.map(r => r.id);
      await this.exchangeRequestService.markAsExpired(requestIds);

      this.logger.log(`Помечено как истекшие: заявки #${requestIds.join(', #')}`);
    } catch (error) {
      this.logger.error('Ошибка при проверке истекших заявок:', error);
    }
  }

  @Cron('*/30 * * * * *') // Каждые 30 секунд
  async checkWaitingClientRequests() {
    try {
      const waitingRequests = await this.exchangeRequestService.getWaitingClientRequests();
      
      if (waitingRequests.length === 0) {
        return;
      }

      const now = new Date();
      
      for (const request of waitingRequests) {
        // Проверяем, прошло ли 10 минут с момента получения курса от админа (confirmedAt)
        if (!request.confirmedAt) {
          continue; // Пропускаем заявки без подтверждения
        }

        const timeSinceConfirmation = now.getTime() - new Date(request.confirmedAt).getTime();
        const tenMinutes = 10 * 60 * 1000; // 10 минут в миллисекундах
        
        if (timeSinceConfirmation >= tenMinutes) {
          // Отправляем сообщение об истечении времени и предлагаем создать новую заявку
          await this.adminNotificationService.sendExpiredMessage(
            request.user.telegramId,
            request.id
          );
          
          // Помечаем заявку как истекшую
          await this.exchangeRequestService.updateRequestStatus(request.id, RequestStatus.EXPIRED);
          
          this.logger.log(`Время ожидания истекло для заявки #${request.id}`);
        }
      }
    } catch (error) {
      this.logger.error('Ошибка при проверке заявок в статусе WAITING_CLIENT:', error);
    }
  }

  private async notifyUserAboutExpiration(request: any) {
    // Рассчитываем стоимость в рублях
    const totalRub = request.exchangeRate * request.amount;
    
    const message = `⏰ Срок действия курса по заявке #${request.id} истек!

📋 Заявка: покупка ${request.amount} USDT
🏙️ Город: ${request.city}
💱 Курс: ${request.exchangeRate} ₽ за 1 USDT
💸 Итого: ${totalRub.toFixed(2)} ₽
📅 Время истечения: ${new Date(request.expiresAt).toLocaleString('ru-RU')}

Для получения актуального курса используйте кнопку "💰 Купить USDT" на клавиатуре`;

    try {
      await this.bot.telegram.sendMessage(request.user.telegramId, message);
      this.logger.log(`Уведомление об истечении отправлено пользователю ${request.user.telegramId} по заявке #${request.id}`);
    } catch (error) {
      this.logger.error(`Ошибка отправки уведомления пользователю ${request.user.telegramId}:`, error);
    }
  }
}
