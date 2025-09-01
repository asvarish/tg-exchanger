import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { BotUpdate } from './bot.update';
import { BotService } from './bot.service';
import { UserService } from './services/user.service';
import { ExchangeRequestService } from './services/exchange-request.service';
import { AdminNotificationService } from './services/admin-notification.service';
import { ExpirationService } from './services/expiration.service';
import { User } from '../../common/entities/user.entity';
import { ExchangeRequest } from '../../common/entities/exchange-request.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, ExchangeRequest]),
    ScheduleModule.forRoot(),
  ],
  providers: [BotUpdate, BotService, UserService, ExchangeRequestService, AdminNotificationService, ExpirationService],
  exports: [BotService, UserService, ExchangeRequestService, AdminNotificationService, ExpirationService],
})
export class BotModule {}
