/**
 * PDF 解析工具
 */
import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

// 配置 PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker

// 判断是否为开发环境
const isDev = import.meta.env.DEV

interface InvoiceData {
  invoiceType: string | null
  invoiceCode: string | null
  purchaserName: string | null
  sellerName: string | null
  totalAmount: string | null
  issueDate: string | null
}

interface ValidationResult {
  valid: boolean
  errors: string[]
  data?: InvoiceData
}

/**
 * 从 PDF 文件提取文本
 */
export async function extractTextFromPDF(file: File): Promise<string> {
  try {
    console.log('[PDF解析] 开始读取文件')
    if (isDev) console.log('[PDF解析] 文件名:', file.name)
    
    const arrayBuffer = await readFileAsArrayBuffer(file)
    console.log('[PDF解析] 文件读取成功')
    if (isDev) console.log('[PDF解析] 文件大小:', arrayBuffer.byteLength)
    
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
    console.log('[PDF解析] PDF加载成功')
    if (isDev) console.log('[PDF解析] 页数:', pdf.numPages)
    
    let fullText = ''
    
    // 提取所有页面的文本
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i)
      const textContent = await page.getTextContent()
      const pageText = textContent.items.map((item: any) => item.str).join(' ')
      fullText += pageText + '\n'
    }
    
    console.log('[PDF解析] 文本提取成功')
    if (isDev) {
      console.log('[PDF解析] 文本长度:', fullText.length)
      console.log('[PDF解析] 文本预览:', fullText.substring(0, 500))
    }
    
    return fullText
  } catch (error) {
    console.error('[PDF解析] 错误:', error)
    throw new Error(`PDF 文本提取失败: ${(error as Error).message}`)
  }
}

/**
 * 从 PDF 文本中提取发票信息
 */
export function extractInvoiceDataFromText(text: string): InvoiceData {
  const data: InvoiceData = {
    invoiceType: null,
    invoiceCode: null,
    purchaserName: null,
    sellerName: null,
    totalAmount: null,
    issueDate: null
  }
  
  try {
    console.log('[发票解析] 开始提取发票信息')
    // 仅在开发模式下输出详细调试信息
    if (isDev) {
      console.log('[发票解析] 原始文本:', text)
    }
    
    // 提取发票类型(文档开头的标题)
    const invoiceTypeMatch = text.match(/电子发票[（(]([^)）]+)[)）]/)
    if (invoiceTypeMatch) {
      data.invoiceType = invoiceTypeMatch[1]
      if (isDev) console.log('[发票解析] 发票类型:', data.invoiceType)
    } else if (isDev) {
      console.warn('[发票解析] 未找到发票类型')
    }
    
    // 提取发票号码(独立的数字序列)
    const invoiceCodeMatch = text.match(/发票号码[：:]\s*(\d{20,})/)
    if (invoiceCodeMatch) {
      data.invoiceCode = invoiceCodeMatch[1]
      if (isDev) console.log('[发票解析] 发票号码:', data.invoiceCode)
    }
    
    // 提取开票日期
    const issueDateMatch = text.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/)
    if (issueDateMatch) {
      data.issueDate = `${issueDateMatch[1]}年${issueDateMatch[2]}月${issueDateMatch[3]}日`
      if (isDev) console.log('[发票解析] 开票日期:', data.issueDate)
    }
    
    // 提取购买方名称
    const purchaserMatch = text.match(/([\u4e00-\u9fa5]{4,50}(?:公司|企业|厂|院|中心|所|分公司))\s+91\d{16}/)
    if (purchaserMatch) {
      data.purchaserName = purchaserMatch[1].trim()
      if (isDev) console.log('[发票解析] 购买方名称:', data.purchaserName)
    } else {
      // 备用方案:直接查找第一个以公司结尾的名称
      const altMatch = text.match(/([\u4e00-\u9fa5]{4,50}(?:公司|企业|厂|院|中心|所|分公司))/)
      if (altMatch) {
        data.purchaserName = altMatch[1].trim()
        if (isDev) console.log('[发票解析] 购买方名称(备用方案):', data.purchaserName)
      } else if (isDev) {
        console.warn('[发票解析] 未找到购买方名称')
      }
    }
    
    // 提取销售方名称(第二个公司名称)
    const allCompanies = text.match(/([\u4e00-\u9fa5]{4,50}(?:公司|企业|厂|院|中心|所|分公司))\s+91\d{16}/g)
    if (allCompanies && allCompanies.length >= 2) {
      const sellerMatch = allCompanies[1].match(/([\u4e00-\u9fa5]{4,50}(?:公司|企业|厂|院|中心|所|分公司))/)
      if (sellerMatch) {
        data.sellerName = sellerMatch[1].trim()
        if (isDev) console.log('[发票解析] 销售方名称:', data.sellerName)
      }
    }
    
    // 提取价税合计(大小写两种形式)
    const totalAmountPattern = /(价税合计|合\s*计)[:：\s]*[(（](大写|小写)[)）][:：\s]*[￥$¥]?\s*([\d,\.\s]+)/g
    let match
    while ((match = totalAmountPattern.exec(text)) !== null) {
      // 获取金额部分并清理格式
      const amountStr = match[3].replace(/\s+/g, '').replace(/,/g, '')
      if (amountStr && !isNaN(parseFloat(amountStr))) {
        data.totalAmount = amountStr
        console.log('[发票解析] 价税合计:', data.totalAmount)
        break // 找到第一个有效的金额就停止
      }
    }

    // 如果上述方法未找到，则尝试备用方案
    if (!data.totalAmount) {
      // 查找文本末尾附近的金额
      const endIndex = text.lastIndexOf('备注')
      const searchText = endIndex > -1 ? text.substring(0, endIndex) : text
      const amountMatches = searchText.match(/[￥$¥]\s*([\d,.]+)/g)
      if (amountMatches && amountMatches.length > 0) {
        const lastAmount = amountMatches[amountMatches.length - 1]
        const amountMatch = lastAmount.match(/[￥$¥]\s*([\d,.]+)/)
        if (amountMatch) {
          data.totalAmount = amountMatch[1].replace(/,/g, '')
          console.log('[发票解析] 价税合计(备用方案):', data.totalAmount)
        }
      }
    }
    
    if (isDev && !data.totalAmount) {
      console.warn('[发票解析] 未找到价税合计')
    }
    
    console.log('[发票解析] 信息提取完成')
    // 仅在开发模式下输出详细调试信息
    if (isDev) {
      console.log('[发票解析] 提取结果:', data)
    }
    return data
  } catch (error) {
    console.error('[发票解析] 错误:', error)
    throw new Error(`发票信息提取失败: ${(error as Error).message}`)
  }
}

/**
 * 解析 PDF 发票文件
 */
export async function parsePDFInvoice(file: File): Promise<InvoiceData> {
  try {
    const text = await extractTextFromPDF(file)
    const data = extractInvoiceDataFromText(text)
    return data
  } catch (error) {
    throw new Error(`PDF 发票解析失败: ${(error as Error).message}`)
  }
}

/**
 * 读取文件为 ArrayBuffer
 */
function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    
    reader.onload = (e) => {
      resolve(e.target!.result as ArrayBuffer)
    }
    
    reader.onerror = () => {
      reject(new Error('文件读取失败'))
    }
    
    reader.readAsArrayBuffer(file)
  })
}

/**
 * 验证 PDF 发票数据
 */
export function validatePDFInvoiceData(data: InvoiceData): ValidationResult {
  const errors: string[] = []
  
  // 只验证命名规则需要的必填字段：购买方名称和金额
  if (!data.purchaserName) {
    errors.push('缺少购买方名称')
  }
  
  if (!data.totalAmount) {
    errors.push('缺少金额')
  }
  
  console.log('[PDF验证] 验证完成:', errors.length === 0 ? '通过' : '失败')
  if (isDev) {
    console.log('[PDF验证] 验证详情:', {
      valid: errors.length === 0,
      errors,
      data
    })
  }
  
  return {
    valid: errors.length === 0,
    errors,
    data
  }
}
