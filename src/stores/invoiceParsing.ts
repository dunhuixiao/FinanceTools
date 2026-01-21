/**
 * 发票号码解析数据状态管理
 */
import { defineStore } from 'pinia'
import { ref, computed, Ref, ComputedRef } from 'vue'
import type { InvoiceParseResult, TaxRate } from '@/types'

// 判断是否为开发环境
const isDev = import.meta.env.DEV

// 重新导出类型（保持向后兼容）
export type { InvoiceParseResult, TaxRate }

export interface InvoiceParsingStore {
  // 状态
  invoiceList: Ref<InvoiceParseResult[]>
  filterStatus: Ref<string>
  searchKeyword: Ref<string>
  selectedIds: Ref<string[]>
  isProcessing: Ref<boolean>
  
  // 计算属性
  filteredList: ComputedRef<InvoiceParseResult[]>
  successCount: ComputedRef<number>
  failedCount: ComputedRef<number>
  totalCount: ComputedRef<number>
  maxTaxRateCount: ComputedRef<number>
  selectedInvoices: ComputedRef<InvoiceParseResult[]>
  
  // 方法
  addInvoice: (invoice: InvoiceParseResult) => void
  updateInvoice: (id: string, updates: Partial<InvoiceParseResult>) => void
  removeInvoice: (id: string) => void
  removeInvoices: (ids: string[]) => void
  clearAll: () => void
  toggleSelection: (id: string) => void
  selectAll: () => void
  clearSelection: () => void
  setFilterStatus: (status: string) => void
  setSearchKeyword: (keyword: string) => void
}

export const useInvoiceParsingStore = defineStore('invoiceParsing', (): InvoiceParsingStore => {
  // 状态
  const invoiceList = ref<InvoiceParseResult[]>([])
  const filterStatus = ref<string>('all')
  const searchKeyword = ref<string>('')
  const selectedIds = ref<string[]>([])
  const isProcessing = ref<boolean>(false)
  
  // 计算属性
  const filteredList = computed(() => {
    let list = invoiceList.value
    
    // 按状态筛选
    if (filterStatus.value !== 'all') {
      list = list.filter(item => item.status === filterStatus.value)
    }
    
    // 按关键词搜索
    if (searchKeyword.value) {
      const keyword = searchKeyword.value.toLowerCase()
      list = list.filter(item => {
        return item.fileName.toLowerCase().includes(keyword) ||
               (item.invoiceNumber && item.invoiceNumber.toLowerCase().includes(keyword)) ||
               (item.amount && item.amount.toLowerCase().includes(keyword)) ||
               (item.totalAmount && item.totalAmount.toLowerCase().includes(keyword))
      })
    }
    
    return list
  })
  
  const successCount = computed(() => {
    return invoiceList.value.filter(item => item.status === 'success').length
  })
  
  const failedCount = computed(() => {
    return invoiceList.value.filter(item => item.status === 'failed').length
  })
  
  const totalCount = computed(() => {
    return invoiceList.value.length
  })
  
  // 计算最大税率数量（用于动态列展示）
  const maxTaxRateCount = computed(() => {
    let max = 0
    invoiceList.value.forEach(item => {
      if (item.taxRates && item.taxRates.length > max) {
        max = item.taxRates.length
      }
    })
    return max
  })
  
  // 获取选中的发票记录
  const selectedInvoices = computed(() => {
    return invoiceList.value.filter(item => selectedIds.value.includes(item.id))
  })
  
  // 方法
  function addInvoice(invoice: InvoiceParseResult): void {
    if (isDev) {
      console.log('[发票解析Store] 添加发票记录:', invoice.fileName)
    }
    
    invoiceList.value.push(invoice)
  }
  
  function updateInvoice(id: string, updates: Partial<InvoiceParseResult>): void {
    const index = invoiceList.value.findIndex(item => item.id === id)
    if (index !== -1) {
      invoiceList.value[index] = { ...invoiceList.value[index], ...updates }
      
      if (isDev) {
        console.log('[发票解析Store] 更新发票记录:', id)
      }
    }
  }
  
  function removeInvoice(id: string): void {
    const index = invoiceList.value.findIndex(item => item.id === id)
    if (index !== -1) {
      invoiceList.value.splice(index, 1)
    }
    
    // 同时从选中列表中移除
    const selectedIndex = selectedIds.value.indexOf(id)
    if (selectedIndex !== -1) {
      selectedIds.value.splice(selectedIndex, 1)
    }
    
    if (isDev) {
      console.log('[发票解析Store] 删除发票记录:', id)
    }
  }
  
  function removeInvoices(ids: string[]): void {
    ids.forEach(id => removeInvoice(id))
    
    if (isDev) {
      console.log('[发票解析Store] 批量删除发票记录:', ids.length, '条')
    }
  }
  
  function clearAll(): void {
    invoiceList.value = []
    selectedIds.value = []
    
    if (isDev) {
      console.log('[发票解析Store] 清空所有记录')
    }
  }
  
  function toggleSelection(id: string): void {
    const index = selectedIds.value.indexOf(id)
    if (index === -1) {
      selectedIds.value.push(id)
    } else {
      selectedIds.value.splice(index, 1)
    }
  }
  
  function selectAll(): void {
    selectedIds.value = filteredList.value.map(item => item.id)
    
    if (isDev) {
      console.log('[发票解析Store] 全选:', selectedIds.value.length, '条')
    }
  }
  
  function clearSelection(): void {
    selectedIds.value = []
    
    if (isDev) {
      console.log('[发票解析Store] 清空选中')
    }
  }
  
  function setFilterStatus(status: string): void {
    filterStatus.value = status
    
    if (isDev) {
      console.log('[发票解析Store] 设置筛选状态:', status)
    }
  }
  
  function setSearchKeyword(keyword: string): void {
    searchKeyword.value = keyword
  }
  
  return {
    // 状态
    invoiceList,
    filterStatus,
    searchKeyword,
    selectedIds,
    isProcessing,
    
    // 计算属性
    filteredList,
    successCount,
    failedCount,
    totalCount,
    maxTaxRateCount,
    selectedInvoices,
    
    // 方法
    addInvoice,
    updateInvoice,
    removeInvoice,
    removeInvoices,
    clearAll,
    toggleSelection,
    selectAll,
    clearSelection,
    setFilterStatus,
    setSearchKeyword
  }
})
