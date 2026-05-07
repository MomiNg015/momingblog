import { createApp } from 'vue';
import { createRouter, createWebHistory } from 'vue-router';
import App from './App.vue';
import Home from './pages/Home.vue';
import PostDetail from './pages/PostDetail.vue';
import Login from './pages/Login.vue';
import MiniApps from './pages/MiniApps.vue';
import Admin from './pages/Admin.vue';
import './style.css';

const routes = [
  { path: '/', component: Home },
  { path: '/posts/:slug', component: PostDetail },
  { path: '/login', component: Login },
  { path: '/apps', component: MiniApps },
  { path: '/admin', component: Admin },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

createApp(App).use(router).mount('#app');
