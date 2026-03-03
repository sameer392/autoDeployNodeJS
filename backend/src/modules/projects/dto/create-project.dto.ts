import {
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  Min,
  Max,
  IsArray,
  ValidateNested,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';

class EnvVarDto {
  @IsString()
  key: string;

  @IsString()
  value: string;

  @IsBoolean()
  @IsOptional()
  isSecret?: boolean;
}

class DomainDto {
  @IsString()
  domain: string;

  @IsEnum(['domain', 'subdomain', 'wildcard'])
  @IsOptional()
  type?: 'domain' | 'subdomain' | 'wildcard';
}

export class CreateProjectDto {
  @IsString()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(['zip', 'git'])
  @IsOptional()
  sourceType?: 'zip' | 'git';

  @IsString()
  @IsOptional()
  sourceUrl?: string;

  @IsString()
  @IsOptional()
  dockerfilePath?: string;

  @IsString()
  @IsOptional()
  buildContext?: string;

  @IsString()
  @IsOptional()
  buildContextPath?: string;

  @IsNumber()
  @Min(128)
  @Max(4096)
  @IsOptional()
  memoryLimitMb?: number;

  @IsNumber()
  @Min(0.25)
  @Max(4)
  @IsOptional()
  cpuLimit?: number;

  @IsNumber()
  @Min(1)
  @Max(65535)
  @IsOptional()
  internalPort?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EnvVarDto)
  @IsOptional()
  envVars?: EnvVarDto[];

  @IsArray()
  @IsOptional()
  domains?: (string | DomainDto)[];
}
