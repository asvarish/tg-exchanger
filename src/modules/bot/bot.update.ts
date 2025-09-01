import { Injectable } from '@nestjs/common';
import { Update, Ctx, Start, Command, On, Message, Action } from 'nestjs-telegraf';
import { BotService } from './bot.service';
import { UserService } from './services/user.service';
import { UserState } from '../../common/enums/user-state.enum';
import { OperationType, CurrencyType } from '../../common/entities/exchange-request.entity';

@Injectable()
@Update()
export class BotUpdate {
  constructor(
    private readonly botService: BotService,
    private readonly userService: UserService,
  ) {}

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

Например: \`95.5\` или \`95.5 - встреча у метро\``, {
        parse_mode: 'Markdown',
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

    // Обычный старт для клиентов
    const user = await this.userService.findOrCreateUser(ctx.from);
    await this.userService.updateUserState(user.id, UserState.START);

    const { text, keyboard } = await this.botService.getStartMessage();
    await ctx.reply(text, {
      reply_markup: keyboard,
    });
  }

  @Command('help')
  async helpCommand(@Ctx() ctx: any) {
    const message = await this.botService.getHelpMessage();
    await ctx.reply(message);
  }

  @Action(/operation_(.+)/)
  async onOperationSelect(@Ctx() ctx: any) {
    const operation = ctx.match[1] as OperationType;
    const user = await this.userService.findOrCreateUser(ctx.from);

    await this.userService.setUserTempData(user.id, 'operationType', operation);
    await this.userService.updateUserState(user.id, UserState.CHOOSING_CURRENCY);

    const operationText = operation === 'buy' ? 'покупку' : 'продажу';
    await ctx.editMessageText(
      `💱 Вы выбрали ${operationText} валюты.\n\nВыберите валюту:`,
      {
        reply_markup: this.botService.getCurrencyKeyboard(),
      }
    );
  }

  @Action(/currency_(.+)/)
  async onCurrencySelect(@Ctx() ctx: any) {
    const currency = ctx.match[1] as CurrencyType;
    const user = await this.userService.findOrCreateUser(ctx.from);

    await this.userService.setUserTempData(user.id, 'currency', currency);
    await this.userService.updateUserState(user.id, UserState.ENTERING_AMOUNT);

    const operationType = await this.userService.getUserTempData(user.id, 'operationType');
    const operationText = operationType === 'buy' ? 'покупаете' : 'продаете';
    
    await ctx.editMessageText(
      `💰 Вы ${operationText} ${this.botService.formatCurrency(currency)}\n\n💵 Введите сумму:`
    );
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
          { text: '📋 Активные заявки', callback_data: 'admin_active_requests' },
        ],
        [
          { text: '📊 Статистика', callback_data: 'admin_stats' },
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
      await ctx.editMessageText('📝 Нет активных заявок');
      return;
    }

    let message = '📋 Активные заявки:\n\n';
    const keyboard = [];

    for (const request of activeRequests) {
      const operationType = request.operationType === 'buy' ? 'Покупка' : 'Продажа';
      message += `🔹 Заявка #${request.id}\n`;
      message += `👤 @${request.user.username || request.user.firstName}\n`;
      message += `💱 ${operationType} ${request.amount} ${request.currency}\n`;
      message += `🏙️ Город: ${request.city}\n`;
      message += `📅 ${new Date(request.createdAt).toLocaleString('ru-RU')}\n\n`;

      keyboard.push([
        {
          text: `💬 Ответить на заявку #${request.id}`,
          callback_data: `respond_${request.id}`,
        },
      ]);
    }

    await ctx.editMessageText(message, {
      reply_markup: { inline_keyboard: keyboard },
    });
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

Например: \`95.5\` или \`95.5 - встреча у метро\``, {
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
      console.error('Ошибка отправки уведомления об отклонении:', error);
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

  @On('text')
  async onText(@Ctx() ctx: any, @Message('text') message: string) {
    // Логируем ID чата для получения админ-чата
    console.log('Chat ID:', ctx.chat.id, 'Type:', ctx.chat.type);
    
    // Сначала получаем пользователя
    const user = await this.userService.findOrCreateUser(ctx.from);
    
    // Проверяем, отвечает ли админ на заявку (используем внутренний ID)
    const adminRespondingTo = await this.userService.getUserTempData(user.id, 'admin_responding_to');
    
    if (adminRespondingTo) {
      await this.handleAdminResponse(ctx, message, adminRespondingTo);
      return;
    }
    
    const response = await this.botService.processUserMessage(message, ctx.from, user.id);
    await ctx.reply(response);
  }

  private async handleAdminResponse(@Ctx() ctx: any, message: string, requestId: number) {
    // Извлекаем курс из начала сообщения (первое число)
    const rateMatch = message.match(/^(\d+(?:\.\d+)?)/);
    if (!rateMatch) {
      await ctx.reply('❌ Сообщение должно начинаться с курса (числом).\nНапример: 95.5 или 95.5 - дополнительная информация');
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

  @Action(/book_(\d+)/)
  async onBookRequest(@Ctx() ctx: any) {
    const requestId = parseInt(ctx.match[1]);
    
    // Обновляем сообщение пользователя
    await ctx.editMessageText(
      ctx.callbackQuery.message.text + '\n\n✅ Заявка забронирована!',
      { reply_markup: undefined }
    );

    // Уведомляем админа о бронировании
    await this.botService.notifyAdminAboutBooking(requestId, 'book');
    
    await ctx.answerCbQuery('✅ Заявка забронирована!');
  }

  @Action(/clarify_(\d+)/)
  async onClarifyRequest(@Ctx() ctx: any) {
    const requestId = parseInt(ctx.match[1]);
    
    // Обновляем сообщение пользователя
    await ctx.editMessageText(
      ctx.callbackQuery.message.text + '\n\n💬 Спасибо за уточнение курса!',
      { reply_markup: undefined }
    );

    // Уведомляем админа
    await this.botService.notifyAdminAboutBooking(requestId, 'clarify');
    
    await ctx.answerCbQuery('💬 Спасибо за обращение!');
  }

  @Action(/wait_info_(\d+)/)
  async onWaitInfoRequest(@Ctx() ctx: any) {
    const requestId = parseInt(ctx.match[1]);
    
    // Обновляем сообщение пользователя
    await ctx.editMessageText(
      ctx.callbackQuery.message.text + '\n\n⏳ Ожидаем дополнительную информацию',
      { reply_markup: undefined }
    );

    // Уведомляем админа
    await this.botService.notifyAdminAboutBooking(requestId, 'wait_info');
    
    await ctx.answerCbQuery('⏳ Ожидаем информацию');
  }

  @On('sticker')
  async onSticker(@Ctx() ctx: any) {
    await ctx.reply('Используйте /start для работы с ботом 😊');
  }
}
