import { Injectable, Logger } from '@nestjs/common';
import { Update, Ctx, Start, Command, On, Message, Action } from 'nestjs-telegraf';
import { BotService } from './bot.service';
import { UserService } from './services/user.service';
import { ExchangeRequestService } from './services/exchange-request.service';
import { UserState } from '../../common/enums/user-state.enum';
import { RequestStatus } from '../../common/entities/exchange-request.entity';
import { formatUSDT, formatCurrency, formatNumber } from '../../common/utils/format-number.util';

@Injectable()
@Update()
export class BotUpdate {
  private logger = new Logger(BotUpdate.name);
  constructor(
    private readonly botService: BotService,
    private readonly userService: UserService,
    private readonly exchangeRequestService: ExchangeRequestService,
  ) {
  }

    @Start()
  async startCommand(@Ctx() ctx: any) {
    // Проверяем, есть ли параметр для ответа на заявку
    const startPayload = ctx.message.text.split(' ')[1];

    if (startPayload && startPayload.startsWith('respond_')) {
      const requestId = parseInt(startPayload.replace('respond_', ''));

      // Получаем пользователя и сохраняем состояние админа для ответа на заявку
      const user = await this.userService.findOrCreateUser(ctx.from);
      await this.userService.setUserTempData(user.id, 'admin_responding_to', requestId);

      await ctx.reply(`📝 Ответ на заявку #${requestId}

Просто отправьте курс обмена (цифрой) и любую дополнительную информацию.

Например: \`${formatNumber(95.5)}\` или \`${formatNumber(95.5)} - встреча у метро\``, {
        parse_mode: 'HTML',
      });
      return;
    }

    // Проверяем переход в админ-панель
    if (startPayload === 'admin_panel') {
      const user = await this.userService.findOrCreateUser(ctx.from);
      
      if (!user.isAdmin) {
        await ctx.reply('❌ У вас нет прав администратора.');
        return;
      }

      const keyboard = {
        inline_keyboard: [
          [
            { text: '📋 Активные заявки', callback_data: 'admin_active_requests' },
          ],
          [
            { text: '📊 Статистика', callback_data: 'admin_stats' },
          ],
        ],
      };

      await ctx.reply('🔧 Админ-панель', { reply_markup: keyboard });
      return;
    }

    // Обычный старт для клиентов - отправляем дефолтное меню
    const user = await this.userService.findOrCreateUser(ctx.from);
    await this.botService.sendDefaultMenu(ctx.from.id, user.isAdmin);
  }

  @Command('help')
  async helpCommand(@Ctx() ctx: any) {
    const message = await this.botService.getHelpMessage();
    await ctx.reply(message);
  }



  @Command('admin')
  async adminCommand(@Ctx() ctx: any) {
    const user = await this.userService.findOrCreateUser(ctx.from);
    
    // Проверяем, является ли пользователь админом
    if (!user.isAdmin) {
      await ctx.reply('❌ У вас нет прав администратора.');
      return;
    }

    const keyboard = {
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

    await ctx.reply('🔧 Админ-панель', { reply_markup: keyboard });
  }

  @Action('admin_active_requests')
  async showActiveRequests(@Ctx() ctx: any) {
    const user = await this.userService.findOrCreateUser(ctx.from);
    
    if (!user.isAdmin) {
      await ctx.answerCbQuery('❌ Нет прав');
      return;
    }

    const activeRequests = await this.botService.getActiveRequests();
    
    if (activeRequests.length === 0) {
      await ctx.editMessageText('📝 Нет новых заявок');
      return;
    }

    let message = '📋 Новые заявки:\n\n';
    const keyboard = [];

    for (const request of activeRequests) {
      const clientName = request.user.username ? `@${request.user.username}` : request.user.firstName;
      
      message += `🔹 Заявка <b>#${request.id}</b>
👤 Клиент: <b>${clientName}</b>
💱 Покупка: <b>${formatUSDT(request.amount)}</b>
🏙️ Город: <b>${request.city}</b>
📅 <b>${new Date(request.createdAt).toLocaleString('ru-RU')}</b>

`;

      keyboard.push([
        {
          text: `💬 Ответить на заявку #${request.id}`,
          callback_data: `respond_${request.id}`,
        },
        {
          text: `❌ Отменить #${request.id}`,
          callback_data: `cancel_${request.id}`,
        },
      ]);
    }

    await ctx.editMessageText(message, {
      reply_markup: { inline_keyboard: keyboard },
    });
  }

  @Action('admin_confirmed_requests')
  async showConfirmedRequests(@Ctx() ctx: any) {
    const user = await this.userService.findOrCreateUser(ctx.from);
    
    if (!user.isAdmin) {
      await ctx.answerCbQuery('❌ Нет прав');
      return;
    }

    const confirmedRequests = await this.botService.getConfirmedRequests();
    
    if (confirmedRequests.length === 0) {
      await ctx.editMessageText('📝 Нет подтвержденных заявок');
      return;
    }

    let message = '✅ Подтвержденные заявки:\n\n';
    const keyboard = [];

    for (const request of confirmedRequests) {
      const statusText = this.getStatusText(request.status);
      
      // Рассчитываем стоимость в рублях
      const totalRub = request.exchangeRate * request.amount;
      const clientName = request.user.username ? `@${request.user.username}` : request.user.firstName;
      
      // Для забронированных заявок не показываем таймер
      let timeInfo = '';
      if (request.status !== 'booked') {
        const timeLeft = this.getTimeLeft(request.expiresAt);
        timeInfo = `⏰ ${timeLeft}`;
      } else {
        timeInfo = '✅ Забронировано - ожидает завершения';
      }
      
      message += `🔹 Заявка <b>#${request.id}</b> ${statusText}
👤 Клиент: <b>${clientName}</b>
💱 Покупка: <b>${formatUSDT(request.amount)}</b>
💰 Курс: <b>${formatCurrency(request.exchangeRate, '₽', 2)} за 1 USDT</b>
💸 Итого: <b>${formatCurrency(totalRub, '₽', 2)}</b>
${timeInfo}
📅 <b>${new Date(request.confirmedAt).toLocaleString('ru-RU')}</b>

`;

      // Добавляем разные кнопки в зависимости от статуса
      if (request.status === 'booked') {
        // Для забронированных - кнопка завершения обмена
        keyboard.push([
          {
            text: `✅ Обмен завершен #${request.id}`,
            callback_data: `complete_${request.id}`,
          },
          {
            text: `❌ Отменить #${request.id}`,
            callback_data: `cancel_${request.id}`,
          },
        ]);
      } else {
        // Для остальных - только отмена
        keyboard.push([
          {
            text: `❌ Отменить заявку #${request.id}`,
            callback_data: `cancel_${request.id}`,
          },
        ]);
      }
    }

    await ctx.editMessageText(message, {
      reply_markup: { inline_keyboard: keyboard },
      parse_mode: 'HTML',
    });
  }

  @Action('admin_stats')
  async showStats(@Ctx() ctx: any) {
    const user = await this.userService.findOrCreateUser(ctx.from);
    
    if (!user.isAdmin) {
      await ctx.answerCbQuery('❌ Нет прав');
      return;
    }

    const recentRequests = await this.botService.getRecentRequests(20);
    
    if (recentRequests.length === 0) {
      await ctx.editMessageText('📊 Нет заявок для отображения');
      return;
    }

    let message = '📊 История последних 20 заявок:\n\n';
    const keyboard = [];

    for (const request of recentRequests) {
      const statusText = this.getStatusText(request.status);
      const timeAgo = this.getTimeAgo(request.createdAt);
      const clientName = request.user.username ? `@${request.user.username}` : request.user.firstName;
      
      let rateInfo = '';
      if (request.exchangeRate) {
        // Рассчитываем стоимость в рублях
        const totalRub = request.exchangeRate * request.amount;
        rateInfo = `💰 Курс: <b>${formatCurrency(request.exchangeRate, '₽', 2)} за 1 USDT</b>
💸 Итого: <b>${formatCurrency(totalRub, '₽', 2)}</b>
`;
      }
      
      message += `🔹 Заявка <b>#${request.id}</b> ${statusText}
👤 Клиент: <b>${clientName}</b>
💱 Покупка: <b>${formatUSDT(request.amount)}</b>
🏙️ Город: <b>${request.city}</b>
📅 <b>${timeAgo}</b>
${rateInfo}
`;

      // Добавляем кнопку просмотра деталей
      keyboard.push([
        {
          text: `👁️ Детали #${request.id}`,
          callback_data: `view_details_${request.id}`,
        },
      ]);
    }

    // Добавляем кнопку возврата в админ-панель
    keyboard.push([
      {
        text: '🔙 Назад в админ-панель',
        callback_data: 'admin_panel_back',
      },
    ]);

    await ctx.editMessageText(message, {
      reply_markup: { inline_keyboard: keyboard },
    });
  }

  @Action('admin_panel_back')
  async backToAdminPanel(@Ctx() ctx: any) {
    const user = await this.userService.findOrCreateUser(ctx.from);
    
    if (!user.isAdmin) {
      await ctx.answerCbQuery('❌ Нет прав');
      return;
    }

    const keyboard = {
      inline_keyboard: [
        [
          { text: '📋 Новые заявки', callback_data: 'admin_active_requests' },
          { text: '✅ Подтвержденные', callback_data: 'admin_confirmed_requests' },
        ],
        [
          { text: '📊 Статистика', callback_data: 'admin_stats' },
        ],
      ],
    };

    await ctx.editMessageText('🔧 Админ-панель', { reply_markup: keyboard });
  }

  @Action(/view_details_(\d+)/)
  async viewRequestDetails(@Ctx() ctx: any) {
    const requestId = parseInt(ctx.match[1]);
    const user = await this.userService.findOrCreateUser(ctx.from);
    
    if (!user.isAdmin) {
      await ctx.answerCbQuery('❌ Нет прав');
      return;
    }

    const request = await this.botService.getRequestById(requestId);
    if (!request) {
      await ctx.answerCbQuery('❌ Заявка не найдена');
      return;
    }

    const statusText = this.getStatusText(request.status);
    const timeAgo = this.getTimeAgo(request.createdAt);
    const clientName = request.user.username ? `@${request.user.username}` : request.user.firstName;
    
    let message = `📋 Детали заявки <b>#${request.id}</b>

👤 Клиент: <b>${clientName}</b>
📞 Telegram ID: <b>${request.user.telegramId}</b>
💱 Операция: <b>Покупка ${formatUSDT(request.amount)}</b>
🏙️ Город: <b>${request.city}</b>
📅 Создана: <b>${timeAgo}</b>
📊 Статус: <b>${statusText}</b>
`;
    
    if (request.exchangeRate) {
      // Рассчитываем стоимость в рублях
      const totalRub = request.exchangeRate * request.amount;
      message += `💰 Курс: <b>${formatCurrency(request.exchangeRate, '₽', 2)} за 1 USDT</b>
💸 Итого к оплате: <b>${formatCurrency(totalRub, '₽', 2)}</b>
📅 Подтверждена: <b>${new Date(request.confirmedAt).toLocaleString('ru-RU')}</b>
`;
    }
    
    if (request.adminResponse) {
      message += `💬 Ответ админа: <b>${request.adminResponse}</b>
`;
    }

    const keyboard = {
      inline_keyboard: [
        [
          {
            text: '🔙 Назад к статистике',
            callback_data: 'admin_stats',
          },
        ],
      ],
    };

    await ctx.editMessageText(message, { reply_markup: keyboard });
  }

  private getStatusText(status: string): string {
    const statusMap = {
      'pending': '⏳ Ожидает ответа',
      'confirmed': '⏳ Ожидает ответа',
      'booked': '✅ Забронирована',
      'waiting_client': '💬 Ждет клиента',
      'completed': '✅ Завершена',
      'cancelled': '❌ Отменена',
      'expired': '⏰ Истекла',
    };
    return statusMap[status] || status;
  }

  private getTimeLeft(expiresAt: Date): string {
    const now = new Date();
    const diffMs = new Date(expiresAt).getTime() - now.getTime();
    
    if (diffMs <= 0) {
      return '❌ Истекла';
    }
    
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffSeconds = Math.floor((diffMs % (1000 * 60)) / 1000);
    
    return `Осталось: ${diffMinutes}м ${diffSeconds}с`;
  }

  private getTimeAgo(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - new Date(date).getTime();
    
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays > 0) {
      return `${diffDays} дн. назад`;
    } else if (diffHours > 0) {
      return `${diffHours} ч. назад`;
    } else if (diffMinutes > 0) {
      return `${diffMinutes} мин. назад`;
    } else {
      return 'Только что';
    }
  }

  @Action(/respond_(\d+)/)
  async onRespondToRequest(@Ctx() ctx: any) {
    const requestId = parseInt(ctx.match[1]);
    const user = await this.userService.findOrCreateUser(ctx.from);
    
    if (!user.isAdmin) {
      await ctx.answerCbQuery('❌ Нет прав');
      return;
    }

    // Сохраняем состояние админа для ответа на заявку
    await this.userService.setUserTempData(user.id, 'admin_responding_to', requestId);
    
    await ctx.editMessageText(`📝 Ответ на заявку #${requestId}

Просто отправьте курс обмена (цифрой) и любую дополнительную информацию.

Например: \`${formatNumber(95.5)}\` или \`${formatNumber(95.5)} - встреча у метро\``, {
      parse_mode: 'Markdown',
    });

    await ctx.answerCbQuery('📝 Отправьте ответ следующим сообщением');
  }

  @Action(/reject_(\d+)/)
  async onRejectRequest(@Ctx() ctx: any) {
    const requestId = parseInt(ctx.match[1]);
    
    // Получаем заявку
    const request = await this.botService.getRequestById(requestId);
    if (!request) {
      await ctx.answerCbQuery('❌ Заявка не найдена');
      return;
    }

    // Отправляем уведомление пользователю об отклонении
    try {
      await ctx.telegram.sendMessage(
        request.user.telegramId,
        `❌ Ваша заявка #${requestId} была отклонена администратором.`
      );
    } catch (error) {
      this.logger.error('Ошибка отправки уведомления об отклонении:', error);
    }

    // Обновляем сообщение в админ-чате
    await ctx.editMessageText(
      ctx.callbackQuery.message.text + '\n\n❌ ЗАЯВКА ОТКЛОНЕНА',
      {
        reply_markup: undefined,
      }
    );

    await ctx.answerCbQuery('❌ Заявка отклонена');
  }

  @Action(/complete_(\d+)/)
  async onCompleteRequest(@Ctx() ctx: any) {
    const requestId = parseInt(ctx.match[1]);
    const user = await this.userService.findOrCreateUser(ctx.from);
    
    if (!user.isAdmin) {
      await ctx.answerCbQuery('❌ Нет прав');
      return;
    }

    // Получаем заявку
    const request = await this.botService.getRequestById(requestId);
    if (!request) {
      await ctx.answerCbQuery('❌ Заявка не найдена');
      return;
    }

    // Завершаем обмен
    await this.botService.completeExchange(requestId);
    
    // Уведомляем админа
    await this.botService.notifyAdminAboutBooking(requestId, 'completed');

    await ctx.answerCbQuery(`✅ Обмен по заявке #${requestId} завершен!`);
    
    // Обновляем список подтвержденных заявок
    await this.showConfirmedRequests(ctx);
  }

  @Action(/cancel_(\d+)/)
  async onCancelRequest(@Ctx() ctx: any) {
    const requestId = parseInt(ctx.match[1]);
    const user = await this.userService.findOrCreateUser(ctx.from);
    
    if (!user.isAdmin) {
      await ctx.answerCbQuery('❌ Нет прав');
      return;
    }

    // Получаем заявку
    const request = await this.botService.getRequestById(requestId);
    if (!request) {
      await ctx.answerCbQuery('❌ Заявка не найдена');
      return;
    }

    // Отменяем заявку в базе данных
    await this.exchangeRequestService.updateRequestStatus(requestId, RequestStatus.CANCELLED);

    // Отправляем уведомление в админ-канал об отмене
    await this.botService.notifyAdminAboutBooking(requestId, 'cancelled');

    // Отправляем уведомление пользователю об отмене
    try {
      await ctx.telegram.sendMessage(
        request.user.telegramId,
        `❌ Ваша заявка #${requestId} была отменена администратором.

📋 Заявка: Покупка ${formatUSDT(request.amount)}
🏙️ Город: ${request.city}

Вы можете создать новую заявку командой /start`
      );
    } catch (error) {
      this.logger.error('Ошибка отправки уведомления об отмене:', error);
    }

    // Обновляем сообщение в чате админа
    try {
      await ctx.editMessageText(
        `❌ Заявка #${requestId} ОТМЕНЕНА

👤 Клиент: @${request.user.username || request.user.firstName}
📞 Telegram ID: ${request.user.telegramId}
💱 Операция: покупка USDT
💰 Валюта: ₮ USDT
💵 Сумма: ${formatUSDT(request.amount)}
🏙️ Город: ${request.city}
📅 Отменена: ${new Date().toLocaleString('ru-RU')}`,
        { reply_markup: undefined }
      );
    } catch (error) {
      // Если не удалось отредактировать, просто отвечаем
      this.logger.error('Ошибка редактирования сообщения:', error);
    }

    await ctx.answerCbQuery('❌ Заявка отменена');
  }

  @On('text')
  async onText(@Ctx() ctx: any, @Message('text') message: string) {
    // Логируем ID чата для получения админ-чата
    this.logger.log('Chat ID:', ctx.chat.id, 'Type:', ctx.chat.type);
    
    // Сначала получаем пользователя
    const user = await this.userService.findOrCreateUser(ctx.from);
    
    // Проверяем, отвечает ли админ на заявку (используем внутренний ID)
    const adminRespondingTo = await this.userService.getUserTempData(user.id, 'admin_responding_to');
    
    if (adminRespondingTo) {
      await this.handleAdminResponse(ctx, message, adminRespondingTo);
      return;
    }

    // Проверяем, нажал ли пользователь кнопку "💰 Купить USDT"
    if (message === '💰 Купить USDT') {
      await this.userService.updateUserState(user.id, UserState.ENTERING_AMOUNT);
      // Отправляем сообщение без клавиатуры для ввода
      await this.botService.sendInputKeyboard(ctx.from.id, '💰 Введите количество USDT, которое хотите купить:');
      return;
    }
    
    const response = await this.botService.processUserMessage(message, ctx.from, user.id);
    
    // Если это сообщение об успешном создании заявки, возвращаем клавиатуру
    if (response.includes('✅ Ваша заявка #') && response.includes('принята!')) {
      const keyboard = {
        keyboard: [
          [{ text: '💰 Купить USDT' }]
        ],
        resize_keyboard: true,
        one_time_keyboard: false
      };

      await ctx.reply(response, { reply_markup: keyboard, parse_mode: 'HTML' });
    } else {
      const options = response.includes('Выберите или напишите ваш город') ? {
        reply_markup: {
          inline_keyboard: [
            [
              { text: 'Москва', callback_data: 'city_Москва' },
              { text: 'Новосибирск', callback_data: 'city_Новосибирск' }
            ],
            [
              { text: 'Санкт-Петербург', callback_data: 'city_Санкт-Петербург' },
              { text: 'Екатеринбург', callback_data: 'city_Екатеринбург' }
            ],
            [
              { text: 'Краснодар', callback_data: 'city_Краснодар' }
            ]
          ],
          parse_mode: 'HTML'
        }
      } : {
        parse_mode: 'HTML'
      };
      await ctx.reply(response, options);
    }
  }

  private async handleAdminResponse(@Ctx() ctx: any, message: string, requestId: number) {
    // Извлекаем курс из начала сообщения (первое число)
    const rateMatch = message.match(/^(\d+(?:\.\d+)?)/);
    if (!rateMatch) {
      await ctx.reply(`❌ Сообщение должно начинаться с курса (числом).\nНапример: ${formatNumber(95.5)} или 75`);
      return;
    }

    const rate = parseFloat(rateMatch[1]);

    // Обрабатываем ответ
    await this.botService.processAdminResponse(requestId, rate, message, ctx.from.first_name);

    // Очищаем состояние админа
    const user = await this.userService.findOrCreateUser(ctx.from);
    await this.userService.setUserTempData(user.id, 'admin_responding_to', null);

    await ctx.reply(`✅ Ответ отправлен клиенту по заявке #${requestId}`);
  }

  @Action(/city_(.+)/)
  async handleCitySelection(@Ctx() ctx: any) {
    const cityName = ctx.match[1];
    
    // Отвечаем на callback, чтобы убрать "загрузку" с кнопки
    await ctx.answerCbQuery();
    
    // Получаем пользователя напрямую из callback контекста
    const user = await this.userService.findOrCreateUser(ctx.from);
    
    // Проверяем, отвечает ли админ на заявку
    const adminRespondingTo = await this.userService.getUserTempData(user.id, 'admin_responding_to');
    
    if (adminRespondingTo) {
      await this.handleAdminResponse(ctx, cityName, adminRespondingTo);
      return;
    }
    
    // Обрабатываем выбор города напрямую через botService
    const response = await this.botService.processUserMessage(cityName, ctx.from, user.id);
    
    // Отправляем ответ
    if (response.includes('✅ Ваша заявка #') && response.includes('принята!')) {
      const keyboard = {
        keyboard: [
          [{ text: '💰 Купить USDT' }]
        ],
        resize_keyboard: true,
        one_time_keyboard: false,
        parse_mode: 'HTML'
      };

      await ctx.reply(response, { reply_markup: keyboard });
    } else {
      const options = response.includes('Выберите или напишите ваш город') ? {
        reply_markup: {
          inline_keyboard: [
            [
              { text: 'Москва', callback_data: 'city_Москва' },
              { text: 'Новосибирск', callback_data: 'city_Новосибирск' }
            ],
            [
              { text: 'Санкт-Петербург', callback_data: 'city_Санкт-Петербург' },
              { text: 'Екатеринбург', callback_data: 'city_Екатеринбург' }
            ],
            [
              { text: 'Краснодар', callback_data: 'city_Краснодар' }
            ]
          ],
          parse_mode: 'HTML'
        }
      } : {
        parse_mode: 'HTML'
      };
      await ctx.reply(response, options);
    }
  }


  @Action(/book_(\d+)/)
  async onBookRequest(@Ctx() ctx: any) {
    const requestId = parseInt(ctx.match[1]);

    // Обновляем статус заявки на BOOKED
    await this.exchangeRequestService.setBookedStatus(requestId);

    // Убираем текст с предупреждением о времени и кнопками с помощью регулярного выражения
    const originalMessage = ctx.callbackQuery.message.text;
    // Ищем текст от предупреждения (⚠️) до конца сообщения
    const baseMessage = originalMessage.replace(/\s*<b>⚠️.*$/s, '');
    
    const newMessage = `${baseMessage}

✅ Заявка забронирована!

<b>С вами свяжется менеджер для уточнения деталей сделки!</b>`;

    // Обновляем сообщение пользователя
    await ctx.editMessageText(
      newMessage,
      { reply_markup: undefined }
    );

    // Уведомляем админа о бронировании
    await this.botService.notifyAdminAboutBooking(requestId, 'book');
    await this.botService.sendMessageToGroupHtml(await this.botService.getBookingMessage(requestId));

    await ctx.answerCbQuery('✅ Заявка забронирована!');
  }

  @Action(/clarify_(\d+)/)
  async onClarifyRequest(@Ctx() ctx: any) {
    const requestId = parseInt(ctx.match[1]);
    
    // Убираем текст с вопросом "Что вы хотите сделать?" до конца сообщения
    const originalMessage = ctx.callbackQuery.message.text;
    const newMessage = originalMessage.replace(/\s*Что вы хотите сделать\?.*$/s, '') + '\n\n💬 Спасибо за уточнение курса!';
    
    // Обновляем сообщение пользователя
    await ctx.editMessageText(
      newMessage,
      { reply_markup: {
        keyboard: [
          [{ text: '💰 Купить USDT' }]
        ],
        resize_keyboard: true,
        one_time_keyboard: false
      } }
    );

    // Уведомляем админа
    await this.botService.notifyAdminAboutBooking(requestId, 'clarify');
    
    await ctx.answerCbQuery('💬 Спасибо за обращение!');
  }

    @Action(/wait_info_(\d+)/)
  async onWaitInfoRequest(@Ctx() ctx: any) {
    const requestId = parseInt(ctx.match[1]);

    // Обновляем статус заявки на WAITING_CLIENT
    await this.exchangeRequestService.setWaitingClientStatus(requestId);

    // Обновляем сообщение пользователя, оставляя только кнопку "Бронирую"
    const keyboard = {
      inline_keyboard: [
        [
          {
            text: '✅ Бронирую',
            callback_data: `book_${requestId}`,
          },
        ],
      ],
    };

    // Убираем текст с вопросом "Что вы хотите сделать?" до конца сообщения
    const originalMessage = ctx.callbackQuery.message.text;
    const baseMessage = originalMessage.replace(/\s*Что вы хотите сделать\?.*$/s, '');
    
    await ctx.editMessageText(
      baseMessage + `\n\n⏳ Ожидаем дополнительную информацию. Курс действителен ${formatNumber(10)} минут.`,
      { reply_markup: keyboard }
    );

    // Уведомляем админа
    await this.botService.notifyAdminAboutBooking(requestId, 'wait_info');

    await ctx.answerCbQuery('⏳ Ожидаем информацию');
  }

  @On('sticker')
  async onSticker(@Ctx() ctx: any) {
    await ctx.reply('Используйте /start для работы с ботом 😊');
  }

  @Action('buy_usdt')
  async onBuyUsdt(@Ctx() ctx: any) {
    const user = await this.userService.findOrCreateUser(ctx.from);
    await this.userService.updateUserState(user.id, UserState.ENTERING_AMOUNT);

    // Отправляем клавиатуру с force_reply для ожидания ввода
    await this.botService.sendInputKeyboard(ctx.from.id, '💰 Введите количество USDT, которое хотите купить:');
  }
}
