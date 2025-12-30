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

const columns: DataTableColumns<InvoiceRow> = [
  {
    type: 'selection'
  },
  {
    title: '序号',
    key: 'index',
    width: 80,
    render: (_: InvoiceRow, index: number) => {
      return index + 1
    }
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
    width: 150,
    ellipsis: {
      tooltip: true
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
    width: 120,
    render: (row: InvoiceRow) => {
      return h(NInput, {
        value: row.totalAmount,
        size: 'small',
        onUpdateValue: (value: string) => {
          emit('edit', row.id, { totalAmount: value })
        }
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
  background-color: #F9FAFB !important;
  border-bottom: 2px solid #E5E7EB !important;
  padding: 1rem 0.75rem !important;
  font-size: 0.75rem !important;
  font-weight: 600 !important;
  color: #6B7280 !important;
  text-transform: uppercase !important;
  letter-spacing: 0.05em !important;
  border-right: none !important;
}

/* 表格行样式 */
.invoice-rename-table :deep(.n-data-table-td) {
  padding: 1rem 0.75rem !important;
  border-bottom: 1px solid #F3F4F6 !important;
  border-right: none !important;
}

/* Hover效果 */
.invoice-rename-table :deep(.n-data-table-tr:hover .n-data-table-td) {
  background-color: #F3F4F6 !important;
  transition: background-color 0.2s;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .invoice-rename-table :deep(.n-data-table-td),
  .invoice-rename-table :deep(.n-data-table-th) {
    padding: 0.75rem 0.5rem !important;
  }
}
</style>
