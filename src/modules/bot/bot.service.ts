import { Injectable } from "@nestjs/common";
import { UserService } from "./services/user.service";
import { ExchangeRequestService } from "./services/exchange-request.service";
import { AdminNotificationService } from "./services/admin-notification.service";
import { UserState } from "../../common/enums/user-state.enum";
import { InlineKeyboardMarkup, InlineKeyboardButton } from "telegraf/types";

@Injectable()
export class BotService {
  constructor(
    private userService: UserService,
    private exchangeRequestService: ExchangeRequestService,
    private adminNotificationService: AdminNotificationService
  ) {}

  async getStartMessage(): Promise<{
    text: string;
    keyboard?: InlineKeyboardMarkup;
  }> {
    const text = `💰 Добро пожаловать в обменник USDT!

Я помогу вам узнать актуальный курс USDT.

Введите количество USDT, которое хотите купить:`;

    return { text };
  }

  async sendDefaultMenu(telegramId: number, isAdmin: boolean): Promise<void> {
    await this.adminNotificationService.sendDefaultMenu(telegramId, isAdmin);
  }

  async sendInputKeyboard(telegramId: number, message: string): Promise<void> {
    await this.adminNotificationService.sendInputKeyboard(telegramId, message);
  }

  async sendNoInputKeyboard(telegramId: number, message: string): Promise<void> {
    await this.adminNotificationService.sendNoInputKeyboard(telegramId, message);
  }

  async getHelpMessage(): Promise<string> {
    return `📚 Справка по боту:

🤖 Этот бот поможет вам:
• Получить актуальный курс
• Найти обменник в вашем городе

📋 Как это работает:
1. Введите количество USDT для покупки
2. Укажите ваш город
3. Ожидайте ответ от администратора

💬 Для начала нажмите /start`;
  }

  async processUserMessage(
    message: string,
    telegramUser: any,
    userId: number
  ): Promise<string> {
    const userState = await this.userService.getUserState(userId);

    switch (userState) {
      case UserState.ENTERING_AMOUNT:
        return this.handleAmountInput(message, userId);

      case UserState.ENTERING_CITY:
        return this.handleCityInput(message, userId, telegramUser);

      default:
        return "Используйте /start для начала работы с ботом.";
    }
  }

  private async handleAmountInput(amount: string, userId: number): Promise<string> {
    const numAmount = parseFloat(amount.replace(',', '.'));

    if (isNaN(numAmount) || numAmount <= 0) {
      return 'Пожалуйста, введите корректную сумму USDT (например: 100 или 100.50)';
    }

    await this.userService.setUserTempData(userId, 'amount', numAmount);
    await this.userService.updateUserState(userId, UserState.ENTERING_CITY);

    return '🏙️ Укажите ваш город:';
  }

  private async handleCityInput(city: string, userId: number, telegramUser: any): Promise<string> {
    const amount = await this.userService.getUserTempData(userId, 'amount');

    // Создаем заявку
    const request = await this.exchangeRequestService.createRequest({
      userId,
      amount,
      city: city.trim(),
    });

    // Получаем пользователя для отправки администратору
    const user = await this.userService.findOrCreateUser(telegramUser);

    // Отправляем уведомление в канал со ссылкой на бота
    await this.adminNotificationService.sendRequestToAdmin(request, user);

    // Очищаем состояние пользователя
    await this.userService.updateUserState(userId, UserState.WAITING_ADMIN_RESPONSE);

    // Возвращаем сообщение об успехе
    return `✅ Ваша заявка #${request.id} принята!

📋 Детали заявки:
💱 покупка: ${amount} USDT
🏙️ Город: ${city}

⏳ Ожидайте ответ администратора. Вам придет уведомление с курсом и итоговой суммой.`;
  }

  async getRequestById(requestId: number) {
    return await this.exchangeRequestService.findById(requestId);
  }

  async processAdminResponse(
    requestId: number,
    rate: number,
    fullMessage: string,
    adminName: string
  ): Promise<void> {
    console.log(
      `Обработка ответа админа для заявки #${requestId}: rate=${rate}, message="${fullMessage}"`
    );

    const request = await this.exchangeRequestService.findById(requestId);

    if (!request) {
      console.error(`Заявка #${requestId} не найдена`);
      throw new Error("Заявка не найдена");
    }

    console.log(
      `Найдена заявка #${requestId} от пользователя ${request.user.telegramId}`
    );

    try {
      // Обновляем заявку в базе данных
      await this.exchangeRequestService.setAdminResponse(
        requestId,
        rate,
        fullMessage,
        0 // totalAmount не используем пока
      );

      console.log(
        `Заявка #${requestId} обновлена в БД, отправляем ответ пользователю...`
      );

      // Отправляем ответ пользователю с кнопками выбора
      await this.adminNotificationService.sendRateToUser(
        request.user.telegramId,
        requestId,
        fullMessage,
        "USDT",
        request.amount
      );

      console.log(`Ответ отправлен пользователю ${request.user.telegramId}`);
    } catch (error) {
      console.error("Ошибка в processAdminResponse:", error);
      throw error;
    }
  }

  async getActiveRequests() {
    return await this.exchangeRequestService.getActiveRequests();
  }

  async getConfirmedRequests() {
    return await this.exchangeRequestService.getConfirmedRequests();
  }

  async getRecentRequests(limit: number = 20) {
    return await this.exchangeRequestService.getRecentRequests(limit);
  }

  async notifyAdminAboutBooking(
    requestId: number,
    action: string
  ): Promise<void> {
    const request = await this.exchangeRequestService.findById(requestId);

    if (!request) {
      return;
    }

    // Отправляем уведомление в админ-канал о действии пользователя
    await this.adminNotificationService.sendUserActionToAdmin(
      requestId,
      action,
      {
        username: request.user.username,
        firstName: request.user.firstName,
        telegramId: request.user.telegramId,
      }
    );
  }
}
