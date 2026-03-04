import { Controller, Get, UseGuards } from '@nestjs/common';
import { ServerStatsService, ServerStatsPayload } from './server.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('server')
@UseGuards(JwtAuthGuard)
export class ServerController {
  constructor(private readonly serverStatsService: ServerStatsService) {}

  @Get('stats')
  getStats(): Promise<ServerStatsPayload> {
    return this.serverStatsService.getServerStats();
  }
}
