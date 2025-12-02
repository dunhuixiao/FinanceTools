<template>
  <n-layout has-sider style="height: 100vh">
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
    
    <n-layout style="height: 100vh; display: flex; flex-direction: column;">
      <n-layout-header bordered style="height: 64px; padding: 0 24px; display: flex; flex-direction: column; justify-content: center; flex-shrink: 0;">
        <n-breadcrumb v-if="breadcrumbs.length > 0" separator="/" style="margin-bottom: 4px;">
          <n-breadcrumb-item 
            v-for="item in breadcrumbs" 
            :key="item.key"
            :clickable="item.clickable"
            @click="item.clickable && handleMenuSelect(item.key)"
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
      </n-layout-header>
      
      <n-layout-content
        :native-scrollbar="false"
        style="flex: 1; min-width: 0; min-height: 0; overflow-y: auto; padding: 24px;"
      >
        <slot></slot>
      </n-layout-content>
    </n-layout>
  </n-layout>
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
  HomeOutline
} from '@vicons/ionicons5'

const props = defineProps({
  activeKey: {
    type: String,
    default: 'home'
  }
})

const emit = defineEmits(['update:activeKey'])

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
  localActiveKey.value = key
  emit('update:activeKey', key)
}
</script>

<style scoped>
.logo-container {
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 24px;
  border-bottom: 1px solid #efeff5;
}
</style>
