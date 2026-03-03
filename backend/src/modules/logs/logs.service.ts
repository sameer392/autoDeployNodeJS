import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Log, LogType, LogLevel } from '../../database/entities/log.entity';

@Injectable()
export class LogsService {
  constructor(
    @InjectRepository(Log)
    private readonly logRepo: Repository<Log>,
  ) {}

  async create(
    type: LogType,
    message: string,
    options?: {
      projectId?: number;
      adminId?: number;
      level?: LogLevel;
      metadata?: Record<string, unknown>;
    },
  ): Promise<Log> {
    const log = this.logRepo.create({
      type,
      message,
      level: options?.level ?? 'info',
      projectId: options?.projectId ?? null,
      adminId: options?.adminId ?? null,
      metadata: options?.metadata ?? null,
    });
    return this.logRepo.save(log);
  }

  async findByProject(
    projectId: number,
    options?: { limit?: number; type?: LogType },
  ): Promise<Log[]> {
    const qb = this.logRepo
      .createQueryBuilder('log')
      .where('log.projectId = :projectId', { projectId })
      .orderBy('log.createdAt', 'DESC')
      .take(options?.limit ?? 100);
    if (options?.type) {
      qb.andWhere('log.type = :type', { type: options.type });
    }
    return qb.getMany();
  }
}
