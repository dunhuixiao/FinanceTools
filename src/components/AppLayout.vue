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
          :value="localActiveKey"
          :collapsed="collapsed"
          :collapsed-width="64"
          :collapsed-icon-size="22"
          :options="menuOptions"
          @update:value="handleMenuSelect"
        />
      </n-layout-sider>
      
      <n-layout class="content-layout">
        <n-layout-header bordered class="header">
          <div>
            <n-breadcrumb v-if="breadcrumbs.length > 0" separator="/" style="margin-bottom: 4px;">
              <n-breadcrumb-item 
                v-for="item in breadcrumbs" 
                :key="item.key"
                :clickable="item.clickable"
                @click="item.clickable && handleBreadcrumbClick(item.key)"
              >
                <span :style="{
                  color: item.clickable ? '#409EFF' : (item.key === props.activeKey ? '#303133' : '#909399'),
                  fontWeight: item.key === props.activeKey ? 'bold' : 'normal',
                  cursor: item.clickable ? 'pointer' : 'default',
                  fontSize: '14px'
                }">
                  {{ item.label }}
                </span>
              </n-breadcrumb-item>
            </n-breadcrumb>
            <n-text strong style="font-size: 20px">{{ currentTitle }}</n-text>
          </div>
          <n-icon 
            size="24" 
            class="github-icon"
            @click="handleGithubClick"
          >
            <LogoGithub />
          </n-icon>
        </n-layout-header>
        
        <n-layout-content class="content">
          <slot></slot>
        </n-layout-content>
      </n-layout>
    </n-layout>
    
    <!-- 页脚移到最外层布局外面 -->
    <n-layout-footer bordered class="footer">
      <n-text depth="3" class="copyright-text">
        Copyright © 2025 - present 
        <a href="https://github.com/dunhuixiao" target="_blank" class="author-link">Sora</a>
      </n-text>
    </n-layout-footer>
  </div>
</template>

<script setup>
import { ref, computed, h, watch } from 'vue'
import {
  NLayout,
  NLayoutSider,
  NLayoutHeader,
  NLayoutContent,
  NMenu,
  NText,
  NSpace,
  NIcon,
  NBreadcrumb,
  NBreadcrumbItem
} from 'naive-ui'
import {
  DocumentTextOutline,
  HomeOutline,
  LogoGithub
} from '@vicons/ionicons5'

const props = defineProps({
  activeKey: {
    type: String,
    default: 'home'
  }
})

const emit = defineEmits(['update:activeKey'])

// 将handleMenuSelect函数暴露给模板
defineExpose({
  handleMenuSelect
})

const collapsed = ref(false)
const localActiveKey = ref(props.activeKey)

watch(() => props.activeKey, (val) => {
  localActiveKey.value = val
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
      }
    ]
  }
]

const currentTitle = computed(() => {
  const findTitle = (options) => {
    for (const option of options) {
      if (option.key === props.activeKey) {
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
  if (props.activeKey === 'home') {
    return []
  }

  // 查找当前项及其父级路径
  const findPath = (options, targetKey, path = []) => {
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

  const path = findPath(menuOptions, props.activeKey)
  if (!path) return []

  // 添加首页到路径开头
  const fullPath = [
    { label: '🏠 首页', key: 'home', clickable: true },
    ...path.map((item, index) => ({
      label: index === 0 ? `📄 ${item.label}` : item.label, // 仅为第一层（发票工具）添加emoji
      key: item.key,
      clickable: false // 分组和当前页不可点击
    }))
  ]

  return fullPath
})

function renderIcon(icon) {
  return () => h(NIcon, null, { default: () => h(icon) })
}

function handleMenuSelect(key) {
  // 只有当点击的不是当前激活的菜单项时才触发事件
  if (key !== props.activeKey) {
    emit('update:activeKey', key)
  }
}

function handleBreadcrumbClick(key) {
  // 只有当点击的不是当前激活的菜单项时才触发事件
  if (key !== props.activeKey) {
    emit('update:activeKey', key)
  }
}

function handleGithubClick() {
  window.open('https://github.com/dunhuixiao/FinanceTools', '_blank')
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
  min-height: 0; /* 防止子元素超出容器 */
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

/* GitHub图标悬停效果 */
.github-icon {
  cursor: pointer;
  transition: color 0.3s ease;
}

.github-icon:hover {
  color: #409EFF; /* 悬停时变为蓝色 */
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
  border-bottom: 1px solid #efeff5;
}

.footer {
  padding: 12px 24px;
  display: flex;
  justify-content: center;
  align-items: center;
  background-color: white; /* 改为白色背景 */
  flex-shrink: 0; /* 防止页脚被压缩 */
  border-top: 1px solid #efeff5; /* 添加顶部边框作为分隔线 */
}

.copyright-text {
  font-size: 12px;
  text-align: center;
  color: #909399; /* 使用与页面其他文本一致的颜色 */
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
