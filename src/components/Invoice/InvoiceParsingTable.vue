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
    class="invoice-parsing-table"
  />
</template>

<script setup lang="ts">
import { h, computed, ref } from 'vue'
import { NDataTable, NTag, NButton } from 'naive-ui'
import type { DataTableColumns, PaginationProps } from 'naive-ui'
import type { InvoiceParseResult } from '@/types'

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

// 格式化金额(添加千分位分隔符)
function formatAmount(amount: string | undefined): string {
  if (!amount) return '-'
  const num = parseFloat(amount)
  if (isNaN(num)) return amount
  return num.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// 发票类型标签配置（电子普通发票也归类为普票）
const typeTagConfig: Record<string, { bg: string, color: string }> = {
  '专票': { bg: '#DBEAFE', color: '#1E40AF' },
  '普票': { bg: '#D1FAE5', color: '#065F46' }
}

const baseColumns: DataTableColumns<InvoiceParseResult> = [
  { type: 'selection' },
  {
    title: '序号',
    key: 'index',
    width: 80,
    align: 'center',
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
    render: (row: InvoiceParseResult) => 
      row.invoiceNumber 
        ? h('span', { style: 'font-family: "Courier New", monospace; font-weight: bold;' }, row.invoiceNumber)
        : h('span', { style: 'color: #9CA3AF; font-size: 12px;' }, '-')
  },
  {
    title: '发票类型',
    key: 'invoiceType',
    width: 120,
    align: 'center',
    render: (row: InvoiceParseResult) => {
      if (!row.invoiceType) {
        return h('span', { style: 'color: #9CA3AF; font-size: 12px;' }, '-')
      }
      const config = typeTagConfig[row.invoiceType] || { bg: '#FEF3C7', color: '#92400E' }
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
    title: '金额',
    key: 'amount',
    width: 130,
    align: 'right',
    render: (row: InvoiceParseResult) => {
      if (!row.amount) {
        return h('span', { style: 'color: #9CA3AF; font-size: 12px;' }, '-')
      }
      return h('div', { style: 'font-family: monospace; font-variant-numeric: tabular-nums; text-align: right;' }, [
        h('span', { style: 'font-size: 0.9em; color: var(--n-text-color-disabled); margin-right: 2px;' }, '¥'),
        h('span', { style: 'color: var(--amount-color);' }, formatAmount(row.amount))
      ])
    }
  },
  {
    title: '税额',
    key: 'taxAmount',
    width: 130,
    align: 'right',
    render: (row: InvoiceParseResult) => {
      if (!row.taxAmount) {
        return h('span', { style: 'color: #9CA3AF; font-size: 12px;' }, '-')
      }
      return h('div', { style: 'font-family: monospace; font-variant-numeric: tabular-nums; text-align: right;' }, [
        h('span', { style: 'font-size: 0.9em; color: var(--n-text-color-disabled); margin-right: 2px;' }, '¥'),
        h('span', { style: 'color: var(--tax-amount-color);' }, formatAmount(row.taxAmount))
      ])
    }
  },
  {
    title: '价税合计',
    key: 'totalAmount',
    width: 140,
    align: 'right',
    render: (row: InvoiceParseResult) => {
      if (!row.totalAmount) {
        return h('span', { style: 'color: #9CA3AF; font-size: 12px;' }, '-')
      }
      return h('div', { style: 'font-family: monospace; font-variant-numeric: tabular-nums; text-align: right; font-weight: 600;' }, [
        h('span', { style: 'font-size: 0.9em; color: var(--n-text-color-disabled); margin-right: 2px; font-weight: 400;' }, '¥'),
        h('span', { style: 'color: var(--total-amount-color);' }, formatAmount(row.totalAmount))
      ])
    }
  }
]

const dynamicTaxRateColumns = computed(() => {
  const cols: DataTableColumns<InvoiceParseResult> = []
  for (let i = 1; i <= props.maxTaxRateCount; i++) {
    cols.push({
      title: '税率' + i,
      key: 'taxRate' + i,
      width: 100,
      align: 'center',
      render: (row: InvoiceParseResult) => {
        if (row.taxRates && row.taxRates.length >= i) {
          return row.taxRates[i - 1].rate
        }
        return h('span', { style: 'color: #9CA3AF; font-size: 12px;' }, '-')
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
    align: 'center',
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
      return h('span', { style: 'color: #9CA3AF; font-size: 12px;' }, '-')
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

<style scoped>
/* 表格整体样式优化 */
.invoice-parsing-table {
  border: none;
}

/* 自定义CSS变量 - 灰度层次设计（专业风格） */
.invoice-parsing-table {
  --amount-color: #374151; /* 浅色模式: gray-700 (次要信息) */
  --tax-amount-color: #6B7280; /* 浅色模式: gray-500 (三级信息) */
  --total-amount-color: #111827; /* 浅色模式: gray-900 (主要信息，最高对比度) */
}

/* 深色模式下的金额颜色 - 修复可见性问题 */
html.dark .invoice-parsing-table {
  --amount-color: #E5E7EB; /* 深色模式: gray-200 (高可见性) */
  --tax-amount-color: #9CA3AF; /* 深色模式: gray-400 (可见但微妙) */
  --total-amount-color: #FFFFFF; /* 深色模式: white (纯白突出显示) */
}

/* 表头样式 */
.invoice-parsing-table :deep(.n-data-table-th) {
  background-color: var(--n-th-color) !important;
  border-bottom: 2px solid var(--n-border-color) !important;
  padding: 1rem 0.75rem !important;
  font-size: 0.75rem !important;
  font-weight: 600 !important;
  color: var(--n-th-text-color) !important;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-right: none !important;
}

/* 表格行样式 */
.invoice-parsing-table :deep(.n-data-table-td) {
  padding: 1rem 0.75rem !important;
  border-bottom: 1px solid var(--n-border-color) !important;
  border-right: none !important;
}

/* Hover效果 - 支持深色模式 */
.invoice-parsing-table :deep(.n-data-table-tr:hover .n-data-table-td) {
  background-color: var(--n-td-color-hover) !important;
  transition: background-color 0.2s;
}

/* 选中行样式 - 支持深色模式 */
.invoice-parsing-table :deep(.n-data-table-tr.n-data-table-tr--selected .n-data-table-td) {
  background-color: var(--n-td-color-checked) !important;
}

/* 选中行的Hover样式 */
.invoice-parsing-table :deep(.n-data-table-tr.n-data-table-tr--selected:hover .n-data-table-td) {
  background-color: var(--n-td-color-checked-hover) !important;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .invoice-parsing-table :deep(.n-data-table-td),
  .invoice-parsing-table :deep(.n-data-table-th) {
    padding: 0.75rem 0.5rem !important;
  }
}
</style>
