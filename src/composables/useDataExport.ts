/**
 * 数据导出Composable
 * 支持Excel和JSON格式导出
 */
import { ref } from 'vue'
import * as XLSX from 'xlsx'
import { saveAs } from 'file-saver'
import { InvoiceParseResult } from '../stores/invoiceParsing'
import type { InvoiceContentItem } from '../types/invoiceContent'

// 判断是否为开发环境
const isDev = import.meta.env.DEV

// 导出结果
export interface ExportResult {
  success: boolean
  recordCount?: number
  fileName?: string
  error?: string
}

// JSON格式化后的发票数据（移除不可序列化字段和状态信息）
export interface InvoiceJSONFormat {
  id: string
  fileName: string
  invoiceNumber?: string
  invoiceType?: string
  amount?: string
  taxAmount?: string
  totalAmount?: string
  taxRates?: Array<{ rate: string; amount?: string; index: number }>
  parseTime: string
}

/**
 * 数据导出Composable
 */
export function useDataExport() {
  const isExporting = ref(false)
  
  /**
   * 导出为Excel
   */
  async function exportToExcel(
    data: InvoiceParseResult[],
    filename: string
  ): Promise<ExportResult> {
    const startTime = isDev ? performance.now() : 0
    
    if (isDev) {
      console.log('[数据导出] 开始导出Excel:', data.length, '条记录')
    }
    
    isExporting.value = true
    
    try {
      if (data.length === 0) {
        throw new Error('没有可导出的数据')
      }
      
      // 计算最大税率数量
      const maxTaxRateCount = Math.max(
        ...data.map(item => item.taxRates?.length || 0),
        1
      )
      
      // 生成表头
      const headers = generateExcelHeaders(maxTaxRateCount)
      
      // 转换数据为二维数组
      const rows = transformDataForExcel(data, maxTaxRateCount)
      
      // 创建工作表
      const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows])
      
      // 设置列宽
      worksheet['!cols'] = [
        { wch: 8 },   // 序号
        { wch: 30 },  // 文件名
        { wch: 22 },  // 发票号码
        { wch: 10 },  // 发票类型
        { wch: 15 },  // 金额
        { wch: 15 },  // 税额
        { wch: 15 },  // 价税合计
        ...Array(maxTaxRateCount).fill({ wch: 12 })  // 税率列
      ]
      
      // 创建工作簿
      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, worksheet, '发票号码解析结果')
      
      // 生成Excel文件
      const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
      const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      
      // 生成文件名（带时间戳）
      const timestamp = formatTimestamp(new Date())
      const fullFilename = `${filename}_${timestamp}.xlsx`
      
      // 触发下载
      saveAs(blob, fullFilename)
      
      if (isDev) {
        const endTime = performance.now()
        console.log(`[性能] Excel导出: ${data.length}条记录, 耗时: ${((endTime - startTime) / 1000).toFixed(2)}s`)
      } else {
        console.log('[数据导出] Excel导出完成')
      }
      
      return {
        success: true,
        recordCount: data.length,
        fileName: fullFilename
      }
    } catch (error) {
      console.error('[数据导出] Excel导出失败:', (error as Error).message)
      return {
        success: false,
        error: (error as Error).message
      }
    } finally {
      isExporting.value = false
    }
  }
  
  /**
   * 导出为JSON
   */
  async function exportToJSON(
    data: InvoiceParseResult[],
    filename: string
  ): Promise<ExportResult> {
    const startTime = isDev ? performance.now() : 0
    
    if (isDev) {
      console.log('[数据导出] 开始导出JSON:', data.length, '条记录')
    }
    
    isExporting.value = true
    
    try {
      if (data.length === 0) {
        throw new Error('没有可导出的数据')
      }
      
      // 转换数据为JSON格式（移除不可序列化字段）
      const jsonData = transformDataForJSON(data)
      
      // 格式化JSON（缩进2空格）
      const jsonString = JSON.stringify(jsonData, null, 2)
      
      // 创建Blob
      const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8' })
      
      // 生成文件名（带时间戳）
      const timestamp = formatTimestamp(new Date())
      const fullFilename = `${filename}_${timestamp}.json`
      
      // 触发下载
      saveAs(blob, fullFilename)
      
      if (isDev) {
        const endTime = performance.now()
        console.log(`[性能] JSON导出: ${data.length}条记录, 耗时: ${((endTime - startTime) / 1000).toFixed(2)}s`)
      } else {
        console.log('[数据导出] JSON导出完成')
      }
      
      return {
        success: true,
        recordCount: data.length,
        fileName: fullFilename
      }
    } catch (error) {
      console.error('[数据导出] JSON导出失败:', (error as Error).message)
      return {
        success: false,
        error: (error as Error).message
      }
    } finally {
      isExporting.value = false
    }
  }
  
  /**
   * 统一导出接口
   */
  async function exportData(
    data: InvoiceParseResult[],
    format: 'excel' | 'json',
    filename: string = '发票号码解析结果'
  ): Promise<ExportResult> {
    if (format === 'excel') {
      return exportToExcel(data, filename)
    } else {
      return exportToJSON(data, filename)
    }
  }
  
  return {
    isExporting,
    exportToExcel,
    exportToJSON,
    exportData
  }
}

/**
 * 生成Excel表头
 */
function generateExcelHeaders(maxTaxRateCount: number): string[] {
  const headers = [
    '序号',
    '文件名',
    '发票号码',
    '发票类型',
    '金额',
    '税额',
    '价税合计'
  ]
  
  // 添加动态税率列
  for (let i = 1; i <= maxTaxRateCount; i++) {
    headers.push(`税率${i}`)
  }
  
  return headers
}

/**
 * 将数据转换为Excel二维数组格式
 */
function transformDataForExcel(
  data: InvoiceParseResult[],
  maxTaxRateCount: number
): any[][] {
  return data.map((item, index) => {
    const row: any[] = [
      index + 1,
      item.fileName,
      item.invoiceNumber || '-',
      item.invoiceType || '-',
      item.amount || '-',
      item.taxAmount || '-',
      item.totalAmount || '-'
    ]
    
    // 添加税率列
    for (let i = 1; i <= maxTaxRateCount; i++) {
      if (item.taxRates && item.taxRates.length >= i) {
        row.push(item.taxRates[i - 1].rate)
      } else {
        row.push('-')
      }
    }
    
    return row
  })
}

/**
 * 将数据转换为JSON格式（移除不可序列化字段和状态信息）
 */
function transformDataForJSON(data: InvoiceParseResult[]): InvoiceJSONFormat[] {
  return data.map(item => ({
    id: item.id,
    fileName: item.fileName,
    invoiceNumber: item.invoiceNumber,
    invoiceType: item.invoiceType,
    amount: item.amount,
    taxAmount: item.taxAmount,
    totalAmount: item.totalAmount,
    taxRates: item.taxRates,
    parseTime: item.parseTime
    // 不包含 originalFile、status、errorMessage 字段
  }))
}

/**
 * 格式化时间戳
 */
function formatTimestamp(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')
  
  return `${year}${month}${day}_${hours}${minutes}${seconds}`
}

/**
 * 发票内容导出Composable
 * 专门用于导出发票项目明细行
 */
export function useContentExport() {
  const isExporting = ref(false)
  
  /**
   * 导出发票内容项目行为Excel
   * @param items - 要导出的数据项
   * @param filename - 文件名前缀
   * @param isFullExport - 是否为全部导出模式（用于文件名标识）
   */
  async function exportInvoiceContent(
    items: InvoiceContentItem[],
    filename: string = '发票内容明细',
    isFullExport: boolean = false
  ): Promise<ExportResult> {
    const startTime = isDev ? performance.now() : 0
    
    if (isDev) {
      console.log('[数据导出] 开始导出发票内容:', items.length, '条记录')
    }
    
    isExporting.value = true
    
    try {
      if (items.length === 0) {
        throw new Error('没有可导出的数据')
      }
      
      // 生成表头
      const headers = [
        '序号',
        '文件名',
        '发票号码',
        '发票日期',
        '发票类型',
        '货物或服务名称',
        '规格型号',
        '单位',
        '数量',
        '单价',
        '金额',
        '税率/征收率',
        '税额'
      ]
      
      // 转换数据为二维数组
      const rows = items.map((item, index) => [
        index + 1,
        item.sourceFileName,
        item.sourceInvoiceNumber || '-',
        item.sourceInvoiceDate || '-',
        item.sourceInvoiceType || '-',
        item.goodsName || '-',
        item.specification || '-',
        item.unit || '-',
        item.quantity || '-',
        item.unitPrice || '-',
        item.amount || '-',
        item.taxRate || '-',
        item.taxAmount || '-'
      ])
      
      // 创建工作表
      const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows])
      
      // 设置列宽
      worksheet['!cols'] = [
        { wch: 8 },   // 序号
        { wch: 30 },  // 文件名
        { wch: 22 },  // 发票号码
        { wch: 12 },  // 发票日期
        { wch: 10 },  // 发票类型
        { wch: 30 },  // 货物或服务名称
        { wch: 15 },  // 规格型号
        { wch: 8 },   // 单位
        { wch: 12 },  // 数量
        { wch: 15 },  // 单价
        { wch: 15 },  // 金额
        { wch: 12 },  // 税率/征收率
        { wch: 15 }   // 税额
      ]
      
      // 创建工作簿
      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, worksheet, '发票内容明细')
      
      // 生成Excel文件
      const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
      const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      
      // 生成文件名（带时间戳，全部导出模式添加标识）
      const timestamp = formatTimestamp(new Date())
      const exportSuffix = isFullExport ? '_全部导出' : ''
      const fullFilename = `${filename}${exportSuffix}_${timestamp}.xlsx`
      
      // 触发下载
      saveAs(blob, fullFilename)
      
      if (isDev) {
        const endTime = performance.now()
        console.log(`[性能] 内容导出: ${items.length}条记录, 耗时: ${((endTime - startTime) / 1000).toFixed(2)}s`)
      } else {
        console.log('[数据导出] 发票内容导出完成')
      }
      
      return {
        success: true,
        recordCount: items.length,
        fileName: fullFilename
      }
    } catch (error) {
      console.error('[数据导出] 发票内容导出失败:', (error as Error).message)
      return {
        success: false,
        error: (error as Error).message
      }
    } finally {
      isExporting.value = false
    }
  }
  
  return {
    isExporting,
    exportInvoiceContent
  }
}
