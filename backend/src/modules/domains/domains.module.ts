import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DomainsController } from './domains.controller';
import { DomainsService } from './domains.service';
import { Domain } from '../../database/entities/domain.entity';
import { Project } from '../../database/entities/project.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Domain, Project])],
  controllers: [DomainsController],
  providers: [DomainsService],
  exports: [DomainsService],
})
export class DomainsModule {}
