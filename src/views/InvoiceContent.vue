<template>
  <div class="page-container">
    <!-- 上传区域 -->
    <n-space vertical size="large">
      <n-card title="上传发票文件" size="small">
        <file-uploader-batch
          accept="application/pdf,.pdf"
          :disabled="store.isProcessing"
          description="支持 PDF 格式的发票文件，单个文件不超过 10MB，最多 100 个文件"
          @upload="handleUpload"
        />
      </n-card>

      <!-- 解析结果卡片 -->
      <n-card title="" size="small" v-if="store.totalCount > 0">
        <!-- 操作栏 -->
        <n-space justify="space-between" align="center" style="margin-bottom: 16px">
          <n-space>
            <n-tag type="info">
              共 {{ store.fileCount }} 个文件，{{ store.totalCount }} 条明细
            </n-tag>
            
            <n-input
              v-model:value="store.searchKeyword"
              placeholder="搜索文件名、发票号、货物名称..."
              clearable
              style="width: 280px"
              @update:value="store.setSearchKeyword"
            >
              <template #prefix>
                <n-icon><search-outline /></n-icon>
              </template>
            </n-input>
          </n-space>
          
          <n-space>
            <n-button @click="handleSelectAll" :disabled="store.totalCount === 0">
              全选
            </n-button>
            <n-button @click="handleClearSelection" :disabled="store.selectedIds.length === 0">
              取消选择
            </n-button>
            <n-button
              type="error"
              @click="handleDeleteSelected"
              :disabled="store.selectedIds.length === 0"
            >
              删除选中 ({{ store.selectedIds.length }})
            </n-button>
            <n-button
              type="warning"
              @click="handleClearAll"
              :disabled="store.totalCount === 0"
            >
              清空全部
            </n-button>
            <n-dropdown
              trigger="hover"
              :options="exportOptions"
              @select="handleExportSelect"
              :disabled="store.totalCount === 0"
            >
              <n-button
                type="primary"
                :disabled="store.totalCount === 0"
                :loading="isExporting"
              >
                <template #icon>
                  <n-icon><download-outline /></n-icon>
                </template>
                导出Excel
              </n-button>
            </n-dropdown>
          </n-space>
        </n-space>

        <!-- 表格 -->
        <invoice-content-table
          :data="store.filteredList"
          :selected-ids="store.selectedIds"
          :loading="store.isProcessing"
          @update:selected-ids="handleSelectedIdsUpdate"
          @delete="handleDelete"
        />
      </n-card>

      <!-- 空状态提示 -->
      <div v-else class="empty-state">
        <n-icon size="64" color="#e0e0e0">
          <list-outline />
        </n-icon>
        <n-text depth="3" style="font-size: 14px">
          还没有上传任何发票文件
        </n-text>
        <n-text depth="3" style="font-size: 12px">
          上传PDF发票后，将解析出项目明细并支持Excel导出
        </n-text>
      </div>
    </n-space>
  </div>

  <!-- 处理进度对话框 -->
  <progress-modal
    v-model:show="showProgressModal"
    :percentage="parseProgress"
    :current-file="currentFileName"
    title="解析文件中..."
    mode="parse"
  />
</template>

<script setup lang="ts">
import { ref } from 'vue'
import {
  NSpace,
  NCard,
  NButton,
  NInput,
  NIcon,
  NText,
  NTag,
  NDropdown,
  useMessage,
  useDialog
} from 'naive-ui'
import { SearchOutline, ListOutline, DownloadOutline } from '@vicons/ionicons5'
import FileUploaderBatch from '../components/Upload/FileUploaderBatch.vue'
import InvoiceContentTable from '../components/Invoice/InvoiceContentTable.vue'
import ProgressModal from '../components/Common/ProgressModal.vue'
import { useInvoiceContentStore } from '../stores/invoiceContent'
import { useInvoiceContentParser } from '../composables/useInvoiceContentParser'
import { useContentExport } from '../composables/useDataExport'

const message = useMessage()
const dialog = useDialog()

const store = useInvoiceContentStore()
const { parseContentBatch } = useInvoiceContentParser()
const { exportInvoiceContent, isExporting } = useContentExport()

const showProgressModal = ref(false)
const parseProgress = ref(0)
const currentFileName = ref('')

/**
 * 导出下拉菜单选项
 */
const exportOptions = [
  {
    label: '导出本页',
    key: 'current',
    props: {
      style: 'padding: 8px 24px; text-align: center; display: flex; justify-content: center; align-items: center;'
    }
  },
  {
    label: '导出全部',
    key: 'all',
    props: {
      style: 'padding: 8px 24px; text-align: center; display: flex; justify-content: center; align-items: center;'
    }
  }
]

/**
 * 处理选中项更新
 */
function handleSelectedIdsUpdate(keys: (string | number)[]) {
  store.setSelectedIds(keys.map(key => String(key)))
}

/**
 * 全选
 */
function handleSelectAll() {
  store.setSelectedIds(store.filteredList.map(item => item.id))
}

/**
 * 取消选择
 */
function handleClearSelection() {
  store.setSelectedIds([])
}

/**
 * 处理文件上传
 */
async function handleUpload(files: File[]) {
  if (files.length === 0) {
    return
  }

  // 验证文件格式
  const invalidFiles = files.filter((file: File) => {
    const isPDF: boolean = file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf'
    const isSizeValid: boolean = file.size <= 10 * 1024 * 1024
    return !isPDF || !isSizeValid
  })

  if (invalidFiles.length > 0) {
    message.error(`有 ${invalidFiles.length} 个文件格式不正确或超过大小限制`)
    return
  }

  store.setProcessing(true)
  showProgressModal.value = true
  parseProgress.value = 0

  try {
    const { items, results } = await parseContentBatch(files, (current, total, fileName) => {
      parseProgress.value = Math.round((current / total) * 100)
      currentFileName.value = fileName
    })

    // 添加到store
    store.addItems(items)

    const successCount = results.filter(r => r.status === 'success').length
    const failedCount = results.filter(r => r.status === 'failed').length
    const totalItems = items.length

    message.success(`解析完成！文件: ${successCount}成功/${failedCount}失败，共提取 ${totalItems} 条明细`)
  } catch (error) {
    console.error('解析失败:', error)
    message.error(`批量解析失败: ${(error as Error).message}`)
  } finally {
    store.setProcessing(false)
    showProgressModal.value = false
    parseProgress.value = 0
    currentFileName.value = ''
  }
}

/**
 * 删除单个记录
 */
function handleDelete(id: string) {
  dialog.warning({
    title: '确认删除',
    content: '确定要删除这条明细记录吗？',
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: () => {
      store.removeItem(id)
      message.success('删除成功')
    }
  })
}

/**
 * 删除选中记录
 */
function handleDeleteSelected() {
  if (store.selectedIds.length === 0) {
    return
  }

  dialog.warning({
    title: '确认删除',
    content: `确定要删除选中的 ${store.selectedIds.length} 条明细记录吗？`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: () => {
      store.removeItems([...store.selectedIds])
      message.success('删除成功')
    }
  })
}

/**
 * 清空全部
 */
function handleClearAll() {
  dialog.warning({
    title: '确认清空',
    content: '确定要清空所有解析结果吗？此操作不可恢复。',
    positiveText: '清空',
    negativeText: '取消',
    onPositiveClick: () => {
      store.clearAll()
      message.success('已清空全部数据')
    }
  })
}

/**
 * 处理导出选择
 */
async function handleExportSelect(key: string) {
  let dataToExport
  const isFullExport = key === 'all'
  
  if (key === 'current') {
    // 导出本页：使用筛选后的数据
    dataToExport = store.filteredList
  } else {
    // 导出全部：使用所有数据
    dataToExport = store.itemList
  }
  
  if (dataToExport.length === 0) {
    message.warning('没有可导出的数据')
    return
  }
  
  // 显示导出中提示
  message.info('正在导出，成功后会立刻下载')
  
  try {
    const result = await exportInvoiceContent(dataToExport, '发票内容明细', isFullExport)
    
    if (!result.success) {
      message.error(`导出失败：${result.error}`)
    }
    // 导出成功时不再显示额外提示，文件会自动下载
  } catch (error) {
    console.error('导出错误:', error)
    message.error(`导出失败：${(error as Error).message}`)
  }
}
</script>

<style scoped>
.page-container {
  max-width: 1600px;
  margin: 0 auto;
  padding: 24px;
}

.empty-state {
  text-align: center;
  padding: 60px 20px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 16px;
}

@media (max-width: 768px) {
  .page-container {
    padding: 16px;
  }
}
</style>
