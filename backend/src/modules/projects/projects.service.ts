import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Repository } from 'typeorm';
import { QueryFailedError } from 'typeorm';
import * as path from 'path';
import * as fs from 'fs/promises';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const AdmZip = require('adm-zip') as new (path: string) => { extractAllTo: (path: string, overwrite: boolean) => void };

import { Project } from '../../database/entities/project.entity';
import { ProjectEnvVar } from '../../database/entities/project-env-var.entity';
import { Domain } from '../../database/entities/domain.entity';
import { Admin } from '../../database/entities/admin.entity';
import { DockerService } from '../docker/docker.service';
import {
  PORT_MIN,
  MAX_MEMORY_MB,
  MAX_CPU,
  DEFAULT_MEMORY_MB,
  DEFAULT_CPU,
  TRAEFIK_NETWORK,
} from '../../common/constants';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import {
  findProjectRoot,
  detectProject,
  ensureDockerfile,
} from './dockerfile-generator';

const BUILD_DIR = process.env.BUILD_DIR || '/app/builds';

@Injectable()
export class ProjectsService {
  constructor(
    @InjectRepository(Project)
    private readonly projectRepo: Repository<Project>,
    @InjectRepository(ProjectEnvVar)
    private readonly envVarRepo: Repository<ProjectEnvVar>,
    @InjectRepository(Domain)
    private readonly domainRepo: Repository<Domain>,
    @InjectQueue('project-build')
    private readonly buildQueue: Queue,
    private readonly dockerService: DockerService,
  ) {}

  private slugFromName(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  async create(admin: Admin, dto: CreateProjectDto, skipBuild = false): Promise<Project> {
    const baseSlug = this.slugFromName(dto.name);
    if (!baseSlug || baseSlug.length < 2) {
      throw new BadRequestException(
        'Project name must have at least 2 letters or numbers (e.g. "My App", "bolt3")',
      );
    }
    if (baseSlug.length > 61) {
      throw new BadRequestException('Project name is too long');
    }
    let slug = `project-${baseSlug}`;
    let suffix = 0;
    while (await this.projectRepo.findOne({ where: { slug } })) {
      slug = `project-${baseSlug}-${++suffix}`;
    }

    const internalPort = dto.internalPort ?? 80;
    const memoryMb = Math.min(dto.memoryLimitMb ?? DEFAULT_MEMORY_MB, MAX_MEMORY_MB);
    const cpu = Math.min(dto.cpuLimit ?? DEFAULT_CPU, MAX_CPU);

    const project = this.projectRepo.create({
      adminId: admin.id,
      name: dto.name,
      slug,
      description: dto.description,
      sourceType: dto.sourceType || 'zip',
      sourceUrl: dto.sourceUrl,
      dockerfilePath: dto.dockerfilePath || 'Dockerfile',
      buildContext: dto.buildContext || '.',
      internalPort,
      memoryLimitMb: memoryMb,
      cpuLimit: cpu,
      status: 'pending',
    });
    await this.projectRepo.save(project);

    if (dto.envVars?.length) {
      await this.envVarRepo.save(
        dto.envVars.map(({ key, value, isSecret }) => ({
          projectId: project.id,
          key,
          value,
          isSecret: isSecret ?? false,
        })),
      );
    }

    if (dto.domains?.length) {
      await this.domainRepo.save(
        dto.domains.map((d, i) => ({
          projectId: project.id,
          domain: typeof d === 'string' ? d : d.domain,
          type: (typeof d === 'object' && d.type) || 'domain',
          isPrimary: i === 0,
        })),
      );
    }

    if (!skipBuild) {
      const buildContextPath = dto.buildContextPath || `${BUILD_DIR}/${project.slug}`;
      await this.buildQueue.add('build', {
        projectId: project.id,
        buildContextPath,
      });
      await this.projectRepo.update(project.id, { status: 'building' });
    }
    return this.findOne(admin, project.id);
  }

  async createFromUpload(
    admin: Admin,
    file: Express.Multer.File,
    dto: CreateProjectDto,
  ): Promise<Project> {
    if (!file?.buffer && !file?.path) {
      throw new BadRequestException('No file uploaded');
    }
    try {
      return await this.createFromUploadInternal(admin, file, dto);
    } catch (err) {
      if (err instanceof QueryFailedError && err.message?.includes('Duplicate entry')) {
        const match = err.message.match(/Duplicate entry '([^']+)'/);
        const domain = match ? match[1] : 'this domain';
        throw new BadRequestException(
          `Domain "${domain}" is already assigned to another project. Choose a different domain or remove it from the existing project.`,
        );
      }
      throw err;
    }
  }

  private async createFromUploadInternal(
    admin: Admin,
    file: Express.Multer.File,
    dto: CreateProjectDto,
  ): Promise<Project> {
    const project = await this.create(admin, { ...dto, sourceType: 'zip' }, true);
    const buildDir = `${BUILD_DIR}/${project.slug}`;
    await fs.mkdir(buildDir, { recursive: true });
    let zipPath: string;
    if (file.path) {
      zipPath = file.path;
    } else {
      zipPath = path.join(buildDir, 'upload.zip');
      await fs.writeFile(zipPath, file.buffer);
    }
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(buildDir, true);
    if (!file.path) await fs.unlink(zipPath).catch(() => {});

    // Find project root (handles ZIP with single top-level folder)
    const projectRoot = await findProjectRoot(buildDir);
    const info = await detectProject(projectRoot);
    await ensureDockerfile(info);

    // Update project with detected port for container
    await this.projectRepo.update(project.id, {
      internalPort: info.internalPort,
      buildContext: path.relative(buildDir, projectRoot) || '.',
    });

    await this.buildQueue.add('build', {
      projectId: project.id,
      buildContextPath: projectRoot,
    });
    await this.projectRepo.update(project.id, { status: 'building' });
    return this.findOne(admin, project.id);
  }

  async findAll(admin: Admin): Promise<Project[]> {
    return this.projectRepo.find({
      where: { adminId: admin.id, status: Not('deleted') },
      relations: ['domains', 'envVars'],
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(admin: Admin, id: number): Promise<Project> {
    const project = await this.projectRepo.findOne({
      where: { id, adminId: admin.id },
      relations: ['domains', 'envVars'],
    });
    if (!project) throw new NotFoundException('Project not found');
    // Sync from Docker if building but container exists (fixes UI/DB drift)
    if (project.status === 'building' && !project.containerId) {
      const containerId = await this.dockerService.findContainerByName(project.slug);
      if (containerId) {
        const state = await this.dockerService.getContainerState(containerId);
        await this.projectRepo.update(id, {
          containerId,
          imageName: project.imageName || `hosting-${project.slug}`,
          status: state === 'running' ? 'running' : 'stopped',
          errorMessage: null,
        });
        const updated = await this.projectRepo.findOne({
          where: { id, adminId: admin.id },
          relations: ['domains', 'envVars'],
        });
        return updated ?? project;
      }
    }
    return project;
  }

  async update(admin: Admin, id: number, dto: UpdateProjectDto): Promise<Project> {
    const project = await this.findOne(admin, id);
    if (dto.memoryLimitMb != null)
      project.memoryLimitMb = Math.min(dto.memoryLimitMb, MAX_MEMORY_MB);
    if (dto.cpuLimit != null) project.cpuLimit = Math.min(dto.cpuLimit, MAX_CPU);
    if (dto.description != null) project.description = dto.description;
    if (dto.envVars) {
      await this.envVarRepo.delete({ projectId: id });
      if (dto.envVars.length) {
        await this.envVarRepo.save(
          dto.envVars.map(({ key, value, isSecret }) => ({
            projectId: id,
            key,
            value,
            isSecret: isSecret ?? false,
          })),
        );
      }
    }
    await this.projectRepo.save(project);
    return this.findOne(admin, id);
  }

  async start(admin: Admin, id: number): Promise<{ message: string }> {
    const project = await this.findOne(admin, id);
    let containerId = project.containerId;
    if (!containerId) {
      containerId = await this.dockerService.findContainerByName(project.slug);
      if (containerId) {
        await this.projectRepo.update(id, { containerId, imageName: project.imageName || `hosting-${project.slug}` });
      } else {
        throw new BadRequestException('Container not created yet');
      }
    }
    await this.dockerService.startContainer(containerId);
    await this.projectRepo.update(id, { status: 'running', errorMessage: null });
    return { message: 'Container started' };
  }

  async stop(admin: Admin, id: number): Promise<{ message: string }> {
    const project = await this.findOne(admin, id);
    let containerId = project.containerId;
    if (!containerId) {
      containerId = await this.dockerService.findContainerByName(project.slug);
      if (containerId) {
        await this.projectRepo.update(id, { containerId, imageName: project.imageName || `hosting-${project.slug}` });
      } else {
        throw new BadRequestException('Container not created yet');
      }
    }
    await this.dockerService.stopContainer(containerId);
    await this.projectRepo.update(id, { status: 'stopped' });
    return { message: 'Container stopped' };
  }

  async restart(admin: Admin, id: number): Promise<{ message: string }> {
    const project = await this.findOne(admin, id);
    let containerId = project.containerId;
    if (!containerId) {
      containerId = await this.dockerService.findContainerByName(project.slug);
      if (containerId) {
        await this.projectRepo.update(id, { containerId, imageName: project.imageName || `hosting-${project.slug}` });
      } else {
        throw new BadRequestException('Container not created yet');
      }
    }
    await this.dockerService.restartContainer(containerId);
    await this.projectRepo.update(id, { status: 'running', errorMessage: null });
    return { message: 'Container restarted' };
  }

  async remove(admin: Admin, id: number): Promise<{ message: string }> {
    const project = await this.findOne(admin, id);
    if (project.containerId) {
      try {
        await this.dockerService.removeContainer(project.containerId);
      } catch (e) {
        console.warn('Container remove error:', e);
      }
    }
    if (project.imageName) {
      try {
        await this.dockerService.removeImage(project.imageName, project.imageTag);
      } catch {
        // ignore
      }
    }
    const dataVolumeName = `hosting-data-${project.slug}`;
    try {
      await this.dockerService.removeVolume(dataVolumeName);
    } catch {
      // ignore (volume may not exist for older projects)
    }
    await this.projectRepo.update(id, { status: 'deleted', containerId: null });
    return { message: 'Project removed' };
  }

  async getEnvVars(admin: Admin, id: number): Promise<ProjectEnvVar[]> {
    await this.findOne(admin, id);
    return this.envVarRepo.find({
      where: { projectId: id },
      order: { key: 'ASC' },
    });
  }
}
