import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { SupabaseSharedService } from './supabase-shared.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('supabase/shared')
@UseGuards(JwtAuthGuard)
export class SupabaseSharedController {
  constructor(private readonly supabaseSharedService: SupabaseSharedService) {}

  @Get('status')
  getStatus() {
    return this.supabaseSharedService.getStatus();
  }

  @Post('setup')
  setup(@Body('domain') domain: string) {
    return this.supabaseSharedService.setup(domain);
  }
}
