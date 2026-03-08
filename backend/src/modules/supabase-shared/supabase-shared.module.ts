import { Module } from '@nestjs/common';
import { SupabaseSharedController } from './supabase-shared.controller';
import { SupabaseSharedService } from './supabase-shared.service';

@Module({
  controllers: [SupabaseSharedController],
  providers: [SupabaseSharedService],
  exports: [SupabaseSharedService],
})
export class SupabaseSharedModule {}
