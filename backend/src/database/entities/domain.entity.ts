import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Project } from './project.entity';

export type DomainType = 'domain' | 'subdomain' | 'wildcard';
export type SslStatus = 'pending' | 'active' | 'failed' | 'disabled';

@Entity('domains')
export class Domain {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id: number;

  @Column({ type: 'int', unsigned: true, name: 'project_id' })
  projectId: number;

  @Column({ type: 'varchar', length: 255 })
  domain: string;

  @Column({ type: 'enum', enum: ['domain', 'subdomain', 'wildcard'], default: 'domain' })
  type: DomainType;

  @Column({ type: 'boolean', name: 'is_primary', default: false })
  isPrimary: boolean;

  @Column({ type: 'boolean', name: 'ssl_enabled', default: true })
  sslEnabled: boolean;

  @Column({
    type: 'enum',
    enum: ['pending', 'active', 'failed', 'disabled'],
    name: 'ssl_status',
    nullable: true,
    default: 'pending',
  })
  sslStatus: SslStatus | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => Project, (project) => project.domains, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project: Project;
}
