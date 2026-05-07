import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from './prisma.service';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    protected readonly jwt: JwtService,
    protected readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    const token = String(request.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) throw new UnauthorizedException('请先登录。');
    try {
      const payload = await this.jwt.verifyAsync(token, { secret: process.env.JWT_SECRET || 'dev-secret-change-me' });
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, username: true, nickname: true, role: true, createdAt: true },
      });
      if (!user) throw new UnauthorizedException('登录已失效。');
      request.user = user;
      return true;
    } catch {
      throw new UnauthorizedException('登录已失效。');
    }
  }
}

@Injectable()
export class AdminGuard extends AuthGuard {
  async canActivate(context: ExecutionContext) {
    await super.canActivate(context);
    const request = context.switchToHttp().getRequest();
    if (request.user.role !== 'ADMIN') throw new ForbiddenException('需要管理员权限。');
    return true;
  }
}
