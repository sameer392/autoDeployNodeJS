import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Project } from '../../database/entities/project.entity';
import { DockerService } from '../docker/docker.service';
import { HostMetricsService } from './host-metrics.service';

export interface ServerStatsPayload {
  byProject: Record<
    string,
    { name: string; cpu: number; memoryMb: number }
  >;
  /** Other Docker containers (MySQL, Redis, Traefik, backend, etc.) */
  otherDocker: { cpu: number; memoryMb: number };
  /** Non-Docker host processes (OS, SSH, kernel, etc.) */
  others: { cpu: number; memoryMb: number };
  /** Host total (matches top / system) */
  total: { cpu: number; memoryMb: number };
}

@Injectable()
export class ServerStatsService {
  constructor(
    @InjectRepository(Project)
    private readonly projectRepo: Repository<Project>,
    private readonly dockerService: DockerService,
    private readonly hostMetricsService: HostMetricsService,
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
    let otherDockerCpu = 0;
    let otherDockerMemoryMb = 0;

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
        otherDockerCpu += stats.cpu;
        otherDockerMemoryMb += memoryMb;
      }
    }

    const dockerTotalCpu = otherDockerCpu + Object.values(byProject).reduce((s, p) => s + p.cpu, 0);
    const dockerTotalMemoryMb = otherDockerMemoryMb + Object.values(byProject).reduce((s, p) => s + p.memoryMb, 0);

    const hostMetrics = await this.hostMetricsService.getHostMetrics();
    let othersCpu = 0;
    let othersMemoryMb = 0;
    let totalCpu = dockerTotalCpu;
    let totalMemoryMb = dockerTotalMemoryMb;

    if (hostMetrics) {
      totalMemoryMb = hostMetrics.memoryUsedMb;
      othersMemoryMb = Math.max(0, hostMetrics.memoryUsedMb - dockerTotalMemoryMb);
      // Use max(host, docker) for CPU so Total >= sum(components); avoids timing mismatch
      // when host is sampled 300ms after Docker. Others = Total - Docker.
      totalCpu = Math.max(hostMetrics.cpuPct, dockerTotalCpu);
      othersCpu = Math.max(0, totalCpu - dockerTotalCpu);
    }

    return {
      byProject,
      otherDocker: { cpu: otherDockerCpu, memoryMb: otherDockerMemoryMb },
      others: { cpu: othersCpu, memoryMb: othersMemoryMb },
      total: { cpu: totalCpu, memoryMb: totalMemoryMb },
    };
  }
}
