import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';

import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { ProjectBuildProcessor } from './project-build.processor';
import { SupabaseService } from './supabase.service';
import { Project } from '../../database/entities/project.entity';
import { ProjectEnvVar } from '../../database/entities/project-env-var.entity';
import { Domain } from '../../database/entities/domain.entity';
import { ResourceStatsModule } from '../resource-stats/resource-stats.module';

@Module({
  imports: [
    ResourceStatsModule,
    TypeOrmModule.forFeature([Project, ProjectEnvVar, Domain]),
    BullModule.registerQueue({
      name: 'project-build',
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: { count: 10 },
      },
    }),
  ],
  controllers: [ProjectsController],
  providers: [ProjectsService, ProjectBuildProcessor, SupabaseService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
