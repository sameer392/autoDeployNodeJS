import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Domain } from '../../database/entities/domain.entity';
import { Project } from '../../database/entities/project.entity';
import { Admin } from '../../database/entities/admin.entity';
import { CreateDomainDto } from './dto/create-domain.dto';
import { DOMAIN_REGEX } from '../../common/constants';

@Injectable()
export class DomainsService {
  constructor(
    @InjectRepository(Domain)
    private readonly domainRepo: Repository<Domain>,
    @InjectRepository(Project)
    private readonly projectRepo: Repository<Project>,
  ) {}

  private async ensureProjectOwnership(adminId: number, projectId: number): Promise<void> {
    const project = await this.projectRepo.findOne({
      where: { id: projectId, adminId },
    });
    if (!project) throw new NotFoundException('Project not found');
  }

  private parseDomainType(domain: string): 'domain' | 'subdomain' | 'wildcard' {
    if (domain.startsWith('*.')) return 'wildcard';
    const parts = domain.split('.');
    if (parts.length > 2) return 'subdomain';
    return 'domain';
  }

  async create(admin: Admin, projectId: number, dto: CreateDomainDto): Promise<Domain> {
    await this.ensureProjectOwnership(admin.id, projectId);
    const domainStr = dto.domain.toLowerCase().trim();
    if (!DOMAIN_REGEX.test(domainStr) && !domainStr.startsWith('*.')) {
      throw new BadRequestException('Invalid domain format');
    }
    const existing = await this.domainRepo.findOne({ where: { domain: domainStr } });
    if (existing) throw new BadRequestException('Domain already in use');
    const type = dto.type || this.parseDomainType(domainStr);
    const domain = this.domainRepo.create({
      projectId,
      domain: domainStr,
      type,
      isPrimary: dto.isPrimary ?? false,
      sslEnabled: dto.sslEnabled ?? true,
    });
    return this.domainRepo.save(domain);
  }

  async findByProject(admin: Admin, projectId: number): Promise<Domain[]> {
    await this.ensureProjectOwnership(admin.id, projectId);
    return this.domainRepo.find({
      where: { projectId },
      order: { isPrimary: 'DESC', createdAt: 'ASC' },
    });
  }

  async remove(admin: Admin, projectId: number, domainId: number): Promise<void> {
    await this.ensureProjectOwnership(admin.id, projectId);
    await this.domainRepo.delete({ id: domainId, projectId });
  }
}
