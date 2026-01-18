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
    class="invoice-content-table"
  />
</template>

<script setup lang="ts">
import { h, computed, ref } from 'vue'
import { NDataTable, NButton } from 'naive-ui'
import type { DataTableColumns, PaginationProps } from 'naive-ui'
import type { InvoiceContentItem } from '@/types'

type RowKey = string | number

const props = defineProps<{
  data: InvoiceContentItem[]
  selectedIds: string[]
  loading?: boolean
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

// 格式化数量
function formatQuantity(quantity: string | undefined): string {
  if (!quantity) return '-'
  const num = parseFloat(quantity)
  if (isNaN(num)) return quantity
  // 如果是整数则不显示小数
  if (Number.isInteger(num)) {
    return num.toLocaleString('zh-CN')
  }
  return num.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 6 })
}

// 发票类型标签配置
const typeTagConfig: Record<string, { bg: string, color: string }> = {
  '专票': { bg: '#DBEAFE', color: '#1E40AF' },
  '普票': { bg: '#D1FAE5', color: '#065F46' }
}

// 表格列配置
const tableColumns = computed<DataTableColumns<InvoiceContentItem>>(() => [
  { type: 'selection' },
  {
    title: '序号',
    key: 'index',
    width: 80,
    align: 'center',
    render: (_: InvoiceContentItem, index: number) => index + 1
  },
  {
    title: '文件名',
    key: 'sourceFileName',
    width: 200,
    ellipsis: { tooltip: true }
  },
  {
    title: '发票号码',
    key: 'sourceInvoiceNumber',
    width: 200,
    ellipsis: { tooltip: true },
    render: (row: InvoiceContentItem) =>
      row.sourceInvoiceNumber
        ? h('span', { style: 'font-family: "Courier New", monospace; font-weight: bold;' }, row.sourceInvoiceNumber)
        : h('span', { style: 'color: #9CA3AF; font-size: 12px;' }, '-')
  },
  {
    title: '发票日期',
    key: 'sourceInvoiceDate',
    width: 120,
    align: 'center',
    render: (row: InvoiceContentItem) =>
      row.sourceInvoiceDate
        ? h('span', {}, row.sourceInvoiceDate)
        : h('span', { style: 'color: #9CA3AF; font-size: 12px;' }, '-')
  },
  {
    title: '发票类型',
    key: 'sourceInvoiceType',
    width: 120,
    align: 'center',
    render: (row: InvoiceContentItem) => {
      if (!row.sourceInvoiceType) {
        return h('span', { style: 'color: #9CA3AF; font-size: 12px;' }, '-')
      }
      const config = typeTagConfig[row.sourceInvoiceType] || { bg: '#FEF3C7', color: '#92400E' }
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
      }, row.sourceInvoiceType)
    }
  },
  {
    title: '货物或服务名称',
    key: 'goodsName',
    width: 200,
    ellipsis: { tooltip: true },
    render: (row: InvoiceContentItem) =>
      row.goodsName
        ? h('span', {}, row.goodsName)
        : h('span', { style: 'color: #9CA3AF; font-size: 12px;' }, '-')
  },
  {
    title: '规格型号',
    key: 'specification',
    width: 120,
    ellipsis: { tooltip: true },
    render: (row: InvoiceContentItem) =>
      row.specification
        ? h('span', {}, row.specification)
        : h('span', { style: 'color: #9CA3AF; font-size: 12px;' }, '-')
  },
  {
    title: '单位',
    key: 'unit',
    width: 80,
    align: 'center',
    render: (row: InvoiceContentItem) =>
      row.unit
        ? h('span', {}, row.unit)
        : h('span', { style: 'color: #9CA3AF; font-size: 12px;' }, '-')
  },
  {
    title: '数量',
    key: 'quantity',
    width: 100,
    align: 'right',
    render: (row: InvoiceContentItem) => {
      if (!row.quantity) {
        return h('span', { style: 'color: #9CA3AF; font-size: 12px;' }, '-')
      }
      return h('span', { style: 'font-family: monospace; font-variant-numeric: tabular-nums;' }, formatQuantity(row.quantity))
    }
  },
  {
    title: '单价',
    key: 'unitPrice',
    width: 120,
    align: 'right',
    render: (row: InvoiceContentItem) => {
      if (!row.unitPrice) {
        return h('span', { style: 'color: #9CA3AF; font-size: 12px;' }, '-')
      }
      return h('div', { style: 'font-family: monospace; font-variant-numeric: tabular-nums; text-align: right;' }, [
        h('span', { style: 'font-size: 0.9em; color: var(--n-text-color-disabled); margin-right: 2px;' }, '¥'),
        h('span', { style: 'color: var(--amount-color);' }, formatAmount(row.unitPrice))
      ])
    }
  },
  {
    title: '金额',
    key: 'amount',
    width: 120,
    align: 'right',
    render: (row: InvoiceContentItem) => {
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
    title: '税率/征收率',
    key: 'taxRate',
    width: 100,
    align: 'center',
    render: (row: InvoiceContentItem) => {
      if (!row.taxRate) {
        return h('span', { style: 'color: #9CA3AF; font-size: 12px;' }, '-')
      }
      // 免税特殊样式
      if (row.taxRate === '免税') {
        return h('span', {
          style: 'background-color: #FEF3C7; color: #92400E; font-size: 0.75rem; font-weight: 500; padding: 0.125rem 0.5rem; border-radius: 0.25rem;'
        }, row.taxRate)
      }
      return h('span', {}, row.taxRate)
    }
  },
  {
    title: '税额',
    key: 'taxAmount',
    width: 120,
    align: 'right',
    render: (row: InvoiceContentItem) => {
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
    title: '操作',
    key: 'actions',
    width: 100,
    fixed: 'right',
    render: (row: InvoiceContentItem) => h(NButton, { size: 'small', type: 'error', onClick: () => emit('delete', row.id) }, { default: () => '删除' })
  }
])

// 计算表格横向滚动距离
const scrollX = computed(() => {
  // 勾选框50 + 序号80 + 文件名200 + 发票号码200 + 发票日期120 + 发票类型120 + 货物名称200 + 规格型号120 + 单位80 + 数量100 + 单价120 + 金额120 + 税率100 + 税额120 + 操作100
  return 50 + 80 + 200 + 200 + 120 + 120 + 200 + 120 + 80 + 100 + 120 + 120 + 100 + 120 + 100
})

// 分页配置
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
.invoice-content-table {
  border: none;
}

/* 自定义CSS变量 - 灰度层次设计（专业风格） */
.invoice-content-table {
  --amount-color: #374151;
  --tax-amount-color: #6B7280;
}

/* 深色模式下的金额颜色 */
html.dark .invoice-content-table {
  --amount-color: #E5E7EB;
  --tax-amount-color: #9CA3AF;
}

/* 表头样式 */
.invoice-content-table :deep(.n-data-table-th) {
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
.invoice-content-table :deep(.n-data-table-td) {
  padding: 1rem 0.75rem !important;
  border-bottom: 1px solid var(--n-border-color) !important;
  border-right: none !important;
}

/* Hover效果 */
.invoice-content-table :deep(.n-data-table-tr:hover .n-data-table-td) {
  background-color: var(--n-td-color-hover) !important;
  transition: background-color 0.2s;
}

/* 选中行样式 */
.invoice-content-table :deep(.n-data-table-tr.n-data-table-tr--selected .n-data-table-td) {
  background-color: var(--n-td-color-checked) !important;
}

/* 选中行的Hover样式 */
.invoice-content-table :deep(.n-data-table-tr.n-data-table-tr--selected:hover .n-data-table-td) {
  background-color: var(--n-td-color-checked-hover) !important;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .invoice-content-table :deep(.n-data-table-td),
  .invoice-content-table :deep(.n-data-table-th) {
    padding: 0.75rem 0.5rem !important;
  }
}
</style>
