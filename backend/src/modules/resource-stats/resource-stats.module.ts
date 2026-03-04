import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ResourceStats } from '../../database/entities/resource-stats.entity';
import { Project } from '../../database/entities/project.entity';
import { ResourceStatsService } from './resource-stats.service';

@Module({
  imports: [TypeOrmModule.forFeature([ResourceStats, Project])],
  providers: [ResourceStatsService],
  exports: [ResourceStatsService],
})
export class ResourceStatsModule {}
