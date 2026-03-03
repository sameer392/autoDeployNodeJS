import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { DomainsService } from './domains.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentAdmin } from '../auth/decorators/current-admin.decorator';
import { Admin } from '../../database/entities/admin.entity';
import { CreateDomainDto } from './dto/create-domain.dto';

@Controller('projects/:projectId/domains')
@UseGuards(JwtAuthGuard)
export class DomainsController {
  constructor(private readonly domainsService: DomainsService) {}

  @Post()
  create(
    @CurrentAdmin() admin: Admin,
    @Param('projectId', ParseIntPipe) projectId: number,
    @Body() dto: CreateDomainDto,
  ) {
    return this.domainsService.create(admin, projectId, dto);
  }

  @Get()
  findByProject(
    @CurrentAdmin() admin: Admin,
    @Param('projectId', ParseIntPipe) projectId: number,
  ) {
    return this.domainsService.findByProject(admin, projectId);
  }

  @Delete(':domainId')
  remove(
    @CurrentAdmin() admin: Admin,
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('domainId', ParseIntPipe) domainId: number,
  ) {
    return this.domainsService.remove(admin, projectId, domainId);
  }
}
