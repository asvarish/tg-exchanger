import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TelegrafModule } from 'nestjs-telegraf';
import { BotModule } from './modules/bot/bot.module';
import { DatabaseConfig } from './config/database.config';

@Module({
  imports: [
    // Конфигурация переменных окружения
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    
    // Конфигурация базы данных
    TypeOrmModule.forRootAsync({
      useClass: DatabaseConfig,
    }),
    
    // Конфигурация Telegram бота
    TelegrafModule.forRoot({
      token: process.env.TELEGRAM_BOT_TOKEN,
      include: [BotModule],
    }),
    
    // Модули приложения
    BotModule,
  ],
})
export class AppModule {}
