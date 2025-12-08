<template>
  <n-config-provider
    :theme="isDark ? darkTheme : null"
    :theme-overrides="computedThemeOverrides"
  >
    <n-message-provider>
      <n-dialog-provider>
        <n-notification-provider>
          <AppLayout
            :is-dark="isDark"
            @update:is-dark="handleUpdateIsDark"
          >
            <router-view />
          </AppLayout>
        </n-notification-provider>
      </n-dialog-provider>
    </n-message-provider>
  </n-config-provider>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { darkTheme, NConfigProvider, NMessageProvider, NDialogProvider, NNotificationProvider } from 'naive-ui'
import AppLayout from './components/AppLayout.vue'

const STORAGE_KEY = 'finance-tools-theme'

// 读取本地存储
let initialDark = false
if (typeof window !== 'undefined') {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
    if (typeof saved.isDark === 'boolean') initialDark = saved.isDark
  } catch (e) {
    // ignore
  }
}

const isDark = ref(initialDark)

const computedThemeOverrides = computed(() => ({
  common: {
    primaryColor: '#409EFF',
    primaryColorHover: '#66b1ff',
    primaryColorPressed: '#3a8ee6',
    successColor: '#67C23A',
    warningColor: '#E6A23C',
    errorColor: '#F56C6C',
    infoColor: '#909399'
  }
}))

watch(
  isDark,
  () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          isDark: isDark.value
        })
      )
    }
  },
  { deep: true }
)

function handleUpdateIsDark(val) {
  isDark.value = val
}
</script>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial,
    'Noto Sans', sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol',
    'Noto Color Emoji';
}

#app {
  min-height: 100vh;
}
</style>
