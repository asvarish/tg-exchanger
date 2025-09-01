import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BotUpdate } from './bot.update';
import { BotService } from './bot.service';
import { UserService } from './services/user.service';
import { ExchangeRequestService } from './services/exchange-request.service';
import { AdminNotificationService } from './services/admin-notification.service';
import { User } from '../../common/entities/user.entity';
import { ExchangeRequest } from '../../common/entities/exchange-request.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, ExchangeRequest]),
  ],
  providers: [BotUpdate, BotService, UserService, ExchangeRequestService, AdminNotificationService],
  exports: [BotService, UserService, ExchangeRequestService, AdminNotificationService],
})
export class BotModule {}
