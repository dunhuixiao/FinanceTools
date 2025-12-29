/**
 * 文件解析组合式函数
 */
import { ref, Ref } from 'vue'
import { parseXMLFile, extractInvoiceData, validateInvoiceData } from '@/utils/xmlParser'
import { parsePDFInvoice, validatePDFInvoiceData } from '@/utils/pdfParser'

interface ParseResult {
  success: boolean
  data: any
  errors: string[]
  type: 'pdf' | 'xml' | 'unknown'
}

export function useFileParser() {
  const isProcessing: Ref<boolean> = ref(false)
  const progress: Ref<number> = ref(0)
  
  /**
   * 解析单个文件
   */
  async function parseFile(file: File): Promise<ParseResult> {
    const isPDF = file.name.toLowerCase().endsWith('.pdf')
    const isXML = file.name.toLowerCase().endsWith('.xml')
    
    try {
      if (isPDF) {
        // 解析 PDF 文件
        const data = await parsePDFInvoice(file)
        const validation = validatePDFInvoiceData(data)
        
        return {
          success: validation.valid,
          data,
          errors: validation.errors,
          type: 'pdf'
        }
      } else if (isXML) {
        // 解析 XML 文件
        const xmlData = await parseXMLFile(file)
        const data = extractInvoiceData(xmlData)
        const validation = validateInvoiceData(data)
        
        return {
          success: validation.valid,
          data,
          errors: validation.errors,
          type: 'xml'
        }
      } else {
        return {
          success: false,
          data: null,
          errors: ['不支持的文件格式'],
          type: 'unknown'
        }
      }
    } catch (error) {
      return {
        success: false,
        data: null,
        errors: [(error as Error).message],
        type: isPDF ? 'pdf' : isXML ? 'xml' : 'unknown'
      }
    }
  }
  
  /**
   * 批量解析文件
   */
  async function parseFiles(files: File[], onProgress?: (progress: number) => void): Promise<ParseResult[]> {
    isProcessing.value = true
    progress.value = 0
    
    const results: ParseResult[] = []
    const batchSize = 10 // 每批处理 10 个文件
    
    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize)
      
      // 并行处理当前批次
      const batchResults = await Promise.all(
        batch.map(file => parseFile(file))
      )
      
      results.push(...batchResults)
      
      // 更新进度
      progress.value = Math.round(((i + batch.length) / files.length) * 100)
      
      if (onProgress) {
        onProgress(progress.value)
      }
    }
    
    isProcessing.value = false
    progress.value = 100
    
    return results
  }
  
  return {
    isProcessing,
    progress,
    parseFile,
    parseFiles
  }
}
