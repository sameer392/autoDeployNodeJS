import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';

import { AuthModule } from './modules/auth/auth.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { DomainsModule } from './modules/domains/domains.module';
import { DockerModule } from './modules/docker/docker.module';
import { LogsModule } from './modules/logs/logs.module';

import { Admin } from './database/entities/admin.entity';
import { Project } from './database/entities/project.entity';
import { Domain } from './database/entities/domain.entity';
import { ProjectEnvVar } from './database/entities/project-env-var.entity';
import { Log } from './database/entities/log.entity';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '.env.local'],
    }),
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
      },
    }),
    TypeOrmModule.forRootAsync({
      useFactory: () => ({
        type: 'mysql',
        host: process.env.DATABASE_HOST || 'localhost',
        port: parseInt(process.env.DATABASE_PORT || '3306', 10),
        username: process.env.DATABASE_USER || 'hosting',
        password: process.env.DATABASE_PASSWORD || 'changeme',
        database: process.env.DATABASE_NAME || 'hosting_panel',
        entities: [Admin, Project, Domain, ProjectEnvVar, Log],
        synchronize: process.env.NODE_ENV === 'development',
        logging: process.env.NODE_ENV === 'development',
        charset: 'utf8mb4',
      }),
    }),
    AuthModule,
    ProjectsModule,
    DomainsModule,
    DockerModule,
    LogsModule,
  ],
})
export class AppModule {}
