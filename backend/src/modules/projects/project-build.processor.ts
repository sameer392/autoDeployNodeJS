import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Project } from '../../database/entities/project.entity';
import { Domain } from '../../database/entities/domain.entity';
import { ProjectEnvVar } from '../../database/entities/project-env-var.entity';
import { DockerService } from '../docker/docker.service';
import { TRAEFIK_NETWORK } from '../../common/constants';

const BUILD_DIR = process.env.BUILD_DIR || '/app/builds';

@Processor('project-build')
export class ProjectBuildProcessor extends WorkerHost {
  private readonly logger = new Logger(ProjectBuildProcessor.name);

  constructor(
    @InjectRepository(Project)
    private readonly projectRepo: Repository<Project>,
    @InjectRepository(Domain)
    private readonly domainRepo: Repository<Domain>,
    @InjectRepository(ProjectEnvVar)
    private readonly envVarRepo: Repository<ProjectEnvVar>,
    private readonly dockerService: DockerService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    const { projectId, buildContextPath } = job.data;
    const project = await this.projectRepo.findOne({
      where: { id: projectId },
      relations: ['domains', 'envVars'],
    });
    if (!project) {
      this.logger.warn(`Project ${projectId} not found`);
      return;
    }

    const contextPath = buildContextPath || `${BUILD_DIR}/${project.slug}`;

    try {
      const imageName = `hosting-${project.slug}`;
      const imageTag = project.imageTag || 'latest';

      await this.dockerService.buildImage(
        contextPath,
        imageName,
        imageTag,
        project.dockerfilePath,
        (msg) => this.logger.debug(`[${project.slug}] ${msg}`),
      );

      const env: Record<string, string> = {
        PERSISTENT_DATA_DIR: '/data',
      };
      for (const ev of project.envVars || []) {
        env[ev.key] = ev.value;
      }

      const domains = (project.domains || [])
        .map((d) => d.domain)
        .filter(Boolean);

      const dataVolumeName = `hosting-data-${project.slug}`;
      const containerId = await this.dockerService.createContainer({
        image: `${imageName}:${imageTag}`,
        name: project.slug,
        internalPort: project.internalPort,
        memoryLimitMb: project.memoryLimitMb,
        cpuLimit: Number(project.cpuLimit),
        env: Object.keys(env).length ? env : undefined,
        domains: domains.length ? domains : undefined,
        traefikNetwork: TRAEFIK_NETWORK,
        dataVolumeName,
      });

      await this.dockerService.startContainer(containerId);

      await this.projectRepo.update(projectId, {
        status: 'running',
        containerId,
        imageName,
        errorMessage: null,
      });

      this.logger.log(`Project ${project.slug} built and started`);
    } catch (err: any) {
      this.logger.error(`Project ${project.slug} build failed: ${err?.message}`);
      await this.projectRepo.update(projectId, {
        status: 'error',
        errorMessage: err?.message || 'Build failed',
      });
    }
  }
}
