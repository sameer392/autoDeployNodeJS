import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';

import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { ProjectBuildProcessor } from './project-build.processor';
import { Project } from '../../database/entities/project.entity';
import { ProjectEnvVar } from '../../database/entities/project-env-var.entity';
import { Domain } from '../../database/entities/domain.entity';

@Module({
  imports: [
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
  providers: [ProjectsService, ProjectBuildProcessor],
  exports: [ProjectsService],
})
export class ProjectsModule {}
