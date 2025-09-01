import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from './user.entity';

export enum OperationType {
  BUY = 'buy',
  SELL = 'sell',
}

export enum RequestStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export enum CurrencyType {
  USD = 'USD',
  EUR = 'EUR',
  RUB = 'RUB',
  USDT = 'USDT',
}

@Entity('exchange_requests')
export class ExchangeRequest {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'enum', enum: OperationType })
  operationType: OperationType;

  @Column({ type: 'enum', enum: CurrencyType })
  currency: CurrencyType;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  amount: number;

  @Column()
  city: string;

  @Column({ type: 'enum', enum: RequestStatus, default: RequestStatus.PENDING })
  status: RequestStatus;

  @Column({ type: 'decimal', precision: 10, scale: 4, nullable: true })
  exchangeRate: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  totalAmount: number;

  @Column({ nullable: true })
  adminResponse: string;

  @Column({ type: 'bigint', nullable: true })
  adminMessageId: number;

  @Column({ type: 'bigint' })
  userId: number;

  @ManyToOne(() => User, user => user.exchangeRequests)
  @JoinColumn({ name: 'userId' })
  user: User;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
