<template>
  <div class="page-container">
    <!-- 上传区域 -->
    <n-space vertical size="large">
      <n-card title="上传发票文件" size="small">
        <FileUploaderBatch
          accept="application/pdf,.pdf"
          :disabled="store.isProcessing"
          description="支持 PDF 格式的发票文件，单个文件不超过 10MB，最多 100 个文件"
          @upload="handleFileUpload"
        />
      </n-card>

      <!-- 操作栏和数据表格 -->
      <n-card v-if="store.totalCount > 0" size="small">
        <!-- 操作栏 -->
        <n-space justify="space-between" align="center" style="margin-bottom: 16px">
          <n-space>
            <n-radio-group v-model:value="store.filterStatus">
              <n-radio-button value="all">
                全部 ({{ store.totalCount }})
              </n-radio-button>
              <n-radio-button value="success">
                成功 ({{ store.successCount }})
              </n-radio-button>
              <n-radio-button value="failed">
                失败 ({{ store.failedCount }})
              </n-radio-button>
            </n-radio-group>
            
            <n-input
              v-model:value="store.searchKeyword"
              placeholder="搜索文件名..."
              clearable
              style="width: 200px"
            >
              <template #prefix>
                <n-icon><SearchOutline /></n-icon>
              </template>
            </n-input>
          </n-space>
          
          <n-space>
            <n-button @click="store.selectAll" :disabled="store.totalCount === 0">
              全选
            </n-button>
            <n-button @click="store.clearSelection" :disabled="store.selectedIds.length === 0">
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
              type="primary"
              @click="handleExport"
              :disabled="store.successCount === 0"
              :loading="isExporting"
            >
              导出成功的文件
            </n-button>
          </n-space>
        </n-space>

        <div class="table-scroll-container">
          <InvoiceTable
            :data="store.filteredList"
            v-model:selected-ids="store.selectedIds"
            @edit="handleEdit"
            @delete="handleDelete"
          />
        </div>
      </n-card>

      <!-- 空状态提示 -->
      <div v-else class="empty-state">
        <n-icon size="64" color="#e0e0e0">
          <DocumentTextOutline />
        </n-icon>
        <n-text depth="3" style="font-size: 14px">
          还没有上传任何文件
        </n-text>
      </div>
    </n-space>

    <!-- 处理进度对话框 -->
    <progress-modal
    v-model:show="showProgressModal"
    :percentage="parseProgress"
    :current-file="currentFile"
    title="解析文件中..."
    mode="parse"
  />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import {
  NText,
  NSpace,
  NCard,
  NIcon,
  NRadioGroup,
  NRadioButton,
  NInput,
  NButton,
  useMessage,
  useDialog
} from 'naive-ui'
import { DocumentTextOutline, SearchOutline } from '@vicons/ionicons5'
import { useInvoiceStore } from '@/stores/invoice'
import { useFileParser } from '@/composables/useFileParser'
import { useFileExport } from '@/composables/useFileExport'
import { validateFile } from '@/utils/fileValidator'
import FileUploaderBatch from '@/components/Upload/FileUploaderBatch.vue'
import InvoiceTable from '@/components/Invoice/InvoiceTable.vue'
import ProgressModal from '@/components/Common/ProgressModal.vue'

const store = useInvoiceStore()
const message = useMessage()
const dialog = useDialog()
const { parseFile } = useFileParser()
const { isExporting, exportAsZip } = useFileExport()

const showProgressModal = ref(false)
const parseProgress = ref(0)
const currentFile = ref('')
const uploadQueue = ref<File[]>([])

/**
 * 处理文件上传
 */
async function handleFileUpload(files: File[]) {
  // 批量验证文件
  const validationErrors: string[] = []
  const validFiles: File[] = []

  for (const file of files) {
    const validation = validateFile(file)
    if (!validation.valid) {
      validationErrors.push(`${file.name}: ${validation.errors.join('; ')}`)
    } else {
      validFiles.push(file)
    }
  }

  // 显示验证错误
  if (validationErrors.length > 0) {
    message.error(`部分文件验证失败：\n${validationErrors.join('\n')}`, {
      duration: 5000
    })
  }

  // 如果没有有效文件，直接返回
  if (validFiles.length === 0) {
    if (validationErrors.length === files.length) {
      message.warning('所有文件验证失败，请检查文件格式和大小')
    }
    return
  }

  // 添加到队列
  uploadQueue.value.push(...validFiles)

  // 如果不在处理中，开始处理
  if (!store.isProcessing) {
    processUploadQueue()
  }
}

/**
 * 处理上传队列
 */
async function processUploadQueue() {
  if (uploadQueue.value.length === 0) {
    return
  }

  store.isProcessing = true
  showProgressModal.value = true

  const files = [...uploadQueue.value]
  uploadQueue.value = []

  const totalFiles = files.length
  let processed = 0

  for (const file of files) {
    try {
      // 更新当前处理的文件名
      currentFile.value = file.name
      
      // 解析文件
      const result = await parseFile(file)

      // 添加到 store
      store.addFile(file, result)

      processed++
      parseProgress.value = Math.round((processed / totalFiles) * 100)
    } catch (error) {
      console.error('文件处理失败:', error)
      message.error(`文件 ${file.name} 处理失败: ${(error as Error).message}`)
    }
  }

  store.isProcessing = false
  showProgressModal.value = false
  parseProgress.value = 0
  currentFile.value = ''

  message.success(`成功处理 ${processed} 个文件`)
}

/**
 * 编辑发票信息
 */
function handleEdit(id: string, updates: any) {
  store.updateFile(id, updates)
}

/**
 * 删除单个文件
 */
function handleDelete(id: string) {
  dialog.warning({
    title: '确认删除',
    content: '确定要删除这个文件吗？',
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: () => {
      store.removeFile(id)
      message.success('删除成功')
    }
  })
}

/**
 * 删除选中文件
 */
function handleDeleteSelected() {
  if (store.selectedIds.length === 0) {
    return
  }

  dialog.warning({
    title: '确认删除',
    content: `确定要删除选中的 ${store.selectedIds.length} 个文件吗？`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: () => {
      store.removeFiles(store.selectedIds)
      message.success('删除成功')
    }
  })
}

/**
 * 导出文件
 */
async function handleExport() {
  try {
    const result = await exportAsZip(store.fileList)

    if (result.success) {
      message.success(`成功导出 ${result.fileCount} 个文件: ${result.fileName}`)
    } else {
      message.error(`导出失败: ${result.error}`)
    }
  } catch (error) {
    message.error(`导出失败: ${(error as Error).message}`)
  }
}
</script>

<style scoped>
.page-container {
  max-width: 1400px;
  margin: 0 auto;
  padding: 24px;
}

.table-scroll-container {
  width: 100%;
  overflow-x: auto;
  overflow-y: visible;
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
