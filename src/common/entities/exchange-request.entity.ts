import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from './user.entity';

export enum RequestStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  CONFIRMED = 'confirmed', // Админ ответил с курсом
  BOOKED = 'booked', // Пользователь забронировал
  WAITING_CLIENT = 'waiting_client', // Ждет информацию от клиента
  EXPIRED = 'expired', // Истек срок действия
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

@Entity('exchange_requests')
export class ExchangeRequest {
  @PrimaryGeneratedColumn()
  id: number;

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

  @Column({ type: 'timestamp', nullable: true })
  confirmedAt: Date; // Время ответа админа

  @Column({ type: 'timestamp', nullable: true })
  bookedAt: Date; // Время бронирования пользователем

  @Column({ type: 'timestamp', nullable: true })
  expiresAt: Date; // Время истечения курса

  @Column({ nullable: true })
  completionLink: string; // Ссылка для подтверждения выполнения

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
