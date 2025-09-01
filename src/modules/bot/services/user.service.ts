import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../../common/entities/user.entity';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  async findOrCreateUser(telegramUser: any): Promise<User> {
    let user = await this.userRepository.findOne({
      where: { telegramId: telegramUser.id },
    });

    if (!user) {
      user = this.userRepository.create({
        telegramId: telegramUser.id,
        username: telegramUser.username,
        firstName: telegramUser.first_name,
        lastName: telegramUser.last_name,
      });
      await this.userRepository.save(user);
    }

    return user;
  }

  async updateUserState(userId: number, state: string): Promise<void> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });
    
    if (user) {
      const settings = user.settings || {};
      settings.state = state;
      await this.userRepository.update(userId, { settings });
    }
  }

  async getUserState(userId: number): Promise<string | null> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });
    return user?.settings?.state || null;
  }

  async setUserTempData(userId: number, key: string, value: any): Promise<void> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });
    
    if (user) {
      const settings = user.settings || {};
      settings[key] = value;
      await this.userRepository.update(userId, { settings });
    }
  }

  async getUserTempData(userId: number, key: string): Promise<any> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });
    return user?.settings?.[key] || null;
  }
}
