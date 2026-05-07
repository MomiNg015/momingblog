<template>
  <main class="page narrow">
    <article v-if="post" class="article">
      <img v-if="post.coverImage" :src="post.coverImage.url" alt="" />
      <span class="meta">{{ post.author.nickname }} · {{ new Date(post.createdAt).toLocaleDateString() }}</span>
      <h1>{{ post.title }}</h1>
      <p class="summary">{{ post.summary }}</p>
      <div class="content">{{ post.content }}</div>
    </article>

    <section v-if="post" class="comments">
      <h2>评论</h2>
      <form v-if="auth.user" @submit.prevent="submitComment">
        <textarea v-model="comment" placeholder="写下你的评论"></textarea>
        <button>发表评论</button>
      </form>
      <RouterLink v-else to="/login">登录后评论</RouterLink>
      <div v-for="item in post.comments" :key="item.id" class="comment">
        <strong>{{ item.user.nickname }}</strong>
        <p>{{ item.content }}</p>
      </div>
    </section>
  </main>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { api, auth } from '../lib/api';

const route = useRoute();
const post = ref(null);
const comment = ref('');

async function load() {
  post.value = await api(`/posts/${route.params.slug}`);
}

async function submitComment() {
  if (!comment.value.trim()) return;
  await api(`/posts/${post.value.id}/comments`, {
    method: 'POST',
    body: JSON.stringify({ content: comment.value }),
  });
  comment.value = '';
  await load();
}

onMounted(load);
</script>
