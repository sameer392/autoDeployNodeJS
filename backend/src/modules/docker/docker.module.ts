import { Module, Global } from '@nestjs/common';
import { DockerService } from './docker.service';
import { DockerGateway } from './docker.gateway';

@Global()
@Module({
  providers: [DockerService, DockerGateway],
  exports: [DockerService],
})
export class DockerModule {}
