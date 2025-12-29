<template>
  <div class="app-layout-container">
    <n-layout has-sider class="main-layout">
      <n-layout-sider
        bordered
        collapse-mode="width"
        :collapsed-width="64"
        :width="240"
        :collapsed="collapsed"
        show-trigger
        @collapse="collapsed = true"
        @expand="collapsed = false"
      >
        <div class="logo-container">
          <n-text strong style="font-size: 18px">{{ collapsed ? '📦' : '📦 财务工具箱' }}</n-text>
        </div>
        
        <n-menu
          :value="activeKey"
          :collapsed="collapsed"
          :collapsed-width="64"
          :collapsed-icon-size="22"
          :options="menuOptions"
          @update:value="handleMenuSelect"
        />
      </n-layout-sider>
      
      <n-layout class="content-layout">
        <n-layout-header bordered class="header">
          <div class="header-left">
            <n-breadcrumb v-if="breadcrumbs.length > 0" separator="/" style="margin-bottom: 4px;">
              <n-breadcrumb-item 
                v-for="item in breadcrumbs" 
                :key="item.key"
                :clickable="item.clickable"
                @click="item.clickable && handleBreadcrumbClick(item.key)"
              >
                <span :style="{
                  color: item.clickable ? '#409EFF' : (item.key === activeKey ? '#303133' : '#909399'),
                  fontWeight: item.key === activeKey ? 'bold' : 'normal',
                  cursor: item.clickable ? 'pointer' : 'default',
                  fontSize: '14px'
                }">
                  {{ item.label }}
                </span>
              </n-breadcrumb-item>
            </n-breadcrumb>
            <n-text strong style="font-size: 20px">{{ currentTitle }}</n-text>
          </div>

          <div class="header-right">
            <!-- 暗黑模式按钮 -->
            <n-tooltip placement="bottom" trigger="hover">
              <template #trigger>
                <n-button 
                  quaternary 
                  circle
                  class="icon-btn"
                  @click="toggleTheme"
                >
                  <template #icon>
                    <n-icon size="18">
                      <MoonOutline v-if="!isDark" />
                      <SunnyOutline v-else />
                    </n-icon>
                  </template>
                </n-button>
              </template>
              {{ isDark ? '浅色模式' : '深色模式' }}
            </n-tooltip>

            <!-- GitHub 链接 -->
            <n-tooltip placement="bottom" trigger="hover">
              <template #trigger>
                <n-button quaternary circle class="icon-btn" @click="handleGithubClick">
                  <template #icon>
                    <n-icon size="18">
                      <LogoGithub />
                    </n-icon>
                  </template>
                </n-button>
              </template>
              GitHub
            </n-tooltip>
          </div>
        </n-layout-header>
        
        <n-layout-content class="content">
          <slot></slot>
          <!-- 回到顶部按钮 -->
          <n-back-top :right="40" :bottom="80" />
        </n-layout-content>
      </n-layout>
    </n-layout>
    
    <!-- 页脚移到最外层布局外面 -->
    <n-layout-footer bordered class="footer">
      <n-text depth="3" class="copyright-text">
        Copyright © 2025 - present 
        <a href="https://github.com/dunhuixiao" target="_blank" rel="noopener noreferrer" class="author-link">Sora</a>
      </n-text>
    </n-layout-footer>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, h } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  NLayout,
  NLayoutSider,
  NLayoutHeader,
  NLayoutContent,
  NLayoutFooter,
  NMenu,
  NText,
  NIcon,
  NBreadcrumb,
  NBreadcrumbItem,
  NBackTop,
  NTooltip,
  NButton
} from 'naive-ui'
import {
  DocumentTextOutline,
  HomeOutline,
  LogoGithub,
  MoonOutline,
  SunnyOutline
} from '@vicons/ionicons5'
import { useTheme } from '../composables/useTheme'

const { isDark, toggleTheme } = useTheme()

const route = useRoute()
const router = useRouter()

const collapsed = ref(false)

// 根据路由计算当前激活的菜单项
const activeKey = computed(() => {
  const path = route.path
  if (path === '/' || path === '/home') return 'home'
  if (path === '/invoice-rename') return 'invoice-rename'
  if (path === '/invoice-parsing') return 'invoice-parsing'
  return 'home'
})

const menuOptions = [
  {
    label: '首页',
    key: 'home',
    icon: renderIcon(HomeOutline)
  },
  {
    label: '发票工具',
    key: 'invoice-tools',
    icon: renderIcon(DocumentTextOutline),
    children: [
      {
        label: '📝 发票重命名',
        key: 'invoice-rename'
      },
      {
        label: '📊 发票解析',
        key: 'invoice-parsing'
      }
    ]
  }
]

const currentTitle = computed(() => {
  const findTitle = (options: any[]): string | null => {
    for (const option of options) {
      if (option.key === activeKey.value) {
        return option.label
      }
      if (option.children) {
        const childTitle = findTitle(option.children)
        if (childTitle) return childTitle
      }
    }
    return null
  }
  return findTitle(menuOptions) || '首页'
})

// 构建面包屑导航
const breadcrumbs = computed(() => {
  // 首页不显示面包屑
  if (activeKey.value === 'home') {
    return []
  }

  // 查找当前项及其父级路径
  const findPath = (options: any[], targetKey: string, path: any[] = []): any[] | null => {
    for (const option of options) {
      if (option.key === targetKey) {
        return [...path, option]
      }
      if (option.children) {
        const found = findPath(option.children, targetKey, [...path, option])
        if (found) return found
      }
    }
    return null
  }

  const path = findPath(menuOptions, activeKey.value)
  if (!path) return []

  // 添加首页到路径开头
  const fullPath = [
    { label: '🏠 首页', key: 'home', clickable: true },
    ...path.map((item: any, index: number) => ({
      label: index === 0 ? `📄 ${item.label}` : item.label, // 仅为第一层（发票工具）添加emoji
      key: item.key,
      clickable: false // 分组和当前页不可点击
    }))
  ]

  return fullPath
})

function renderIcon(icon: any) {
  return () => h(NIcon, null, { default: () => h(icon) })
}

function handleMenuSelect(key: string) {
  // 根据 key 跳转到对应路由
  if (key === 'home') {
    router.push('/')
  } else if (key === 'invoice-rename') {
    router.push('/invoice-rename')
  } else if (key === 'invoice-parsing') {
    router.push('/invoice-parsing')
  }
}

function handleBreadcrumbClick(key: string) {
  // 点击面包屑时跳转
  if (key === 'home') {
    router.push('/')
  }
}

function handleGithubClick() {
  window.open('https://github.com/dunhuixiao/FinanceTools', '_blank', 'noopener,noreferrer')
}
</script>

<style scoped>
/* 设置容器为视口高度 */
.app-layout-container {
  height: 100vh;
  display: flex;
  flex-direction: column;
}

.main-layout {
  flex: 1;
  min-height: 0;
}

.content-layout {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.header {
  height: 64px;
  padding: 0 24px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
}

.header-left {
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 4px;
}

/* 图标按钮统一样式 */
.icon-btn {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 24px;
}

.logo-container {
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 24px;
}

.footer {
  padding: 12px 24px;
  display: flex;
  justify-content: center;
  align-items: center;
  flex-shrink: 0;
}

.copyright-text {
  font-size: 12px;
  text-align: center;
}

.author-link {
  color: #409EFF;
  text-decoration: none;
  transition: color 0.3s ease;
}

.author-link:hover {
  color: #66b1ff;
  text-decoration: underline;
}
</style>
