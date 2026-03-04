import { Injectable, Logger } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Docker = require('dockerode');
import { Readable } from 'stream';
import * as path from 'path';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const archiver = require('archiver') as (format: string, options?: object) => { directory: (path: string, opts?: object | boolean) => void; finalize: () => void };
import {
  PORT_MIN,
  PORT_MAX,
  MAX_MEMORY_MB,
  MAX_CPU,
  TRAEFIK_NETWORK,
} from '../../common/constants';

export interface ContainerCreateOptions {
  image: string;
  name: string;
  internalPort: number;
  memoryLimitMb: number;
  cpuLimit: number;
  env?: Record<string, string>;
  domains?: string[];
  traefikNetwork?: string;
  /** Persistent data volume name (mounts at /data). Survives rebuilds until project delete. */
  dataVolumeName?: string;
}

export interface ContainerStats {
  id: string;
  name: string;
  cpu: number;
  memory: number;
  memoryLimit: number;
  memPct: number;
  netRx: number;
  netTx: number;
  blockRead: number;
  blockWrite: number;
  pids: number;
}

@Injectable()
export class DockerService {
  private readonly logger = new Logger(DockerService.name);
  private docker: any;

  constructor() {
    const socketPath = process.env.DOCKER_SOCKET_PATH || '/var/run/docker.sock';
    this.docker = new Docker({ socketPath });
  }

  async getNextAvailablePort(usedPorts?: number[]): Promise<number> {
    const used = new Set(usedPorts || []);
    for (let p = PORT_MIN; p <= PORT_MAX; p++) {
      if (!used.has(p)) return p;
    }
    throw new Error('No available ports');
  }

  async buildImage(
    contextPath: string,
    imageName: string,
    imageTag: string,
    dockerfilePath: string,
    onProgress?: (msg: string) => void,
  ): Promise<void> {
    const tarStream = archiver('tar', { gzip: false });
    tarStream.directory(contextPath, false);
    tarStream.finalize();

    return new Promise((resolve, reject) => {
      this.docker.buildImage(
        tarStream as unknown as NodeJS.ReadableStream,
        {
          t: `${imageName}:${imageTag}`,
          dockerfile: path.basename(dockerfilePath),
          forcerm: true,
        },
        (err: Error | null, stream: NodeJS.ReadableStream | undefined) => {
          if (err) return reject(err);
          if (!stream) return reject(new Error('No build stream'));

          this.docker.modem.followProgress(
            stream,
            (err: Error | undefined) => {
              if (err) reject(err);
              else resolve();
            },
            (event: { stream?: string; status?: string }) => {
              const msg = event.stream || event.status || JSON.stringify(event);
              onProgress?.(msg);
            },
          );
        },
      );
    });
  }

  async createContainer(opts: ContainerCreateOptions): Promise<string> {
    const memoryBytes = Math.min(opts.memoryLimitMb, MAX_MEMORY_MB) * 1024 * 1024;
    const nanoCpus = Math.min(Math.floor(opts.cpuLimit * 1e9), MAX_CPU * 1e9);

    const env = opts.env
      ? Object.entries(opts.env).map(([k, v]) => `${k}=${v}`)
      : [];

    const labels: Record<string, string> = {
      'hosting.panel': 'true',
      'traefik.enable': 'true',
      [`traefik.http.services.${opts.name}.loadbalancer.server.port`]: String(
        opts.internalPort,
      ),
    };

    if (opts.domains?.length) {
      const rule = opts.domains
        .map((d) => `Host(\`${d}\`)`)
        .join(' || ');
      labels['traefik.http.routers.' + opts.name + '.rule'] = rule;
      labels['traefik.http.routers.' + opts.name + '.entrypoints'] = 'websecure,web';
      labels['traefik.http.routers.' + opts.name + '.service'] = opts.name;
      labels['traefik.http.routers.' + opts.name + '.tls'] = 'true';
      labels['traefik.http.routers.' + opts.name + '.tls.certresolver'] = 'letsencrypt';
    }

    const hostConfig: Record<string, unknown> = {
      Memory: memoryBytes,
      NanoCpus: nanoCpus,
      SecurityOpt: ['no-new-privileges:true'],
      NetworkMode: opts.traefikNetwork || TRAEFIK_NETWORK,
      RestartPolicy: { Name: 'unless-stopped' },
    };
    if (opts.dataVolumeName) {
      hostConfig.Binds = [`${opts.dataVolumeName}:/data`];
    }

    const createOpts = {
      Image: opts.image,
      name: opts.name,
      Env: env,
      Labels: labels,
      HostConfig: hostConfig,
      ExposedPorts: {
        [`${opts.internalPort}/tcp`]: {},
      },
    };

    const container = await this.docker.createContainer(createOpts);
    return container.id;
  }

  async startContainer(containerId: string): Promise<void> {
    const container = this.docker.getContainer(containerId);
    try {
      await container.start();
    } catch (err: any) {
      if (err?.statusCode === 304 || err?.message?.includes('already started')) {
        return; // Already running
      }
      throw err;
    }
  }

  /**
   * List all containers related to a project: app (file execution) + Supabase (DB, Kong, etc.).
   * Returns { id, name, role } for chart labeling.
   */
  async listProjectContainers(projectSlug: string): Promise<Array<{ id: string; name: string; role: string }>> {
    const result: Array<{ id: string; name: string; role: string }> = [];
    const list = await this.docker.listContainers({ all: false });
    const prefix = `supabase-${projectSlug}-`;

    for (const c of list || []) {
      const names = (c.Names || []) as string[];
      const name = names[0]?.replace(/^\//, '') || '';
      if (name === projectSlug) {
        result.push({ id: c.Id, name, role: 'App (files)' });
      } else if (name.startsWith(prefix)) {
        const role = name.slice(prefix.length);
        result.push({ id: c.Id, name, role: role.charAt(0).toUpperCase() + role.slice(1) });
      }
    }
    return result;
  }

  /** Find container by exact name (returns id or null). */
  async findContainerByName(name: string): Promise<string | null> {
    const list = await this.docker.listContainers({
      all: true,
      filters: { name: [name] },
    });
    if (!list?.length) return null;
    const target = name.startsWith('/') ? name : `/${name}`;
    const match = list.find((c: any) =>
      (c.Names || []).some((n: string) => n === target || n === name),
    );
    return match?.Id ?? null;
  }

  async stopContainer(containerId: string): Promise<void> {
    const container = this.docker.getContainer(containerId);
    await container.stop({ t: 30 });
  }

  async restartContainer(containerId: string): Promise<void> {
    const container = this.docker.getContainer(containerId);
    await container.restart({ t: 30 });
  }

  async removeContainer(containerId: string): Promise<void> {
    const container = this.docker.getContainer(containerId);
    try {
      await container.stop({ t: 10 });
    } catch {
      // may already be stopped
    }
    await container.remove({ force: true });
  }

  async getContainerStats(containerId: string): Promise<ContainerStats | null> {
    try {
      const container = this.docker.getContainer(containerId);
      const stats = await container.stats({ stream: false });
      const raw = stats as Record<string, unknown> & { networks?: Record<string, { rx_bytes: number; tx_bytes: number }> };
      const memUsage = (raw as unknown as { memory_stats: { usage: number; limit: number } }).memory_stats || {};
      const cpuStats = (raw as unknown as { cpu_stats: { cpu_usage: { total_usage: number }; system_cpu_usage: number }; precpu_stats: { cpu_usage: { total_usage: number }; system_cpu_usage: number } }).cpu_stats;
      const memLimit = memUsage.limit || 1;
      const memUsed = memUsage.usage || 0;
      const memPct = memLimit ? (memUsed / memLimit) * 100 : 0;

      let cpuPct = 0;
      if (cpuStats?.cpu_usage?.total_usage !== undefined && (raw as any).precpu_stats) {
        const precpu = (raw as any).precpu_stats;
        const cpuDelta = cpuStats.cpu_usage.total_usage - (precpu.cpu_usage?.total_usage || 0);
        const sysDelta = cpuStats.system_cpu_usage - (precpu.system_cpu_usage || 0);
        if (sysDelta > 0) cpuPct = (cpuDelta / sysDelta) * 100;
      }

      let netRx = 0, netTx = 0;
      const networks = (raw as any).networks;
      if (networks) {
        for (const n of Object.values(networks) as any[]) {
          netRx += n.rx_bytes || 0;
          netTx += n.tx_bytes || 0;
        }
      }

      return {
        id: containerId,
        name: (raw as any).Name?.replace(/^\//, '') || containerId.slice(0, 12),
        cpu: cpuPct,
        memory: memUsed,
        memoryLimit: memLimit,
        memPct,
        netRx,
        netTx,
        blockRead: 0,
        blockWrite: 0,
        pids: (raw as any).pids_stats?.current || 0,
      };
    } catch {
      return null;
    }
  }

  async getContainerLogs(
    containerId: string,
    options?: { tail?: number; follow?: boolean },
  ): Promise<Readable> {
    const container = this.docker.getContainer(containerId);
    const logStream = await container.logs({
      stdout: true,
      stderr: true,
      tail: options?.tail ?? 100,
      follow: options?.follow ?? false,
    });
    return logStream as Readable;
  }

  async containerExists(containerId: string): Promise<boolean> {
    try {
      const container = this.docker.getContainer(containerId);
      await container.inspect();
      return true;
    } catch {
      return false;
    }
  }

  async getContainerState(containerId: string): Promise<string | null> {
    try {
      const container = this.docker.getContainer(containerId);
      const inspect = await container.inspect();
      return inspect.State?.Status || null;
    } catch {
      return null;
    }
  }

  async removeImage(imageName: string, tag?: string): Promise<void> {
    const img = tag ? `${imageName}:${tag}` : imageName;
    try {
      const image = this.docker.getImage(img);
      await image.remove();
    } catch (e) {
      this.logger.warn(`Could not remove image ${img}: ${e}`);
    }
  }

  async removeVolume(volumeName: string): Promise<void> {
    try {
      const volume = this.docker.getVolume(volumeName);
      await volume.remove();
    } catch (e) {
      this.logger.warn(`Could not remove volume ${volumeName}: ${e}`);
    }
  }
}
