import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Project } from '../../database/entities/project.entity';
import { DockerService } from '../docker/docker.service';

export interface ServerStatsPayload {
  byProject: Record<
    string,
    { name: string; cpu: number; memoryMb: number }
  >;
  other: { cpu: number; memoryMb: number };
  total: { cpu: number; memoryMb: number };
}

@Injectable()
export class ServerStatsService {
  constructor(
    @InjectRepository(Project)
    private readonly projectRepo: Repository<Project>,
    private readonly dockerService: DockerService,
  ) {}

  async getServerStats(): Promise<ServerStatsPayload> {
    const projects = await this.projectRepo.find({
      select: ['id', 'slug', 'name'],
      where: [{ status: 'running' }, { status: 'building' }],
    });
    const slugToName = new Map(projects.map((p) => [p.slug, p.name]));
    const projectSlugs = new Set(projects.map((p) => p.slug));

    const containers = await this.dockerService.listAllRunningContainers();
    const allStats = await Promise.all(
      containers.map(async (c) => {
        const stats = await this.dockerService.getContainerStats(c.id);
        return { ...c, stats };
      }),
    );

    const byProject: Record<string, { name: string; cpu: number; memoryMb: number }> = {};
    let otherCpu = 0;
    let otherMemoryMb = 0;

    for (const { name, stats } of allStats) {
      if (!stats) continue;
      const memoryMb = stats.memory / (1024 * 1024);

      let assigned = false;
      for (const slug of projectSlugs) {
        if (name === slug || name.startsWith(`supabase-${slug}-`)) {
          if (!byProject[slug]) {
            byProject[slug] = {
              name: slugToName.get(slug) || slug,
              cpu: 0,
              memoryMb: 0,
            };
          }
          byProject[slug].cpu += stats.cpu;
          byProject[slug].memoryMb += memoryMb;
          assigned = true;
          break;
        }
      }
      if (!assigned) {
        otherCpu += stats.cpu;
        otherMemoryMb += memoryMb;
      }
    }

    let totalCpu = otherCpu;
    let totalMemoryMb = otherMemoryMb;
    for (const p of Object.values(byProject)) {
      totalCpu += p.cpu;
      totalMemoryMb += p.memoryMb;
    }

    return {
      byProject,
      other: { cpu: otherCpu, memoryMb: otherMemoryMb },
      total: { cpu: totalCpu, memoryMb: totalMemoryMb },
    };
  }
}
