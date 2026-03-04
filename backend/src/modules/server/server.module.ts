import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Project } from '../../database/entities/project.entity';
import { ServerController } from './server.controller';
import { ServerStatsService } from './server.service';
import { HostMetricsService } from './host-metrics.service';

@Module({
  imports: [TypeOrmModule.forFeature([Project])],
  controllers: [ServerController],
  providers: [ServerStatsService, HostMetricsService],
})
export class ServerModule {}
