<template>
  <div class="home-page">
    <n-space vertical size="large">
      <n-card>
        <n-space vertical>
          <n-text strong style="font-size: 24px">欢迎使用财务工具箱 📦</n-text>
          <n-text depth="3">提供各种财务相关的实用工具，提升工作效率</n-text>
        </n-space>
      </n-card>

      <n-grid :x-gap="16" :y-gap="16" :cols="3" responsive="screen">
        <n-grid-item>
          <n-card
            hoverable
            class="tool-card"
            @click="handleToolClick('invoice-rename')"
          >
            <n-space vertical align="center">
              <n-icon size="48" color="#409EFF">
                <DocumentTextOutline />
              </n-icon>
              <n-text strong>发票重命名</n-text>
              <n-text depth="3" style="text-align: center">
                批量处理发票文件，智能提取信息并重命名
              </n-text>
            </n-space>
          </n-card>
        </n-grid-item>

        <n-grid-item>
          <n-card class="tool-card-disabled">
            <n-space vertical align="center">
              <n-icon size="48" color="#dcdfe6">
                <ConstructOutline />
              </n-icon>
              <n-text strong depth="3">更多工具</n-text>
              <n-text depth="3" style="text-align: center">
                敬请期待...
              </n-text>
            </n-space>
          </n-card>
        </n-grid-item>

        <n-grid-item>
          <n-card class="tool-card-disabled">
            <n-space vertical align="center">
              <n-icon size="48" color="#dcdfe6">
                <ConstructOutline />
              </n-icon>
              <n-text strong depth="3">更多工具</n-text>
              <n-text depth="3" style="text-align: center">
                敬请期待...
              </n-text>
            </n-space>
          </n-card>
        </n-grid-item>
      </n-grid>
    </n-space>
  </div>
</template>

<script setup>
import { NSpace, NCard, NText, NIcon, NGrid, NGridItem } from 'naive-ui'
import { DocumentTextOutline, ConstructOutline } from '@vicons/ionicons5'
import { useRouter } from 'vue-router'

const router = useRouter()

function handleToolClick(key) {
  router.push(`/${key}`)
}
</script>

<style scoped>
.home-page {
  max-width: 1200px;
  margin: 0 auto;
}

.tool-card {
  cursor: pointer;
  transition: all 0.3s;
}

.tool-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.tool-card-disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

@media (max-width: 768px) {
  :deep(.n-grid) {
    grid-template-columns: 1fr !important;
  }
}
</style>
