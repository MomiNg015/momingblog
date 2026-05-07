<template>
  <main class="page">
    <section class="hero">
      <h1>我的博客与小程序</h1>
      <p>记录文章、图片和自己做的小工具。</p>
    </section>

    <section class="grid-list">
      <article v-for="post in posts" :key="post.id" class="card">
        <img v-if="post.coverImage" :src="post.coverImage.url" alt="" />
        <div>
          <span class="meta">{{ new Date(post.createdAt).toLocaleDateString() }} · {{ post._count?.comments || 0 }} 条评论</span>
          <h2>{{ post.title }}</h2>
          <p>{{ post.summary }}</p>
          <RouterLink :to="`/posts/${post.slug}`">阅读全文</RouterLink>
        </div>
      </article>
      <p v-if="!posts.length" class="empty">还没有发布文章。</p>
    </section>
  </main>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { api } from '../lib/api';

const posts = ref([]);

onMounted(async () => {
  posts.value = await api('/posts');
});
</script>
