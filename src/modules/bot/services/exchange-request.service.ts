import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExchangeRequest, OperationType, CurrencyType, RequestStatus } from '../../../common/entities/exchange-request.entity';

export interface CreateExchangeRequestDto {
  userId: number;
  operationType: OperationType;
  currency: CurrencyType;
  amount: number;
  city: string;
}

@Injectable()
export class ExchangeRequestService {
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
      const result = await this.exchangeRequestRepository.update(id, {
        exchangeRate,
        adminResponse,
        totalAmount,
        status: RequestStatus.PROCESSING,
      });
      console.log(`Обновлена заявка #${id}:`, { exchangeRate, adminResponse, totalAmount });
    } catch (error) {
      console.error('Ошибка обновления заявки:', error);
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
}
