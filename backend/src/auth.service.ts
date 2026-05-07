import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from './prisma.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async register(input: { username: string; password: string; nickname: string }) {
    const username = clean(input.username);
    const nickname = clean(input.nickname || input.username);
    if (!username || !input.password || input.password.length < 6) {
      throw new UnauthorizedException('用户名或密码不符合要求。');
    }
    const passwordHash = await bcrypt.hash(input.password, 10);
    const user = await this.prisma.user.create({
      data: { username, nickname, passwordHash },
      select: publicUserSelect,
    });
    return this.issueToken(user);
  }

  async login(input: { username: string; password: string }) {
    const user = await this.prisma.user.findUnique({ where: { username: clean(input.username) } });
    if (!user || !(await bcrypt.compare(input.password || '', user.passwordHash))) {
      throw new UnauthorizedException('用户名或密码错误。');
    }
    return this.issueToken(user);
  }

  async ensureAdmin() {
    const username = process.env.ADMIN_USERNAME || 'admin';
    const password = process.env.ADMIN_PASSWORD || 'change_me_admin_password';
    const nickname = process.env.ADMIN_NICKNAME || '站长';
    const passwordHash = await bcrypt.hash(password, 10);
    await this.prisma.user.upsert({
      where: { username },
      update: { role: 'ADMIN', nickname },
      create: { username, nickname, passwordHash, role: 'ADMIN' },
    });
  }

  issueToken(user: { id: string; username: string; nickname: string; role: string }) {
    return {
      token: this.jwt.sign({ sub: user.id, role: user.role }),
      user,
    };
  }
}

export const publicUserSelect = {
  id: true,
  username: true,
  nickname: true,
  role: true,
  createdAt: true,
};

export function clean(value: unknown) {
  return String(value || '').trim().slice(0, 80);
}
