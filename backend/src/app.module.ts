import { Module, OnModuleInit } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MulterModule } from '@nestjs/platform-express';
import { AppController } from './app.controller';
import { PrismaService } from './prisma.service';
import { AuthService } from './auth.service';
import { AuthGuard, AdminGuard } from './auth.guard';

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'dev-secret-change-me',
      signOptions: { expiresIn: '7d' },
    }),
    MulterModule.register({
      dest: process.env.UPLOAD_DIR || './uploads',
    }),
  ],
  controllers: [AppController],
  providers: [PrismaService, AuthService, AuthGuard, AdminGuard],
})
export class AppModule implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  async onModuleInit() {
    await this.auth.ensureAdmin();
    await this.prisma.miniApp.upsert({
      where: { slug: 'weiqi' },
      update: {
        name: '围棋对弈',
        description: '本地围棋对弈小程序，支持匹配、计时、落子和提子。',
        entryUrl: '/apps/weiqi/',
        status: 'ACTIVE',
      },
      create: {
        name: '围棋对弈',
        slug: 'weiqi',
        description: '本地围棋对弈小程序，支持匹配、计时、落子和提子。',
        entryUrl: '/apps/weiqi/',
        status: 'ACTIVE',
      },
    });
  }
}
