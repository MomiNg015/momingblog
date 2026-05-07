<template>
  <main class="page admin-page">
    <section v-if="auth.user?.role !== 'ADMIN'" class="empty">需要管理员账号。</section>
    <template v-else>
      <section class="editor card">
        <h1>发布文章</h1>
        <input v-model="post.title" placeholder="标题" />
        <input v-model="post.slug" placeholder="slug，例如 my-first-post" />
        <textarea v-model="post.summary" placeholder="摘要"></textarea>
        <textarea v-model="post.content" class="content-input" placeholder="正文"></textarea>
        <select v-model="post.coverImageId">
          <option value="">无封面</option>
          <option v-for="item in media" :key="item.id" :value="item.id">{{ item.filename }}</option>
        </select>
        <div class="row">
          <button @click="save('DRAFT')">保存草稿</button>
          <button @click="save('PUBLISHED')">发布</button>
        </div>
      </section>

      <section class="card">
        <h2>上传图片</h2>
        <input type="file" accept="image/*" @change="upload" />
        <div class="media-grid">
          <img v-for="item in media" :key="item.id" :src="item.url" alt="" />
        </div>
      </section>

      <section class="card">
        <h2>文章管理</h2>
        <p v-for="item in posts" :key="item.id">{{ item.status }} · {{ item.title }}</p>
      </section>
    </template>
  </main>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue';
import { api, auth } from '../lib/api';

const posts = ref([]);
const media = ref([]);
const post = reactive({ title: '', slug: '', summary: '', content: '', coverImageId: '' });

async function load() {
  if (auth.user?.role !== 'ADMIN') return;
  posts.value = await api('/admin/posts');
  media.value = await api('/media');
}

async function save(status) {
  await api('/posts', {
    method: 'POST',
    body: JSON.stringify({ ...post, status }),
  });
  Object.assign(post, { title: '', slug: '', summary: '', content: '', coverImageId: '' });
  await load();
}

async function upload(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const form = new FormData();
  form.append('file', file);
  await api('/media', { method: 'POST', body: form });
  event.target.value = '';
  await load();
}

onMounted(load);
</script>
