<template>
  <main class="page auth-page">
    <section class="auth-card">
      <h1>{{ mode === 'login' ? '登录' : '注册' }}</h1>
      <form @submit.prevent="submit">
        <input v-model="form.username" placeholder="用户名" />
        <input v-if="mode === 'register'" v-model="form.nickname" placeholder="昵称" />
        <input v-model="form.password" type="password" placeholder="密码，至少 6 位" />
        <button>{{ mode === 'login' ? '登录' : '注册' }}</button>
      </form>
      <button class="link-button" @click="mode = mode === 'login' ? 'register' : 'login'">
        {{ mode === 'login' ? '没有账号？去注册' : '已有账号？去登录' }}
      </button>
      <p v-if="error" class="error-text">{{ error }}</p>
    </section>
  </main>
</template>

<script setup>
import { reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api, setSession } from '../lib/api';

const router = useRouter();
const mode = ref('login');
const error = ref('');
const form = reactive({ username: '', nickname: '', password: '' });

async function submit() {
  try {
    error.value = '';
    const session = await api(`/auth/${mode.value}`, {
      method: 'POST',
      body: JSON.stringify(form),
    });
    setSession(session);
    router.push('/');
  } catch (err) {
    error.value = err.message;
  }
}
</script>
