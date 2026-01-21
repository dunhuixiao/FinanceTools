import { createRouter, createWebHistory, RouteRecordRaw } from 'vue-router'
import HomePage from '../views/HomePage.vue'
import InvoiceRename from '../views/InvoiceRename.vue'
import InvoiceParsing from '../views/InvoiceParsing.vue'
import InvoiceContent from '../views/InvoiceContent.vue'
import NotFound from '../components/Common/NotFound.vue'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'home',
    component: HomePage,
    meta: { title: '首页' }
  },
  {
    path: '/invoice-rename',
    name: 'invoice-rename',
    component: InvoiceRename,
    meta: { title: '发票重命名' }
  },
  {
    path: '/invoice-parsing',
    name: 'invoice-parsing',
    component: InvoiceParsing,
    meta: { title: '发票号码解析' }
  },
  {
    path: '/invoice-content',
    name: 'invoice-content',
    component: InvoiceContent,
    meta: { title: '发票内容解析' }
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: NotFound,
    meta: { title: '页面未找到' }
  }
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes
})

export default router
