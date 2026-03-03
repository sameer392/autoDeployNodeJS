import { Injectable, UnauthorizedException, OnModuleInit } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { Admin } from '../../database/entities/admin.entity';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

export interface JwtPayload {
  sub: number;
  email: string;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(Admin)
    private readonly adminRepo: Repository<Admin>,
    private readonly jwtService: JwtService,
  ) {}

  async validateAdmin(adminId: number): Promise<Admin | null> {
    const admin = await this.adminRepo.findOne({
      where: { id: adminId, isActive: true },
    });
    return admin ?? null;
  }

  async login(dto: LoginDto): Promise<{ accessToken: string; admin: Admin }> {
    const admin = await this.adminRepo.findOne({
      where: { email: dto.email.toLowerCase(), isActive: true },
    });
    if (!admin || !(await bcrypt.compare(dto.password, admin.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password');
    }
    await this.adminRepo.update(admin.id, {
      lastLoginAt: new Date(),
    });
    const accessToken = this.jwtService.sign({
      sub: admin.id,
      email: admin.email,
    } as JwtPayload);
    return { accessToken, admin };
  }

  async register(dto: RegisterDto): Promise<{ accessToken: string; admin: Admin }> {
    const existing = await this.adminRepo.findOne({
      where: { email: dto.email.toLowerCase() },
    });
    if (existing) {
      throw new UnauthorizedException('Email already registered');
    }
    const hash = await bcrypt.hash(dto.password, 10);
    const admin = this.adminRepo.create({
      email: dto.email.toLowerCase(),
      passwordHash: hash,
      name: dto.name || '',
    });
    await this.adminRepo.save(admin);
    const accessToken = this.jwtService.sign({
      sub: admin.id,
      email: admin.email,
    } as JwtPayload);
    return { accessToken, admin };
  }

  async seedDefaultAdmin(): Promise<void> {
    try {
      const count = await this.adminRepo.count();
      if (count > 0) return;
      const hash = await bcrypt.hash('Admin123!', 10);
      await this.adminRepo.insert({
        email: 'admin@localhost',
        passwordHash: hash,
        name: 'Admin',
        role: 'super_admin',
      });
    } catch {
      // DB might not be ready
    }
  }
}
