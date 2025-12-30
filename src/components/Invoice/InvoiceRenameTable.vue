<template>
  <n-data-table
    :columns="columns"
    :data="data"
    :pagination="pagination"
    :row-key="row => row.id"
    :scroll-x="1448"
    @update:checked-row-keys="handleCheck"
    class="invoice-rename-table"
  />
</template>

<script setup lang="ts">
import { h, ref } from 'vue'
import { NDataTable, NTag, NButton, NInput } from 'naive-ui'
import type { DataTableColumns, PaginationProps } from 'naive-ui'
import type { InvoiceRow } from '@/types'

type RowKey = string | number

const props = defineProps<{
  data: InvoiceRow[]
  selectedIds: string[]
}>()

const emit = defineEmits<{
  'update:selectedIds': [keys: RowKey[]]
  'edit': [id: string, updates: any]
  'delete': [id: string]
}>()

// 发票类型标签配置（电子普通发票也归类为普票）
const typeTagConfig: Record<string, { bg: string, color: string }> = {
  '专票': { bg: '#DBEAFE', color: '#1E40AF' },
  '普票': { bg: '#D1FAE5', color: '#065F46' }
}

const columns: DataTableColumns<InvoiceRow> = [
  {
    type: 'selection'
  },
  {
    title: '序号',
    key: 'index',
    width: 80,
    align: 'center',
    render: (_: InvoiceRow, index: number) => index + 1
  },
  {
    title: '原文件名',
    key: 'originalFileName',
    width: 200,
    ellipsis: {
      tooltip: true
    }
  },
  {
    title: '发票类型',
    key: 'invoiceType',
    width: 120,
    align: 'center',
    render: (row: InvoiceRow) => {
      console.log('[InvoiceRenameTable] 渲染发票类型:', row.invoiceType, '（类型:', typeof row.invoiceType, '）')
      if (!row.invoiceType) {
        console.log('[InvoiceRenameTable] 发票类型为空')
        return h('span', { style: 'color: #9CA3AF; font-size: 12px;' }, '-')
      }
      const config = typeTagConfig[row.invoiceType] || { bg: '#FEF3C7', color: '#92400E' }
      console.log('[InvoiceRenameTable] 使用配置:', config, '（发票类型:', row.invoiceType, '）')
      return h('span', {
        style: `
          background-color: ${config.bg};
          color: ${config.color};
          font-size: 0.75rem;
          font-weight: 500;
          padding: 0.125rem 0.625rem;
          border-radius: 0.25rem;
          display: inline-block;
        `
      }, row.invoiceType)
    }
  },
  {
    title: '购买方名称',
    key: 'purchaserName',
    width: 200,
    ellipsis: {
      tooltip: true
    },
    render: (row: InvoiceRow) => {
      return h(NInput, {
        value: row.purchaserName,
        size: 'small',
        onUpdateValue: (value: string) => {
          emit('edit', row.id, { purchaserName: value })
        }
      })
    }
  },
  {
    title: '金额',
    key: 'totalAmount',
    width: 140,
    align: 'right',
    render: (row: InvoiceRow) => {
      return h(NInput, {
        value: row.totalAmount,
        size: 'small',
        style: 'text-align: right;',
        onUpdateValue: (value: string) => {
          emit('edit', row.id, { totalAmount: value })
        }
      }, {
        prefix: () => h('span', { 
          style: 'font-size: 0.9em; color: var(--n-text-color-disabled);' 
        }, '￥')
      })
    }
  },
  {
    title: '新文件名',
    key: 'newFileName',
    width: 250,
    ellipsis: {
      tooltip: true
    },
    render: (row: InvoiceRow) => {
      return h(NInput, {
        value: row.newFileName,
        size: 'small',
        onUpdateValue: (value: string) => {
          emit('edit', row.id, { newFileName: value })
        }
      })
    }
  },
  {
    title: '状态',
    key: 'status',
    width: 100,
    align: 'center',
    render: (row: InvoiceRow) => {
      const statusMap: Record<string, { type: 'success' | 'error' | 'warning', text: string }> = {
        success: { type: 'success', text: '成功' },
        failed: { type: 'error', text: '失败' },
        pending: { type: 'warning', text: '待处理' }
      }
      const status = statusMap[row.status] || statusMap.pending
      return h(NTag, { type: status.type as any, size: 'small' }, { default: () => status.text })
    }
  },
  {
    title: '失败原因',
    key: 'errorMessage',
    width: 200,
    ellipsis: {
      tooltip: true
    },
    render: (row: InvoiceRow) => {
      if (row.status === 'failed' && row.errorMessage) {
        return h('span', { style: 'color: #f56c6c; font-size: 12px;' }, row.errorMessage)
      }
      return h('span', { style: 'color: #909399; font-size: 12px;' }, '-')
    }
  },
  {
    title: '操作',
    key: 'actions',
    width: 100,
    fixed: 'right',
    render: (row: InvoiceRow) => {
      return h(
        NButton,
        {
          size: 'small',
          type: 'error',
          onClick: () => emit('delete', row.id)
        },
        { default: () => '删除' }
      )
    }
  }
]

const pagination = ref<PaginationProps>({
  page: 1,
  pageSize: 20,
  showSizePicker: true,
  pageSizes: [20, 50, 100],
  onChange: (page: number) => {
    pagination.value.page = page
  },
  onUpdatePageSize: (pageSize: number) => {
    pagination.value.pageSize = pageSize
    pagination.value.page = 1
  }
})

function handleCheck(keys: RowKey[]) {
  emit('update:selectedIds', keys)
}
</script>

<style scoped>
/* 表格整体样式优化 */
.invoice-rename-table {
  border: none;
}

/* 表头样式 */
.invoice-rename-table :deep(.n-data-table-th) {
  background-color: var(--n-th-color) !important;
  border-bottom: 2px solid var(--n-border-color) !important;
  padding: 1rem 0.75rem !important;
  font-size: 0.75rem !important;
  font-weight: 600 !important;
  color: var(--n-th-text-color) !important;
  text-transform: uppercase !important;
  letter-spacing: 0.05em !important;
  border-right: none !important;
}

/* 表格行样式 */
.invoice-rename-table :deep(.n-data-table-td) {
  padding: 1rem 0.75rem !important;
  border-bottom: 1px solid var(--n-border-color) !important;
  border-right: none !important;
}

/* Hover效果 - 支持深色模式 */
.invoice-rename-table :deep(.n-data-table-tr:hover .n-data-table-td) {
  background-color: var(--n-td-color-hover) !important;
  transition: background-color 0.2s;
}

/* 选中行样式 - 支持深色模式 */
.invoice-rename-table :deep(.n-data-table-tr.n-data-table-tr--selected .n-data-table-td) {
  background-color: var(--n-td-color-checked) !important;
}

/* 选中行的Hover样式 */
.invoice-rename-table :deep(.n-data-table-tr.n-data-table-tr--selected:hover .n-data-table-td) {
  background-color: var(--n-td-color-checked-hover) !important;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .invoice-rename-table :deep(.n-data-table-td),
  .invoice-rename-table :deep(.n-data-table-th) {
    padding: 0.75rem 0.5rem !important;
  }
}
</style>
