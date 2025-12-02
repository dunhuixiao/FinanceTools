/**
 * 发票数据状态管理
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { generateFileName } from '@/utils/nameGenerator'

// 判断是否为开发环境
const isDev = import.meta.env.DEV

export const useInvoiceStore = defineStore('invoice', () => {
  // 状态
  const fileList = ref([])
  const filterStatus = ref('all')
  const searchKeyword = ref('')
  const selectedIds = ref([])
  const isProcessing = ref(false)
  
  // 计算属性
  const filteredList = computed(() => {
    let list = fileList.value
    
    // 按状态筛选
    if (filterStatus.value !== 'all') {
      list = list.filter(item => item.status === filterStatus.value)
    }
    
    // 按关键词搜索
    if (searchKeyword.value) {
      const keyword = searchKeyword.value.toLowerCase()
      list = list.filter(item => {
        return item.originalFileName.toLowerCase().includes(keyword) ||
               (item.newFileName && item.newFileName.toLowerCase().includes(keyword)) ||
               (item.purchaserName && item.purchaserName.toLowerCase().includes(keyword))
      })
    }
    
    return list
  })
  
  const successCount = computed(() => {
    return fileList.value.filter(item => item.status === 'success').length
  })
  
  const failedCount = computed(() => {
    return fileList.value.filter(item => item.status === 'failed').length
  })
  
  const totalCount = computed(() => {
    return fileList.value.length
  })
  
  // 方法
  function addFile(file, parseResult) {
    const id = generateId()
    const originalFileName = file.name
    const originalExtension = originalFileName.substring(originalFileName.lastIndexOf('.'))
    
    console.log('[Store] 添加文件')
    if (isDev) console.log('[Store] 文件名:', originalFileName, '解析结果:', parseResult)
    
    let newFileName = ''
    let status = 'pending'
    let errorMessage = ''
    
    if (parseResult.success) {
      try {
        newFileName = generateFileName(parseResult.data, originalExtension)
        status = 'success'
        console.log('[Store] 文件名生成成功')
        if (isDev) console.log('[Store] 新文件名:', newFileName)
      } catch (error) {
        status = 'failed'
        errorMessage = error.message
        console.error('[Store] 文件名生成失败:', error)
      }
    } else {
      status = 'failed'
      errorMessage = parseResult.errors.join('; ')
      console.log('[Store] 解析失败:', errorMessage)
    }
    
    const invoiceItem = {
      id,
      originalFile: file,
      originalFileName,
      invoiceType: parseResult.data?.invoiceType || '',
      purchaserName: parseResult.data?.purchaserName || '',
      totalAmount: parseResult.data?.totalAmount || '',
      newFileName,
      status,
      errorMessage
    }
    
    if (isDev) console.log('[Store] 数据项:', invoiceItem)
    
    fileList.value.push(invoiceItem)
    return invoiceItem
  }
  
  function updateFile(id, updates) {
    const index = fileList.value.findIndex(item => item.id === id)
    if (index !== -1) {
      fileList.value[index] = { ...fileList.value[index], ...updates }
      
      // 如果更新了发票数据，重新生成文件名
      if (updates.purchaserName || updates.totalAmount) {
        try {
          const item = fileList.value[index]
          const originalExtension = item.originalFileName.substring(item.originalFileName.lastIndexOf('.'))
          const newFileName = generateFileName({
            purchaserName: item.purchaserName,
            totalAmount: item.totalAmount
          }, originalExtension)
          fileList.value[index].newFileName = newFileName
          fileList.value[index].status = 'success'
          fileList.value[index].errorMessage = ''
        } catch (error) {
          fileList.value[index].status = 'failed'
          fileList.value[index].errorMessage = error.message
        }
      }
    }
  }
  
  function removeFile(id) {
    const index = fileList.value.findIndex(item => item.id === id)
    if (index !== -1) {
      fileList.value.splice(index, 1)
    }
    
    // 同时从选中列表中移除
    const selectedIndex = selectedIds.value.indexOf(id)
    if (selectedIndex !== -1) {
      selectedIds.value.splice(selectedIndex, 1)
    }
  }
  
  function removeFiles(ids) {
    ids.forEach(id => removeFile(id))
  }
  
  function clearAll() {
    fileList.value = []
    selectedIds.value = []
  }
  
  function toggleSelection(id) {
    const index = selectedIds.value.indexOf(id)
    if (index === -1) {
      selectedIds.value.push(id)
    } else {
      selectedIds.value.splice(index, 1)
    }
  }
  
  function selectAll() {
    selectedIds.value = filteredList.value.map(item => item.id)
  }
  
  function clearSelection() {
    selectedIds.value = []
  }
  
  function setFilterStatus(status) {
    filterStatus.value = status
  }
  
  function setSearchKeyword(keyword) {
    searchKeyword.value = keyword
  }
  
  function generateId() {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }
  
  return {
    // 状态
    fileList,
    filterStatus,
    searchKeyword,
    selectedIds,
    isProcessing,
    
    // 计算属性
    filteredList,
    successCount,
    failedCount,
    totalCount,
    
    // 方法
    addFile,
    updateFile,
    removeFile,
    removeFiles,
    clearAll,
    toggleSelection,
    selectAll,
    clearSelection,
    setFilterStatus,
    setSearchKeyword
  }
})
