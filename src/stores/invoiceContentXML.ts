/**
 * XML发票内容解析状态管理
 * 管理项目明细行列表和相关操作
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { InvoiceContentItem } from '../types/invoiceContent'

export const useInvoiceContentXMLStore = defineStore('invoiceContentXML', () => {
  // ============================================================================
  // 状态定义
  // ============================================================================
  
  /** 项目行列表 */
  const itemList = ref<InvoiceContentItem[]>([])
  
  /** 选中的项目行ID列表 */
  const selectedIds = ref<string[]>([])
  
  /** 筛选状态 */
  const filterStatus = ref<string>('all')
  
  /** 搜索关键词 */
  const searchKeyword = ref<string>('')
  
  /** 是否正在处理 */
  const isProcessing = ref<boolean>(false)
  
  // ============================================================================
  // 计算属性
  // ============================================================================
  
  /** 筛选后的列表 */
  const filteredList = computed(() => {
    let list = itemList.value
    
    // 状态筛选
    if (filterStatus.value !== 'all') {
      list = list.filter(item => item.status === filterStatus.value)
    }
    
    // 关键词搜索
    if (searchKeyword.value.trim()) {
      const keyword = searchKeyword.value.trim().toLowerCase()
      list = list.filter(item =>
        item.sourceFileName.toLowerCase().includes(keyword) ||
        item.sourceInvoiceNumber?.toLowerCase().includes(keyword) ||
        item.goodsName?.toLowerCase().includes(keyword) ||
        item.specification?.toLowerCase().includes(keyword)
      )
    }
    
    return list
  })
  
  /** 成功数量 */
  const successCount = computed(() =>
    itemList.value.filter(item => item.status === 'success').length
  )
  
  /** 失败数量 */
  const failedCount = computed(() =>
    itemList.value.filter(item => item.status === 'failed').length
  )
  
  /** 总数量 */
  const totalCount = computed(() => itemList.value.length)
  
  /** 选中的项目 */
  const selectedItems = computed(() =>
    itemList.value.filter(item => selectedIds.value.includes(item.id))
  )
  
  /** 文件数量（去重） */
  const fileCount = computed(() =>
    new Set(itemList.value.map(item => item.sourceFileId)).size
  )
  
  // ============================================================================
  // 方法
  // ============================================================================
  
  /**
   * 批量添加项目行
   */
  function addItems(items: InvoiceContentItem[]): void {
    itemList.value.push(...items)
  }
  
  /**
   * 删除单个项目行
   */
  function removeItem(id: string): void {
    const index = itemList.value.findIndex(item => item.id === id)
    if (index !== -1) {
      itemList.value.splice(index, 1)
    }
    // 同时从选中列表移除
    const selectedIndex = selectedIds.value.indexOf(id)
    if (selectedIndex !== -1) {
      selectedIds.value.splice(selectedIndex, 1)
    }
  }
  
  /**
   * 批量删除项目行
   */
  function removeItems(ids: string[]): void {
    itemList.value = itemList.value.filter(item => !ids.includes(item.id))
    selectedIds.value = selectedIds.value.filter(id => !ids.includes(id))
  }
  
  /**
   * 删除某个文件的所有项目行
   */
  function removeByFileId(fileId: string): void {
    const idsToRemove = itemList.value
      .filter(item => item.sourceFileId === fileId)
      .map(item => item.id)
    removeItems(idsToRemove)
  }
  
  /**
   * 清空所有数据
   */
  function clearAll(): void {
    itemList.value = []
    selectedIds.value = []
    filterStatus.value = 'all'
    searchKeyword.value = ''
  }
  
  /**
   * 更新选中项
   */
  function setSelectedIds(ids: string[]): void {
    selectedIds.value = ids
  }
  
  /**
   * 设置筛选状态
   */
  function setFilterStatus(status: string): void {
    filterStatus.value = status
  }
  
  /**
   * 设置搜索关键词
   */
  function setSearchKeyword(keyword: string): void {
    searchKeyword.value = keyword
  }
  
  /**
   * 设置处理状态
   */
  function setProcessing(processing: boolean): void {
    isProcessing.value = processing
  }
  
  return {
    // 状态
    itemList,
    selectedIds,
    filterStatus,
    searchKeyword,
    isProcessing,
    
    // 计算属性
    filteredList,
    successCount,
    failedCount,
    totalCount,
    selectedItems,
    fileCount,
    
    // 方法
    addItems,
    removeItem,
    removeItems,
    removeByFileId,
    clearAll,
    setSelectedIds,
    setFilterStatus,
    setSearchKeyword,
    setProcessing
  }
})
