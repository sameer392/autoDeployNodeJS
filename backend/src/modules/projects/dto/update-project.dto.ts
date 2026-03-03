import {
  IsString,
  IsOptional,
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

export class UpdateProjectDto {
  @IsString()
  @IsOptional()
  description?: string;

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

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EnvVarDto)
  @IsOptional()
  envVars?: EnvVarDto[];
}
