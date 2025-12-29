<template>
  <n-data-table
    :columns="tableColumns"
    :data="data"
    :pagination="pagination"
    :row-key="row => row.id"
    :scroll-x="scrollX"
    :loading="loading"
    :checked-row-keys="selectedIds"
    @update:checked-row-keys="handleCheck"
  />
</template>

<script setup lang="ts">
import { h, computed, ref } from 'vue'
import { NDataTable, NTag, NButton } from 'naive-ui'
import type { DataTableColumns, PaginationProps } from 'naive-ui'
import { InvoiceParseResult } from '../stores/invoiceParsing'

type RowKey = string | number

const props = defineProps<{
  data: InvoiceParseResult[]
  selectedIds: string[]
  loading?: boolean
  maxTaxRateCount: number
}>()

const emit = defineEmits<{
  'update:selectedIds': [keys: RowKey[]]
  'delete': [id: string]
}>()

const baseColumns: DataTableColumns<InvoiceParseResult> = [
  { type: 'selection' },
  {
    title: '序号',
    key: 'index',
    width: 80,
    render: (_: InvoiceParseResult, index: number) => index + 1
  },
  {
    title: '文件名',
    key: 'fileName',
    width: 200,
    ellipsis: { tooltip: true }
  },
  {
    title: '发票号码',
    key: 'invoiceNumber',
    width: 220,
    ellipsis: { tooltip: true },
    render: (row: InvoiceParseResult) => row.invoiceNumber || h('span', { style: 'color: #909399; font-size: 12px;' }, '-')
  },
  {
    title: '发票类型',
    key: 'invoiceType',
    width: 120,
    ellipsis: { tooltip: true },
    render: (row: InvoiceParseResult) => row.invoiceType || h('span', { style: 'color: #909399; font-size: 12px;' }, '-')
  },
  {
    title: '金额',
    key: 'amount',
    width: 120,
    render: (row: InvoiceParseResult) => row.amount ? '¥' + row.amount : h('span', { style: 'color: #909399; font-size: 12px;' }, '-')
  },
  {
    title: '税额',
    key: 'taxAmount',
    width: 120,
    render: (row: InvoiceParseResult) => row.taxAmount ? '¥' + row.taxAmount : h('span', { style: 'color: #909399; font-size: 12px;' }, '-')
  },
  {
    title: '价税合计',
    key: 'totalAmount',
    width: 120,
    render: (row: InvoiceParseResult) => row.totalAmount ? '¥' + row.totalAmount : h('span', { style: 'color: #909399; font-size: 12px;' }, '-')
  }
]

const dynamicTaxRateColumns = computed(() => {
  const cols: DataTableColumns<InvoiceParseResult> = []
  for (let i = 1; i <= props.maxTaxRateCount; i++) {
    cols.push({
      title: '税率' + i,
      key: 'taxRate' + i,
      width: 100,
      render: (row: InvoiceParseResult) => {
        if (row.taxRates && row.taxRates.length >= i) {
          return row.taxRates[i - 1].rate
        }
        return h('span', { style: 'color: #909399; font-size: 12px;' }, '-')
      }
    })
  }
  return cols
})

const trailingColumns: DataTableColumns<InvoiceParseResult> = [
  {
    title: '状态',
    key: 'status',
    width: 100,
    render: (row: InvoiceParseResult) => {
      const map: Record<string, { type: 'success' | 'error' | 'warning', text: string }> = {
        success: { type: 'success', text: '成功' },
        failed: { type: 'error', text: '失败' },
        pending: { type: 'warning', text: '待处理' }
      }
      const s = map[row.status] || map.pending
      return h(NTag, { type: s.type as any, size: 'small' }, { default: () => s.text })
    }
  },
  {
    title: '失败原因',
    key: 'errorMessage',
    width: 200,
    ellipsis: { tooltip: true },
    render: (row: InvoiceParseResult) => {
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
    render: (row: InvoiceParseResult) => h(NButton, { size: 'small', type: 'error', onClick: () => emit('delete', row.id) }, { default: () => '删除' })
  }
]

const tableColumns = computed(() => [...baseColumns, ...dynamicTaxRateColumns.value, ...trailingColumns])
const scrollX = computed(() => 910 + (props.maxTaxRateCount * 100) + 400)

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
