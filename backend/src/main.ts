import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import { AppModule } from './app.module';

async function ensureSupabaseRepo() {
  const root = process.env.HOSTING_PANEL_ROOT || '/opt/hosting-panel';
  const supabaseDir = join(root, 'infra', 'supabase', 'supabase');
  const dockerDir = join(supabaseDir, 'docker');
  if (!existsSync(dockerDir)) {
    const { rmSync } = await import('fs');
    if (existsSync(supabaseDir)) {
      rmSync(supabaseDir, { recursive: true });
    }
    console.log('Pre-cloning Supabase repo (first run, may take 5–10 min)...');
    execSync(`git clone --depth 1 https://github.com/supabase/supabase.git "${supabaseDir}"`, {
      stdio: 'inherit',
      timeout: 900000, // 15 min
    });
    console.log('Supabase repo ready.');
  }
}

async function bootstrap() {
  await ensureSupabaseRepo();
  const app = await NestFactory.create(AppModule);
  app.useWebSocketAdapter(new IoAdapter(app));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.enableCors({
    origin: process.env.CORS_ORIGIN || true,
    credentials: true,
  });

  const port = process.env.PORT || 3000;
  await app.listen(port);

  console.log(`Hosting Panel API running on http://localhost:${port}`);
}

bootstrap().catch(console.error);
