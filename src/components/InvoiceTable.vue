<template>
  <n-data-table
    :columns="columns"
    :data="data"
    :pagination="pagination"
    :row-key="row => row.id"
    :scroll-x="1448"
    @update:checked-row-keys="handleCheck"
  />
</template>

<script setup lang="ts">
import { h, ref } from 'vue'
import { NDataTable, NTag, NButton, NInput } from 'naive-ui'
import type { DataTableColumns, PaginationProps } from 'naive-ui'

type RowKey = string | number

interface InvoiceRow {
  id: string
  originalFileName: string
  invoiceType: string
  purchaserName: string
  totalAmount: string
  newFileName: string
  status: 'success' | 'failed' | 'pending'
  errorMessage: string
}

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
