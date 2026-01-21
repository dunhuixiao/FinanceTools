/**
 * XML发票内容解析Composable
 * 提供单文件和批量解析功能
 */
import { ref } from 'vue'
import { extractInvoiceContentFromXML } from '../utils/invoiceContentXMLParser'
import type { InvoiceContentItem, InvoiceContentParseResult } from '../types/invoiceContent'

// 判断是否为开发环境
const isDev = import.meta.env.DEV

// 批量处理配置
const BATCH_SIZE = 10  // 每批处理的文件数
const MAX_FILE_SIZE = 10 * 1024 * 1024  // 最大文件大小 10MB

/**
 * XML发票内容解析Composable
 */
export function useInvoiceContentXMLParser() {
  const isProcessing = ref(false)
  const currentFile = ref<string>('')
  const progress = ref(0)
  
  /**
   * 生成文件唯一标识
   */
  function generateFileId(): string {
    return 'file-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9)
  }
  
  /**
   * 验证文件
   */
  function validateFile(file: File): { valid: boolean; error?: string } {
    // 检查文件类型
    const isXML = file.type.includes('xml') || 
                  file.type === 'text/xml' || 
                  file.type === 'application/xml' ||
                  file.name.toLowerCase().endsWith('.xml')
    
    if (!isXML) {
      return { valid: false, error: '仅支持XML格式文件' }
    }
    
    // 检查文件大小
    if (file.size > MAX_FILE_SIZE) {
      return { valid: false, error: `文件大小超过${MAX_FILE_SIZE / 1024 / 1024}MB限制` }
    }
    
    return { valid: true }
  }
  
  /**
   * 解析单个文件
   */
  async function parseContent(file: File): Promise<InvoiceContentParseResult> {
    const fileId = generateFileId()
    const startTime = isDev ? performance.now() : 0
    
    // 验证文件
    const validation = validateFile(file)
    if (!validation.valid) {
      return {
        fileId,
        fileName: file.name,
        items: [],
        status: 'failed',
        errorMessage: validation.error,
        parseTime: new Date().toISOString()
      }
    }
    
    try {
      const items = await extractInvoiceContentFromXML(file, fileId)
      
      if (isDev) {
        const endTime = performance.now()
        console.log(`[性能] XML解析 ${file.name}: ${items.length}行, 耗时: ${((endTime - startTime) / 1000).toFixed(2)}s`)
      }
      
      // 统计成功和失败的项目
      const successItems = items.filter(item => item.status === 'success')
      const hasSuccess = successItems.length > 0
      
      return {
        fileId,
        fileName: file.name,
        invoiceNumber: successItems[0]?.sourceInvoiceNumber,
        invoiceDate: successItems[0]?.sourceInvoiceDate,
        items,
        status: hasSuccess ? 'success' : 'failed',
        errorMessage: hasSuccess ? undefined : '未解析到项目明细',
        parseTime: new Date().toISOString()
      }
    } catch (error) {
      console.error('[XML内容解析] 文件解析失败:', file.name, (error as Error).message)
      
      return {
        fileId,
        fileName: file.name,
        items: [],
        status: 'failed',
        errorMessage: (error as Error).message,
        parseTime: new Date().toISOString()
      }
    }
  }
  
  /**
   * 批量解析文件
   * @param files 文件数组
   * @param onProgress 进度回调
   * @returns 所有项目行
   */
  async function parseContentBatch(
    files: File[],
    onProgress?: (current: number, total: number, fileName: string) => void
  ): Promise<{
    items: InvoiceContentItem[]
    results: InvoiceContentParseResult[]
  }> {
    const totalStartTime = isDev ? performance.now() : 0
    
    isProcessing.value = true
    progress.value = 0
    
    const allItems: InvoiceContentItem[] = []
    const allResults: InvoiceContentParseResult[] = []
    const total = files.length
    
    if (isDev) {
      console.log(`[批量XML解析] 开始处理 ${total} 个文件`)
    }
    
    try {
      // 分批处理
      for (let batchStart = 0; batchStart < total; batchStart += BATCH_SIZE) {
        const batchEnd = Math.min(batchStart + BATCH_SIZE, total)
        const batch = files.slice(batchStart, batchEnd)
        
        // 并行处理当前批次
        const batchPromises = batch.map(async (file, index) => {
          const globalIndex = batchStart + index
          currentFile.value = file.name
          
          if (onProgress) {
            onProgress(globalIndex + 1, total, file.name)
          }
          
          return parseContent(file)
        })
        
        const batchResults = await Promise.all(batchPromises)
        
        // 收集结果
        for (const result of batchResults) {
          allResults.push(result)
          allItems.push(...result.items)
        }
        
        // 更新进度
        progress.value = Math.round((batchEnd / total) * 100)
      }
      
      if (isDev) {
        const totalEndTime = performance.now()
        const successCount = allResults.filter(r => r.status === 'success').length
        console.log(`[性能] 批量XML解析完成: ${total}文件, ${allItems.length}行, 成功${successCount}个, 耗时: ${((totalEndTime - totalStartTime) / 1000).toFixed(2)}s`)
      }
      
      return { items: allItems, results: allResults }
    } finally {
      isProcessing.value = false
      currentFile.value = ''
      progress.value = 100
    }
  }
  
  return {
    isProcessing,
    currentFile,
    progress,
    parseContent,
    parseContentBatch
  }
}
