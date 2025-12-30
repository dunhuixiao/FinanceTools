/**
 * 发票PDF解析Composable
 * 提供批量解析能力和进度反馈
 * 支持基于坐标的智能解析 + 降级为正则解析
 */
import { ref, Ref } from 'vue'
import {
  extractTextWithCoordinates,
  extractInvoiceFieldsWithCoordinates,
  extractTextFromPDF,
  extractInvoiceFields,
  validateInvoiceData
} from '../utils/invoicePdfParser'
import { InvoiceParseResult } from '../stores/invoiceParsing'

// 批次大小（性能优化：每批10个文件）
const BATCH_SIZE = 10

// 进度回调函数类型
export type ProgressCallback = (progress: number, current: string) => void

// 解析状态
export interface ParserState {
  isProcessing: Ref<boolean>
  progress: Ref<number>
  currentFile: Ref<string>
}

/**
 * 发票PDF解析Composable
 */
export function useInvoicePdfParser() {
  const isProcessing = ref(false)
  const progress = ref(0)
  const currentFile = ref('')
  
  /**
   * 单个文件解析(支持坐标解析 + 降级机制)
   */
  async function parseInvoice(file: File): Promise<InvoiceParseResult> {
    const id = generateId()
    const parseTime = new Date().toISOString()
    
    try {
      // 文件验证：仅允许PDF格式，最大10MB
      if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
        throw new Error('仅支持PDF格式的发票文件')
      }
      
      if (file.size > 10 * 1024 * 1024) {
        throw new Error('文件大小超过限制（最大10MB）')
      }
      
      // 尝试坐标解析(新方法)
      let fields
      try {
        const pages = await extractTextWithCoordinates(file)
        fields = extractInvoiceFieldsWithCoordinates(pages)
      } catch (coordError) {
        // 降级为纯文本解析
        console.warn('[发票解析] 坐标解析失败,降级为正则解析:', (coordError as Error).message)
        const text = await extractTextFromPDF(file)
        fields = extractInvoiceFields(text)
      }
      
      // 验证数据
      const dataValidation = validateInvoiceData(fields)
      
      // 构建解析结果
      const result: InvoiceParseResult = {
        id,
        fileName: file.name,
        invoiceNumber: fields.invoiceNumber,
        invoiceType: fields.invoiceType,
        amount: fields.amount,
        taxAmount: fields.taxAmount,
        totalAmount: fields.totalAmount,
        taxRates: fields.taxRates,
        status: dataValidation.valid ? 'success' : 'failed',
        errorMessage: dataValidation.valid ? undefined : dataValidation.errors.join('; '),
        parseTime,
        originalFile: file
      }
      
      return result
    } catch (error) {
      console.error('[发票解析] 解析失败:', file.name, (error as Error).message)
      
      // 返回失败结果
      return {
        id,
        fileName: file.name,
        invoiceType: undefined,
        status: 'failed',
        errorMessage: (error as Error).message,
        parseTime,
        originalFile: file
      }
    }
  }
  
  /**
   * 批量解析（自动分批并发）
   */
  async function parseBatch(
    files: File[],
    onProgress?: ProgressCallback
  ): Promise<InvoiceParseResult[]> {
    console.log('[发票解析] 开始批量解析')
    
    isProcessing.value = true
    progress.value = 0
    
    const allResults: InvoiceParseResult[] = []
    
    try {
      // 分批处理
      const batches: File[][] = []
      for (let i = 0; i < files.length; i += BATCH_SIZE) {
        batches.push(files.slice(i, i + BATCH_SIZE))
      }
      
      let processedFiles = 0
      
      // 逐批处理（批次间串行，批次内并发）
      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex]
        
        // 批次内并发解析
        const batchResults = await Promise.all(
          batch.map(async (file) => {
            currentFile.value = file.name
            const result = await parseInvoice(file)
            
            // 更新进度（细粒度：每个文件完成后更新）
            processedFiles++
            const newProgress = Math.round((processedFiles / files.length) * 100)
            progress.value = newProgress
            
            if (onProgress) {
              onProgress(newProgress, file.name)
            }
            
            return result
          })
        )
        
        allResults.push(...batchResults)
      }
      
      console.log('[发票解析] 批量解析完成')
      
      return allResults
    } catch (error) {
      console.error('[发票解析] 批量解析错误:', (error as Error).message)
      throw error
    } finally {
      isProcessing.value = false
      progress.value = 0
      currentFile.value = ''
    }
  }
  
  /**
   * 生成唯一ID
   */
  function generateId(): string {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }
  
  return {
    // 状态
    isProcessing,
    progress,
    currentFile,
    
    // 方法
    parseInvoice,
    parseBatch
  }
}
