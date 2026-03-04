import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ResourceStats } from '../../database/entities/resource-stats.entity';
import { Project } from '../../database/entities/project.entity';

export type StatsInterval = 'minute' | 'hour' | 'day';

export interface RecordStatsInput {
  projectId: number;
  containers: Record<
    string,
    { name: string; role: string; cpu: number; memPct: number; memoryMb: number }
  >;
  totals: { cpu: number; memPct: number; memoryMb: number };
}

export interface AggregatedPoint {
  t: string;
  containers: Record<string, { cpu: number; memoryMb: number }>;
  totals: { cpu: number; memoryMb: number };
}

@Injectable()
export class ResourceStatsService {
  constructor(
    @InjectRepository(ResourceStats)
    private readonly statsRepo: Repository<ResourceStats>,
    @InjectRepository(Project)
    private readonly projectRepo: Repository<Project>,
  ) {}

  async record(input: RecordStatsInput): Promise<void> {
    const recordedAt = new Date();
    const rows = Object.entries(input.containers).map(([containerId, c]) => ({
      projectId: input.projectId,
      containerId,
      role: c.role,
      cpu: c.cpu,
      memoryMb: c.memoryMb,
      recordedAt,
    }));
    if (rows.length > 0) {
      await this.statsRepo.insert(rows);
    }
  }

  async findProjectIdBySlug(slug: string): Promise<number | null> {
    const p = await this.projectRepo.findOne({ where: { slug }, select: ['id'] });
    return p?.id ?? null;
  }

  async getAggregated(
    projectId: number,
    from: Date,
    to: Date,
    interval: StatsInterval,
  ): Promise<{ data: AggregatedPoint[]; roles: string[] }> {
    const formatMap: Record<StatsInterval, string> = {
      minute: '%Y-%m-%d %H:%i:00',
      hour: '%Y-%m-%d %H:00:00',
      day: '%Y-%m-%d 00:00:00',
    };
    const fmt = formatMap[interval];

    const fmtEscaped = fmt.replace(/'/g, "''");
    const bucketExpr = `DATE_FORMAT(s.recorded_at, '${fmtEscaped}')`;
    const rows = await this.statsRepo
      .createQueryBuilder('s')
      .select(bucketExpr, 'bucket')
      .addSelect('s.role', 'role')
      .addSelect('AVG(s.cpu)', 'avgCpu')
      .addSelect('AVG(s.memory_mb)', 'avgMemoryMb')
      .where('s.project_id = :projectId', { projectId })
      .andWhere('s.recorded_at BETWEEN :from AND :to', { from, to })
      .groupBy(bucketExpr)
      .addGroupBy('s.role')
      .orderBy('bucket', 'ASC')
      .getRawMany();

    const byBucket = new Map<
      string,
      { containers: Record<string, { cpu: number; memoryMb: number }>; totalCpu: number; totalMemoryMb: number }
    >();
    const rolesSet = new Set<string>();

    for (const r of rows) {
      const bucket = r.bucket as string;
      const role = r.role as string;
      const cpu = Number(r.avgCpu);
      const memoryMb = Number(r.avgMemoryMb);
      rolesSet.add(role);

      if (!byBucket.has(bucket)) {
        byBucket.set(bucket, { containers: {}, totalCpu: 0, totalMemoryMb: 0 });
      }
      const entry = byBucket.get(bucket)!;
      entry.containers[role] = { cpu, memoryMb };
      entry.totalCpu += cpu;
      entry.totalMemoryMb += memoryMb;
    }

    const data: AggregatedPoint[] = [];
    for (const [t, entry] of byBucket.entries()) {
      data.push({
        t,
        containers: entry.containers,
        totals: { cpu: entry.totalCpu, memoryMb: entry.totalMemoryMb },
      });
    }
    data.sort((a, b) => a.t.localeCompare(b.t));

    return { data, roles: Array.from(rolesSet).sort() };
  }

  async cleanupOlderThan(days: number): Promise<number> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const result = await this.statsRepo
      .createQueryBuilder()
      .delete()
      .where('recorded_at < :cutoff', { cutoff })
      .execute();
    return result.affected ?? 0;
  }
}
