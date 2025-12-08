/**
 * 文件导出组合式函数
 */
import { ref, Ref } from 'vue'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'

interface InvoiceItem {
  status: string
  newFileName: string
  originalFileName: string
  originalFile: File
}

interface ExportResult {
  success: boolean
  fileCount?: number
  fileName?: string
  error?: string
}

export function useFileExport() {
  const isExporting: Ref<boolean> = ref(false)
  
  /**
   * 导出文件为 ZIP
   */
  async function exportAsZip(invoiceList: InvoiceItem[], exportAll = false): Promise<ExportResult> {
    isExporting.value = true
    
    try {
      const zip = new JSZip()
      
      // 过滤要导出的文件
      const filesToExport = exportAll 
        ? invoiceList 
        : invoiceList.filter(item => item.status === 'success')
      
      if (filesToExport.length === 0) {
        throw new Error('没有可导出的文件')
      }
      
      // 添加文件到 ZIP
      for (const item of filesToExport) {
        const fileName = item.status === 'success' ? item.newFileName : item.originalFileName
        zip.file(fileName, item.originalFile)
      }
      
      // 生成 ZIP 文件
      const blob = await zip.generateAsync({ type: 'blob' })
      
      // 生成文件名
      const now = new Date()
      const dateStr = formatDate(now)
      const zipFileName = `发票重命名_${dateStr}.zip`
      
      // 下载文件
      saveAs(blob, zipFileName)
      
      return {
        success: true,
        fileCount: filesToExport.length,
        fileName: zipFileName
      }
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message
      }
    } finally {
      isExporting.value = false
    }
  }
  
  /**
   * 格式化日期为字符串
   */
  function formatDate(date: Date): string {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    const seconds = String(date.getSeconds()).padStart(2, '0')
    
    return `${year}${month}${day}_${hours}${minutes}${seconds}`
  }
  
  return {
    isExporting,
    exportAsZip
  }
}
