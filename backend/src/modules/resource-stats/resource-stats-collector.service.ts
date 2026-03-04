import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Project } from '../../database/entities/project.entity';
import { DockerService } from '../docker/docker.service';
import { ResourceStatsService } from './resource-stats.service';

/**
 * Background collector: persists resource stats to resource_stats table every 60 seconds
 * for all projects with running containers. This ensures Per Minute/Hour/Day views
 * have data even when no one is viewing the project page in Live mode.
 */
@Injectable()
export class ResourceStatsCollectorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ResourceStatsCollectorService.name);
  private intervalId: NodeJS.Timeout | null = null;

  constructor(
    @InjectRepository(Project)
    private readonly projectRepo: Repository<Project>,
    private readonly dockerService: DockerService,
    private readonly resourceStatsService: ResourceStatsService,
  ) {}

  onModuleInit() {
    this.intervalId = setInterval(() => this.collectAll(), 60000);
    this.logger.log('Resource stats background collector started (every 60s)');
  }

  onModuleDestroy() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private async collectAll(): Promise<void> {
    try {
      const projects = await this.projectRepo.find({
        select: ['id', 'slug'],
        where: [{ status: 'running' }, { status: 'building' }],
      });
      for (const project of projects) {
        try {
          const containers = await this.dockerService.listProjectContainers(project.slug);
          if (!containers.length) continue;
          const results = await Promise.all(
            containers.map((c) =>
              this.dockerService.getContainerStats(c.id).then((s) => ({ c, stats: s })),
            ),
          );
          const allStats: Record<
            string,
            { name: string; role: string; cpu: number; memPct: number; memoryMb: number }
          > = {};
          let totalCpu = 0;
          let totalMemUsed = 0;
          let totalMemLimit = 0;
          for (const { c, stats } of results) {
            if (stats) {
              const memoryMb = stats.memory / (1024 * 1024);
              allStats[c.id] = {
                name: stats.name,
                role: c.role,
                cpu: stats.cpu,
                memPct: stats.memPct,
                memoryMb,
              };
              totalCpu += stats.cpu;
              totalMemUsed += stats.memory;
              totalMemLimit += stats.memoryLimit;
            }
          }
          if (Object.keys(allStats).length > 0) {
            const totalMemPct =
              totalMemLimit > 0 ? (totalMemUsed / totalMemLimit) * 100 : 0;
            await this.resourceStatsService.record({
              projectId: project.id,
              containers: allStats,
              totals: { cpu: totalCpu, memPct: totalMemPct, memoryMb: totalMemUsed / (1024 * 1024) },
            });
          }
        } catch (err: unknown) {
          this.logger.warn(`Failed to collect stats for ${project.slug}: ${err}`);
        }
      }
      await this.resourceStatsService.cleanupOlderThan(7);
    } catch (err: unknown) {
      this.logger.warn('Stats collection error: ' + (err instanceof Error ? err.message : err));
    }
  }
}
