import { IsString, IsOptional, IsBoolean, IsEnum } from 'class-validator';

export class CreateDomainDto {
  @IsString()
  domain: string;

  @IsEnum(['domain', 'subdomain', 'wildcard'])
  @IsOptional()
  type?: 'domain' | 'subdomain' | 'wildcard';

  @IsBoolean()
  @IsOptional()
  isPrimary?: boolean;

  @IsBoolean()
  @IsOptional()
  sslEnabled?: boolean;
}
