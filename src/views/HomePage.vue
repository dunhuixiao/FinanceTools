<template>
  <div class="page-container">
    <n-space vertical size="large">
      <n-card>
        <n-space vertical>
          <n-text strong style="font-size: 20px">欢迎使用财务工具箱 📦</n-text>
          <n-text depth="3" style="font-size: 14px">提供各种财务相关的实用工具，提升工作效率</n-text>
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
                <CreateOutline />
              </n-icon>
              <n-text strong style="font-size: 14px">发票重命名</n-text>
              <n-text depth="3" style="text-align: center; font-size: 13px">
                批量处理发票文件，智能提取信息并重命名
              </n-text>
            </n-space>
          </n-card>
        </n-grid-item>

        <n-grid-item>
          <n-card
            hoverable
            class="tool-card"
            @click="handleToolClick('invoice-parsing')"
          >
            <n-space vertical align="center">
              <n-icon size="48" color="#67C23A">
                <DocumentsOutline />
              </n-icon>
              <n-text strong style="font-size: 14px">发票号码解析</n-text>
              <n-text depth="3" style="text-align: center; font-size: 13px">
                解析PDF发票文件，提取关键信息并导出
              </n-text>
            </n-space>
          </n-card>
        </n-grid-item>

        <n-grid-item>
          <n-card
            hoverable
            class="tool-card"
            @click="handleToolClick('invoice-content')"
          >
            <n-space vertical align="center">
              <n-icon size="48" color="#E6A23C">
                <ListOutline />
              </n-icon>
              <n-text strong style="font-size: 14px">发票内容解析</n-text>
              <n-text depth="3" style="text-align: center; font-size: 13px">
                提取发票项目明细，导出Excel表格
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
              <n-text strong depth="3" style="font-size: 14px">更多工具</n-text>
              <n-text depth="3" style="text-align: center; font-size: 13px">
                敬请期待...
              </n-text>
            </n-space>
          </n-card>
        </n-grid-item>
      </n-grid>
    </n-space>
  </div>
</template>

<script setup lang="ts">
import { NSpace, NCard, NText, NIcon, NGrid, NGridItem } from 'naive-ui'
import { ConstructOutline, DocumentsOutline, CreateOutline, ListOutline } from '@vicons/ionicons5'
import { useRouter } from 'vue-router'

const router = useRouter()

function handleToolClick(key: string) {
  router.push(`/${key}`)
}
</script>

<style scoped>
.page-container {
  max-width: 1400px;
  margin: 0 auto;
  padding: 24px;
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
  .page-container {
    padding: 16px;
  }
  
  :deep(.n-grid) {
    grid-template-columns: 1fr !important;
  }
}
</style>
