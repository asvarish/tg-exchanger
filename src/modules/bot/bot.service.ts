import { Injectable } from '@nestjs/common';
import { UserService } from './services/user.service';
import { ExchangeRequestService } from './services/exchange-request.service';
import { AdminNotificationService } from './services/admin-notification.service';
import { UserState } from '../../common/enums/user-state.enum';
import { OperationType, CurrencyType } from '../../common/entities/exchange-request.entity';
import { InlineKeyboardMarkup, InlineKeyboardButton } from 'telegraf/types';

@Injectable()
export class BotService {
  constructor(
    private userService: UserService,
    private exchangeRequestService: ExchangeRequestService,
    private adminNotificationService: AdminNotificationService,
  ) {}

  async getStartMessage(): Promise<{ text: string; keyboard?: InlineKeyboardMarkup }> {
    const text = `💰 Добро пожаловать в обменник валют!

Я помогу вам обменять валюту по выгодному курсу.

Что вы хотите сделать?`;

    const keyboard: InlineKeyboardMarkup = {
      inline_keyboard: [
        [
          { text: '💵 Купить валюту', callback_data: 'operation_buy' },
          { text: '💸 Продать валюту', callback_data: 'operation_sell' },
        ],
      ],
    };

    return { text, keyboard };
  }

  async getHelpMessage(): Promise<string> {
    return `📚 Справка по боту:

🤖 Этот бот поможет вам:
• Купить или продать валюту
• Получить актуальный курс
• Найти обменник в вашем городе

📋 Как это работает:
1. Выберите операцию (купить/продать)
2. Укажите валюту и сумму
3. Введите ваш город
4. Ожидайте ответ от администратора

💬 Для начала нажмите /start`;
  }

  getCurrencyKeyboard(): InlineKeyboardMarkup {
    return {
      inline_keyboard: [
        [
          { text: '💵 USD', callback_data: 'currency_USD' },
          { text: '💶 EUR', callback_data: 'currency_EUR' },
        ],
        [
          { text: '₽ RUB', callback_data: 'currency_RUB' },
          { text: '₮ USDT', callback_data: 'currency_USDT' },
        ],
      ],
    };
  }

  async processUserMessage(message: string, telegramUser: any, userId: number): Promise<string> {
    const userState = await this.userService.getUserState(userId);

    switch (userState) {
      case UserState.ENTERING_AMOUNT:
        return this.handleAmountInput(message, userId);
      
      case UserState.ENTERING_CITY:
        return this.handleCityInput(message, userId, telegramUser);
      
      default:
        return 'Используйте /start для начала работы с ботом.';
    }
  }

  private async handleAmountInput(amount: string, userId: number): Promise<string> {
    const numAmount = parseFloat(amount.replace(',', '.'));
    
    if (isNaN(numAmount) || numAmount <= 0) {
      return 'Пожалуйста, введите корректную сумму (например: 100 или 100.50)';
    }

    await this.userService.setUserTempData(userId, 'amount', numAmount);
    await this.userService.updateUserState(userId, UserState.ENTERING_CITY);

    return '🏙️ Укажите ваш город:';
  }

  private async handleCityInput(city: string, userId: number, telegramUser: any): Promise<string> {
    const operationType = await this.userService.getUserTempData(userId, 'operationType');
    const currency = await this.userService.getUserTempData(userId, 'currency');
    const amount = await this.userService.getUserTempData(userId, 'amount');

    // Создаем заявку
    const request = await this.exchangeRequestService.createRequest({
      userId,
      operationType,
      currency,
      amount,
      city: city.trim(),
    });

    // Получаем пользователя для отправки администратору
    const user = await this.userService.findOrCreateUser(telegramUser);

    // Отправляем уведомление в канал со ссылкой на бота
    await this.adminNotificationService.sendRequestToAdmin(request, user);

    // Очищаем состояние пользователя
    await this.userService.updateUserState(userId, UserState.WAITING_ADMIN_RESPONSE);

    const operationText = operationType === OperationType.BUY ? 'Покупка' : 'Продажа';
    
    return `✅ Ваша заявка #${request.id} принята!

📋 Детали заявки:
💱 ${operationText}: ${amount} ${currency}
🏙️ Город: ${city}

⏳ Ожидайте ответ администратора. Вам придет уведомление с курсом и итоговой суммой.`;
  }

  formatOperationType(operation: OperationType): string {
    return operation === OperationType.BUY ? 'Покупка' : 'Продажа';
  }

  formatCurrency(currency: CurrencyType): string {
    const currencyMap = {
      [CurrencyType.USD]: '💵 USD',
      [CurrencyType.EUR]: '💶 EUR',
      [CurrencyType.RUB]: '₽ RUB',
      [CurrencyType.USDT]: '₮ USDT',
    };
    return currencyMap[currency] || currency;
  }

  async getRequestById(requestId: number) {
    return await this.exchangeRequestService.findById(requestId);
  }

  async processAdminResponse(requestId: number, rate: number, fullMessage: string, adminName: string): Promise<void> {
    console.log(`Обработка ответа админа для заявки #${requestId}: rate=${rate}, message="${fullMessage}"`);
    
    const request = await this.exchangeRequestService.findById(requestId);
    
    if (!request) {
      console.error(`Заявка #${requestId} не найдена`);
      throw new Error('Заявка не найдена');
    }

    console.log(`Найдена заявка #${requestId} от пользователя ${request.user.telegramId}`);

    try {
      // Обновляем заявку в базе данных
      await this.exchangeRequestService.setAdminResponse(
        requestId,
        rate,
        fullMessage,
        0 // totalAmount не используем пока
      );

      console.log(`Заявка #${requestId} обновлена в БД, отправляем ответ пользователю...`);

      // Отправляем ответ пользователю с кнопками выбора
      await this.adminNotificationService.sendRateToUser(
        request.user.telegramId,
        requestId,
        fullMessage,
        request.currency,
        request.amount,
        request.operationType
      );

      console.log(`Ответ отправлен пользователю ${request.user.telegramId}`);
    } catch (error) {
      console.error('Ошибка в processAdminResponse:', error);
      throw error;
    }
  }

  async getActiveRequests() {
    return await this.exchangeRequestService.getActiveRequests();
  }

  async notifyAdminAboutBooking(requestId: number, action: string): Promise<void> {
    const request = await this.exchangeRequestService.findById(requestId);
    
    if (!request) {
      return;
    }

    // Отправляем уведомление в админ-канал о действии пользователя
    await this.adminNotificationService.sendUserActionToAdmin(requestId, action, {
      username: request.user.username,
      firstName: request.user.firstName,
      telegramId: request.user.telegramId
    });
  }
}
