import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server } from 'socket.io';
import { DockerService } from './docker.service';

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/docker',
})
export class DockerGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(DockerGateway.name);
  private readonly subscriptions = new Map<string, Set<string>>();
  private readonly projectSubscriptions = new Map<string, NodeJS.Timeout>();

  constructor(private readonly dockerService: DockerService) {}

  handleConnection(client: any) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: any) {
    this.subscriptions.delete(client.id);
    const interval = this.projectSubscriptions.get(client.id);
    if (interval) {
      clearInterval(interval);
      this.projectSubscriptions.delete(client.id);
    }
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('stats:subscribe')
  async handleStatsSubscribe(client: any, payload: { containerId: string }) {
    const { containerId } = payload;
    if (!containerId) return;

    if (!this.subscriptions.has(client.id)) {
      this.subscriptions.set(client.id, new Set());
    }
    this.subscriptions.get(client.id)!.add(containerId);

    const interval = setInterval(async () => {
      if (!this.subscriptions.get(client.id)?.has(containerId)) {
        clearInterval(interval);
        return;
      }
      const stats = await this.dockerService.getContainerStats(containerId);
      if (stats) {
        client.emit('stats', stats);
      }
    }, 2000);
  }

  @SubscribeMessage('stats:unsubscribe')
  handleStatsUnsubscribe(client: any, payload: { containerId: string }) {
    this.subscriptions.get(client.id)?.delete(payload.containerId);
  }

  @SubscribeMessage('stats:subscribeProject')
  async handleStatsSubscribeProject(client: any, payload: { projectSlug: string }) {
    const { projectSlug } = payload;
    if (!projectSlug) return;

    const existing = this.projectSubscriptions.get(client.id);
    if (existing) clearInterval(existing);

    const containers = await this.dockerService.listProjectContainers(projectSlug);
    if (!containers.length) {
      client.emit('projectStats', { containers: {}, totals: { cpu: 0, memPct: 0, memoryMb: 0 }, meta: { containers: [] } });
      return;
    }

    const interval = setInterval(async () => {
      const allStats: Record<string, { name: string; role: string; cpu: number; memPct: number; memoryMb: number }> = {};
      let totalCpu = 0;
      let totalMemUsed = 0;
      let totalMemLimit = 0;

      for (const c of containers) {
        const stats = await this.dockerService.getContainerStats(c.id);
        if (stats) {
          const memoryMb = stats.memory / (1024 * 1024);
          allStats[c.id] = { name: stats.name, role: c.role, cpu: stats.cpu, memPct: stats.memPct, memoryMb };
          totalCpu += stats.cpu;
          totalMemUsed += stats.memory;
          totalMemLimit += stats.memoryLimit;
        }
      }

      const totalMemPct = totalMemLimit > 0 ? (totalMemUsed / totalMemLimit) * 100 : 0;
      const totalMemoryMb = totalMemUsed / (1024 * 1024);
      client.emit('projectStats', {
        containers: allStats,
        totals: { cpu: totalCpu, memPct: totalMemPct, memoryMb: totalMemoryMb },
        meta: { containers: containers.map((c) => ({ id: c.id, name: c.name, role: c.role })) },
      });
    }, 2000);

    this.projectSubscriptions.set(client.id, interval);
  }

  @SubscribeMessage('stats:unsubscribeProject')
  handleStatsUnsubscribeProject(client: any) {
    const interval = this.projectSubscriptions.get(client.id);
    if (interval) {
      clearInterval(interval);
      this.projectSubscriptions.delete(client.id);
    }
  }

  broadcastStats(containerId: string, stats: Record<string, unknown>) {
    this.server.emit('stats', { containerId, ...stats });
  }
}
