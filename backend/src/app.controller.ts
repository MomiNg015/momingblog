import { Body, Controller, Delete, Get, Param, Post, Put, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthService, clean, publicUserSelect } from './auth.service';
import { AdminGuard, AuthGuard } from './auth.guard';
import { PrismaService } from './prisma.service';

@Controller()
export class AppController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  @Get('health')
  health() {
    return { ok: true };
  }

  @Post('auth/register')
  register(@Body() body: { username: string; password: string; nickname: string }) {
    return this.auth.register(body);
  }

  @Post('auth/login')
  login(@Body() body: { username: string; password: string }) {
    return this.auth.login(body);
  }

  @UseGuards(AuthGuard)
  @Get('auth/me')
  me(@Req() request: { user: unknown }) {
    return request.user;
  }

  @Get('posts')
  posts() {
    return this.prisma.post.findMany({
      where: { status: 'PUBLISHED' },
      orderBy: { createdAt: 'desc' },
      include: { coverImage: true, author: { select: publicUserSelect }, _count: { select: { comments: true } } },
    });
  }

  @UseGuards(AdminGuard)
  @Get('admin/posts')
  adminPosts() {
    return this.prisma.post.findMany({
      orderBy: { updatedAt: 'desc' },
      include: { coverImage: true, author: { select: publicUserSelect } },
    });
  }

  @Get('posts/:slug')
  async post(@Param('slug') slug: string) {
    return this.prisma.post.findUniqueOrThrow({
      where: { slug },
      include: {
        coverImage: true,
        author: { select: publicUserSelect },
        comments: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
          include: { user: { select: publicUserSelect } },
        },
      },
    });
  }

  @UseGuards(AdminGuard)
  @Post('posts')
  createPost(@Req() request: { user: { id: string } }, @Body() body: PostInput) {
    return this.prisma.post.create({
      data: postData(body, request.user.id),
    });
  }

  @UseGuards(AdminGuard)
  @Put('posts/:id')
  updatePost(@Param('id') id: string, @Body() body: PostInput) {
    return this.prisma.post.update({
      where: { id },
      data: postData(body),
    });
  }

  @UseGuards(AuthGuard)
  @Post('posts/:id/comments')
  addComment(@Req() request: { user: { id: string } }, @Param('id') postId: string, @Body() body: { content: string }) {
    return this.prisma.comment.create({
      data: {
        postId,
        userId: request.user.id,
        content: clean(body.content).slice(0, 1000),
      },
      include: { user: { select: publicUserSelect } },
    });
  }

  @UseGuards(AdminGuard)
  @Delete('comments/:id')
  deleteComment(@Param('id') id: string) {
    return this.prisma.comment.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  @UseGuards(AdminGuard)
  @UseInterceptors(FileInterceptor('file'))
  @Post('media')
  async upload(@Req() request: { user: { id: string } }, @UploadedFile() file: any) {
    return this.prisma.media.create({
      data: {
        filename: file.filename,
        mimeType: file.mimetype,
        size: file.size,
        url: `/uploads/${file.filename}`,
        uploaderId: request.user.id,
      },
    });
  }

  @Get('media')
  media() {
    return this.prisma.media.findMany({ orderBy: { createdAt: 'desc' } });
  }

  @Get('miniapps')
  miniApps() {
    return this.prisma.miniApp.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { createdAt: 'asc' },
    });
  }
}

type PostInput = {
  title: string;
  slug: string;
  summary: string;
  content: string;
  status: 'DRAFT' | 'PUBLISHED';
  coverImageId?: string;
};

function postData(input: PostInput, authorId?: string) {
  const data = {
    title: clean(input.title),
    slug: clean(input.slug).toLowerCase().replace(/[^a-z0-9-]/g, '-'),
    summary: clean(input.summary).slice(0, 300),
    content: String(input.content || '').slice(0, 50000),
    status: input.status === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT',
    coverImageId: input.coverImageId || null,
    ...(authorId ? { authorId } : {}),
  };
  if (!data.title || !data.slug) throw new Error('标题和 slug 必填。');
  return data;
}
