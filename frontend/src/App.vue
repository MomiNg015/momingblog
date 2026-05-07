<template>
  <div class="shell">
    <header class="topbar">
      <RouterLink class="brand" to="/">个人网站</RouterLink>
      <nav>
        <RouterLink to="/">博客</RouterLink>
        <RouterLink to="/apps">小程序</RouterLink>
        <RouterLink v-if="auth.user?.role === 'ADMIN'" to="/admin">后台</RouterLink>
        <RouterLink v-if="!auth.user" to="/login">登录</RouterLink>
        <button v-else @click="logout">退出 {{ auth.user.nickname }}</button>
      </nav>
    </header>
    <RouterView />
  </div>
</template>

<script setup>
import { RouterLink, RouterView } from 'vue-router';
import { auth, logout } from './lib/api';
</script>
