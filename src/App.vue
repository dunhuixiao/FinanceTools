<template>
  <n-config-provider :theme-overrides="themeOverrides">
    <n-message-provider>
      <n-dialog-provider>
        <n-notification-provider>
          <AppLayout v-model:active-key="currentView" @update:active-key="handleViewChange">
            <HomePage v-if="currentView === 'home'" @navigate="handleNavigate" />
            <InvoiceRename v-else-if="currentView === 'invoice-rename'" />
          </AppLayout>
        </n-notification-provider>
      </n-dialog-provider>
    </n-message-provider>
  </n-config-provider>
</template>

<script setup>
import { ref } from 'vue'
import { NConfigProvider, NMessageProvider, NDialogProvider, NNotificationProvider } from 'naive-ui'
import AppLayout from './components/AppLayout.vue'
import HomePage from './views/HomePage.vue'
import InvoiceRename from './views/Home.vue'

const themeOverrides = {
  common: {
    primaryColor: '#409EFF',
    primaryColorHover: '#66B1FF',
    primaryColorPressed: '#3A8EE6',
    successColor: '#67C23A',
    warningColor: '#E6A23C',
    errorColor: '#F56C6C',
    infoColor: '#909399'
  }
}

const currentView = ref('home')

function handleViewChange(key) {
  currentView.value = key
}

function handleNavigate(key) {
  currentView.value = key
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
  background-color: #f5f7fa;
}

#app {
  min-height: 100vh;
}
</style>
