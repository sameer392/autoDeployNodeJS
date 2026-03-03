import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail({ require_tld: false })
  email: string;

  @IsString()
  @MinLength(6)
  password: string;
}
