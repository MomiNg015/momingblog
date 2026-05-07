# 个人网站框架

这是一个前后端分离的个人网站基础框架，包含博客、图片上传、账号登录注册、评论、小程序区域，以及现有围棋对弈小程序。

## 技术栈

- 前端：Vue 3 + Vite
- 后端：NestJS + Prisma
- 数据库：PostgreSQL
- 部署：Docker Compose + Nginx
- 文件：服务器本地 Docker volume

## 目录

```text
frontend/      主站前端
backend/       NestJS API 服务
apps/weiqi/    围棋对弈小程序
nginx/         反向代理配置
docker-compose.yml
.env.example
```

## 本地开发

安装依赖：

```powershell
npm install
```

启动后端前，需要准备 PostgreSQL，并设置 `DATABASE_URL`。然后运行：

```powershell
npm run prisma:generate
npm run prisma:migrate
npm run dev:backend
```

启动主站前端：

```powershell
npm run dev:frontend
```

启动围棋小程序：

```powershell
npm run dev:weiqi
```

## Docker 部署

复制环境变量模板：

```powershell
copy .env.example .env
```

修改 `.env` 中的数据库密码、JWT 密钥和管理员密码，然后启动：

```powershell
docker compose up -d --build
```

访问：

```text
http://服务器IP/
```

路由约定：

- 主站：`/`
- API：`/api/*`
- 上传文件：`/uploads/*`
- 围棋小程序：`/apps/weiqi/`

## 当前功能

- 游客注册、登录、获取当前用户
- 管理员初始化账号
- 管理员发布文章、保存草稿、上传图片
- 博客首页、文章详情、封面图
- 登录用户评论文章
- 管理员删除评论 API
- 小程序列表
- 围棋对弈作为独立小程序接入

## 默认管理员

默认值来自 `.env.example`：

```text
ADMIN_USERNAME=admin
ADMIN_PASSWORD=change_me_admin_password
```

首次部署前务必修改。
