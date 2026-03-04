import { Module, Global } from '@nestjs/common';
import { DockerService } from './docker.service';
import { DockerGateway } from './docker.gateway';
import { ResourceStatsModule } from '../resource-stats/resource-stats.module';

@Global()
@Module({
  imports: [ResourceStatsModule],
  providers: [DockerService, DockerGateway],
  exports: [DockerService],
})
export class DockerModule {}
