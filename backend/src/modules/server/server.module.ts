import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Project } from '../../database/entities/project.entity';
import { ServerController } from './server.controller';
import { ServerStatsService } from './server.service';

@Module({
  imports: [TypeOrmModule.forFeature([Project])],
  controllers: [ServerController],
  providers: [ServerStatsService],
})
export class ServerModule {}
