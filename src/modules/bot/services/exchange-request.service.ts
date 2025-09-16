import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExchangeRequest, RequestStatus } from '../../../common/entities/exchange-request.entity';

export interface CreateExchangeRequestDto {
  userId: number;
  amount: number;
  city: string;
}

@Injectable()
export class ExchangeRequestService {
  private logger = new Logger(ExchangeRequestService.name);
  constructor(
    @InjectRepository(ExchangeRequest)
    private exchangeRequestRepository: Repository<ExchangeRequest>,
  ) {}

  async createRequest(dto: CreateExchangeRequestDto): Promise<ExchangeRequest> {
    const request = this.exchangeRequestRepository.create(dto);
    return await this.exchangeRequestRepository.save(request);
  }

  async findById(id: number): Promise<ExchangeRequest | null> {
    return await this.exchangeRequestRepository.findOne({
      where: { id },
      relations: ['user'],
    });
  }

  async updateRequestStatus(id: number, status: RequestStatus): Promise<void> {
    await this.exchangeRequestRepository.update(id, { status });
  }

  async setAdminResponse(
    id: number,
    exchangeRate: number,
    adminResponse: string,
    totalAmount: number,
  ): Promise<void> {
    try {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 10 * 60 * 1000); // + 10 минут

      const result = await this.exchangeRequestRepository.update(id, {
        exchangeRate,
        adminResponse,
        totalAmount,
        status: RequestStatus.CONFIRMED,
        confirmedAt: now,
        expiresAt,
      });
      this.logger.log(`Обновлена заявка #${id}:`, { exchangeRate, adminResponse, totalAmount, expiresAt });
    } catch (error) {
      this.logger.error('Ошибка обновления заявки:', error);
      throw error;
    }
  }

  async setAdminMessageId(id: number, messageId: number): Promise<void> {
    await this.exchangeRequestRepository.update(id, { adminMessageId: messageId });
  }

  async getActiveRequests(): Promise<ExchangeRequest[]> {
    return await this.exchangeRequestRepository.find({
      where: { status: RequestStatus.PENDING },
      relations: ['user'],
      order: { createdAt: 'DESC' },
    });
  }

  async getConfirmedRequests(): Promise<ExchangeRequest[]> {
    const now = new Date();
    return await this.exchangeRequestRepository.find({
      where: [
        { status: RequestStatus.CONFIRMED },
        { status: RequestStatus.BOOKED },
        { status: RequestStatus.WAITING_CLIENT }
      ],
      relations: ['user'],
      order: { confirmedAt: 'DESC' },
    });
  }

  async setBookedStatus(id: number): Promise<void> {
    const now = new Date();
    await this.exchangeRequestRepository.update(id, {
      status: RequestStatus.BOOKED,
      bookedAt: now,
    });
  }

  async setWaitingClientStatus(id: number): Promise<void> {
    await this.exchangeRequestRepository.update(id, {
      status: RequestStatus.WAITING_CLIENT,
    });
  }

  async getExpiredRequests(): Promise<ExchangeRequest[]> {
    const now = new Date();
    return await this.exchangeRequestRepository
      .createQueryBuilder('request')
      .leftJoinAndSelect('request.user', 'user')
      .where('request.expiresAt < :now', { now })
      .andWhere('request.status IN (:...statuses)', { 
        statuses: [RequestStatus.CONFIRMED, RequestStatus.WAITING_CLIENT] 
      })
      .getMany();
  }

  async markAsExpired(ids: number[]): Promise<void> {
    if (ids.length === 0) return;
    await this.exchangeRequestRepository.update(ids, {
      status: RequestStatus.EXPIRED,
    });
  }

  async getRecentRequests(limit: number = 20): Promise<ExchangeRequest[]> {
    return await this.exchangeRequestRepository.find({
      relations: ['user'],
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  async getWaitingClientRequests(): Promise<ExchangeRequest[]> {
    return await this.exchangeRequestRepository.find({
      where: { status: RequestStatus.WAITING_CLIENT },
      relations: ['user'],
      order: { updatedAt: 'ASC' },
    });
  }

  async setCompletedStatus(id: number): Promise<void> {
    await this.exchangeRequestRepository.update(id, {
      status: RequestStatus.COMPLETED,
    });
  }

  async setCompletionLink(id: number, link: string): Promise<void> {
    await this.exchangeRequestRepository.update(id, {
      completionLink: link,
      status: RequestStatus.COMPLETED,
    });
  }

  async setGroupMessageId(id: number, messageId: number): Promise<void> {
    await this.exchangeRequestRepository.update(id, {
      groupMessageId: messageId,
    });
  }

  async setCourierCollected(id: number): Promise<void> {
    await this.exchangeRequestRepository.update(id, {
      courierCollected: true,
    });
  }
}
