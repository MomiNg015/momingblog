<template>
  <main class="page">
    <section class="hero compact">
      <h1>小程序</h1>
      <p>这里会收纳站内的小工具和小游戏。</p>
    </section>
    <section class="grid-list apps">
      <article v-for="app in apps" :key="app.id" class="card">
        <div>
          <h2>{{ app.name }}</h2>
          <p>{{ app.description }}</p>
          <a :href="app.entryUrl">打开</a>
        </div>
      </article>
    </section>
  </main>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { api } from '../lib/api';

const apps = ref([]);

onMounted(async () => {
  apps.value = await api('/miniapps');
});
</script>
