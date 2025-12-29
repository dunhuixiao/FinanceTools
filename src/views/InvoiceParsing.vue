<template>
  <div class="page-container">
    <n-space vertical size="large">
      <!-- 文件上传卡片 -->
      <n-card title="上传发票文件" size="small">
        <file-uploader-batch
          accept="application/pdf,.pdf"
          :disabled="store.isProcessing"
          description="支持PDF格式,单个文件不超过10MB"
          @upload="handleUpload"
        />
      </n-card>

      <!-- 解析结果卡片 -->
      <n-card title="解析结果" size="small" v-if="store.totalCount > 0">
        <!-- 操作栏 -->
        <n-space justify="space-between" align="center" style="margin-bottom: 16px">
          <n-space>
            <n-radio-group v-model:value="store.filterStatus" @update:value="store.setFilterStatus">
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
              placeholder="搜索文件名、发票号..."
              clearable
              style="width: 250px"
              @update:value="store.setSearchKeyword"
            >
              <template #prefix>
                <n-icon><search-outline /></n-icon>
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
            <n-dropdown
              trigger="click"
              :options="exportOptions"
              @select="handleExportSelect"
            >
              <n-button
                type="primary"
                :disabled="store.successCount === 0"
                :loading="isExporting"
              >
                导出
                <template #icon>
                  <n-icon><chevron-down-outline /></n-icon>
                </template>
              </n-button>
            </n-dropdown>
          </n-space>
        </n-space>

        <!-- 表格 -->
        <invoice-parsing-table
          :data="store.filteredList"
          :selected-ids="store.selectedIds"
          :loading="store.isProcessing"
          :max-tax-rate-count="store.maxTaxRateCount"
          @update:selected-ids="handleSelectedIdsUpdate"
          @delete="handleDelete"
        />
      </n-card>

      <!-- 空状态提示 -->
      <div v-else class="empty-state">
        <n-icon size="64" color="#e0e0e0">
          <document-text-outline />
        </n-icon>
        <n-text depth="3" style="font-size: 14px">
          还没有上传任何发票文件
        </n-text>
      </div>
    </n-space>
  </div>

  <!-- 处理进度对话框 -->
    <n-modal
      v-model:show="showProgressModal"
      :mask-closable="false"
      preset="card"
      title="解析文件中..."
      style="width: 400px"
    >
      <n-space vertical>
        <n-progress
          type="line"
          :percentage="parseProgress"
          :indicator-placement="'inside'"
        />
        <n-text>正在解析: {{ parseProgress }}%</n-text>
        <n-text depth="3" style="font-size: 12px" v-if="currentFile">
          当前文件: {{ currentFile }}
        </n-text>
      </n-space>
    </n-modal>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import {
  NSpace,
  NCard,
  NButton,
  NRadioGroup,
  NRadioButton,
  NInput,
  NIcon,
  NText,
  NModal,
  NProgress,
  NDropdown,
  useMessage,
  useDialog
} from 'naive-ui'
import { SearchOutline, DocumentTextOutline, ChevronDownOutline } from '@vicons/ionicons5'
import FileUploaderBatch from '../components/FileUploaderBatch.vue'
import InvoiceParsingTable from '../components/InvoiceParsingTable.vue'
import { useInvoiceParsingStore } from '../stores/invoiceParsing'
import { useInvoicePdfParser } from '../composables/useInvoicePdfParser'
import { useDataExport } from '../composables/useDataExport'

const message = useMessage()
const dialog = useDialog()

const store = useInvoiceParsingStore()
const { parseBatch, currentFile } = useInvoicePdfParser()
const { exportData, isExporting } = useDataExport()

const showProgressModal = ref(false)
const parseProgress = ref(0)

// 导出选项
const exportOptions = computed(() => [
  {
    label: 'Excel格式',
    key: 'excel',
    children: [
      { label: '导出全部', key: 'excel-all' },
      { label: '导出成功记录', key: 'excel-success' },
      { label: '导出选中记录', key: 'excel-selected', disabled: store.selectedIds.length === 0 }
    ]
  },
  {
    label: 'JSON格式',
    key: 'json',
    children: [
      { label: '导出全部', key: 'json-all' },
      { label: '导出成功记录', key: 'json-success' },
      { label: '导出选中记录', key: 'json-selected', disabled: store.selectedIds.length === 0 }
    ]
  }
])

/**
 * 处理选中项更新
 */
function handleSelectedIdsUpdate(keys: (string | number)[]) {
  store.selectedIds = keys.map(key => String(key))
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

  store.isProcessing = true
  showProgressModal.value = true

  try {
    const results = await parseBatch(files, (prog, file) => {
      parseProgress.value = prog
      currentFile.value = file
    })

    // 添加到store
    results.forEach(result => {
      store.addInvoice(result)
    })

    const successCount = results.filter(r => r.status === 'success').length
    const failedCount = results.filter(r => r.status === 'failed').length

    message.success(`解析完成！成功: ${successCount} 个，失败: ${failedCount} 个`)
  } catch (error) {
    console.error('解析失败:', error)
    message.error(`批量解析失败: ${(error as Error).message}`)
  } finally {
    store.isProcessing = false
    showProgressModal.value = false
    parseProgress.value = 0
    currentFile.value = ''
  }
}

/**
 * 删除单个文件
 */
function handleDelete(id: string) {
  dialog.warning({
    title: '确认删除',
    content: '确定要删除这个解析记录吗？',
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: () => {
      store.removeInvoice(id)
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
    content: `确定要删除选中的 ${store.selectedIds.length} 个解析记录吗？`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: () => {
      store.removeInvoices([...store.selectedIds])
      message.success('删除成功')
    }
  })
}

/**
 * 处理导出选择
 */
async function handleExportSelect(key: string) {
  const [format, mode] = key.split('-') as ['excel' | 'json', 'all' | 'success' | 'selected']
  
  // 根据模式获取要导出的数据
  let dataToExport = store.invoiceList
  
  if (mode === 'success') {
    dataToExport = store.invoiceList.filter(item => item.status === 'success')
  } else if (mode === 'selected') {
    dataToExport = store.selectedInvoices
  }
  
  if (dataToExport.length === 0) {
    message.warning('没有可导出的数据')
    return
  }
  
  try {
    const result = await exportData(dataToExport, format, '发票解析结果')
    
    if (result.success) {
      message.success(`导出成功！共 ${result.recordCount} 条记录`)
    } else {
      message.error(`导出失败：${result.error}`)
    }
  } catch (error) {
    console.error('导出错误:', error)
    message.error(`导出失败：${(error as Error).message}`)
  }
}
</script>

<style scoped>
.page-container {
  max-width: 1400px;
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
