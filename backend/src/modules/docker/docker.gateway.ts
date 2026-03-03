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

  constructor(private readonly dockerService: DockerService) {}

  handleConnection(client: any) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: any) {
    this.subscriptions.delete(client.id);
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

  broadcastStats(containerId: string, stats: Record<string, unknown>) {
    this.server.emit('stats', { containerId, ...stats });
  }
}
