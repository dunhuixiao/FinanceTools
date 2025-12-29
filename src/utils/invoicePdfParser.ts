/**
 * 发票PDF解析工具
 * 专注于从PDF发票中提取关键字段信息
 */
import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { TaxRate } from '../stores/invoiceParsing'

// ============================================================================
// 配置常量
// ============================================================================

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker

const isDev = import.meta.env.DEV
const MAX_PAGES_QUICK_PARSE = 3

// ============================================================================
// 字段提取模式常量（按优先级排序）
// ============================================================================

// 发票号码匹配模式
const INVOICE_NUMBER_PATTERNS: RegExp[] = [
  /发票号码[：:]\s*(\d{20})/,
  /No\.\s*(\d{20})/i,
  /(\d{20})/
]

// 金额匹配模式
const AMOUNT_PATTERNS: RegExp[] = [
  /不含税金额[：:]\s*[￥$¥]?\s*([\d,]+\.?\d*)/,
  /金额[：:]\s*[￥$¥]?\s*([\d,]+\.?\d*)/,
  /小计[：:]\s*[￥$¥]?\s*([\d,]+\.?\d*)/,
  /[￥¥]\s*[\d,]+\.\d+\s+[￥¥]\s*([\d,]+\.\d+)\s+[￥¥]\s*[\d,]+\.\d+/,  // 多页发票：取第二个
  /[￥¥]\s*([\d,]+\.\d+)\s+[￥¥]\s*[\d,]+\.\d+/,  // 单页发票：取第一个
  /合\s+计[：:\s]*[￥$¥]?\s*([\d,]+\.\d+)/,
  /合计[：:\s]*[￥$¥]?\s*([\d,]+\.\d+)/
]

// 税额匹配模式
const TAX_AMOUNT_PATTERNS: RegExp[] = [
  /税额[：:]\s*[￥$¥]?\s*([\d,]+\.?\d*)/,
  /税金[：:]\s*[￥$¥]?\s*([\d,]+\.?\d*)/,
  /[￥¥]\s*[\d,]+\.\d+\s+[￥¥]\s*[\d,]+\.\d+\s+[￥¥]\s*([\d,]+\.\d+)/,  // 第三个金额
  /[￥¥]\s*[\d,]+\.\d+\s+[￥¥]\s*([\d,]+\.\d+)/,  // 第二个金额
  /合\s+计[：:\s]*[￥$¥]?\s*[\d,]+\.\d+\s+[￥$¥]?\s*([\d,]+\.\d+)/,
  /合计[：:\s]*[￥$¥]?\s*[\d,]+\.\d+\s+[￥$¥]?\s*([\d,]+\.\d+)/
]

// 价税合计匹配模式
const TOTAL_AMOUNT_PATTERNS: RegExp[] = [
  /[(（]小写[)）][￥¥]\s*([\d,]+\.\d+)/,  // "(小写)¥754.85"
  /[(（]小写[)）]\s*[￥¥]\s*([\d,]+\.\d+)/,  // "(小写) ¥754.85"
  /[一二三四五六七八九十零壹贰叁肆伍陆柒捌玖拾佰仟万千分角元圆整]+\s+[￥¥]\s*([\d,]+\.\d+)/,  // 大写后的金额
  /[￥¥]\s*[\d,]+\.\d+\s+[￥¥]\s*[\d,]+\.\d+\s+[￥¥]\s*[\d,]+\.\d+\s+[￥¥]\s*[\d,]+\.\d+[^¥￥]*[￥¥]\s*([\d,]+\.\d+)/,  // 第五个金额
  /[(（]小写[)）][：:\s]*[￥$¥]?\s*([\d,]+\.\d+)/,
  /(价税合计|合\s*计)[：:\s]*[(（](大写|小写)[)）][：:\s]*[￥$¥]?\s*([\d,]+\.?\d*)/,
  /(价税合计|合\s*计)[：:\s]*[￥$¥]?\s*([\d,]+\.?\d*)/,
  /总计[：:\s]*[￥$¥]?\s*([\d,]+\.?\d*)/
]

// 税率匹配模式
const TAX_RATE_PATTERNS: RegExp[] = [
  /[\d,]+\.\d+\s+(\d+)%/g,  // "4.08 6%"
  /\s(\d+)%\s/g,  // " 6% "
  /税率[\s/征收率]*[:：]?\s*(\d+)%/g  // "税率: 6%"
]

// 常见税率白名单
const VALID_TAX_RATES = new Set([0, 1, 3, 5, 6, 9, 10, 11, 13, 16, 17])

// ============================================================================
// 类型定义
// ============================================================================

export interface InvoiceFieldsResult {
  invoiceNumber?: string
  invoiceType?: string
  amount?: string
  taxAmount?: string
  totalAmount?: string
  taxRates?: TaxRate[]
}

export interface ValidationResult {
  valid: boolean
  errors: string[]
}

// ============================================================================
// PDF文本提取
// ============================================================================

/**
 * 从PDF文件中提取纯文本
 */
export async function extractTextFromPDF(file: File): Promise<string> {
  try {
    const arrayBuffer = await readFileAsArrayBuffer(file)
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
    const totalPages = pdf.numPages
    
    let fullText = ''
    const pagesToParse = Math.min(totalPages, MAX_PAGES_QUICK_PARSE)
    
    for (let i = 1; i <= pagesToParse; i++) {
      const page = await pdf.getPage(i)
      const textContent = await page.getTextContent()
      const pageText = textContent.items.map((item: any) => item.str).join(' ')
      fullText += pageText + '\n'
    }
    
    // 如果前3页没找到关键字段，继续解析剩余页面
    const hasKeyFields = fullText.includes('发票号码') || fullText.includes('价税合计')
    if (!hasKeyFields && totalPages > MAX_PAGES_QUICK_PARSE) {
      for (let i = MAX_PAGES_QUICK_PARSE + 1; i <= totalPages; i++) {
        const page = await pdf.getPage(i)
        const textContent = await page.getTextContent()
        const pageText = textContent.items.map((item: any) => item.str).join(' ')
        fullText += pageText + '\n'
      }
    }
    
    return fullText
  } catch (error) {
    console.error('[PDF解析] 错误:', (error as Error).message)
    throw new Error(`PDF文本提取失败: ${(error as Error).message}`)
  }
}

// ============================================================================
// 字段提取主入口
// ============================================================================

/**
 * 从文本中提取发票字段
 */
export function extractInvoiceFields(text: string): InvoiceFieldsResult {
  try {
    return {
      invoiceNumber: extractInvoiceNumber(text),
      invoiceType: extractInvoiceType(text),
      amount: extractAmount(text),
      taxAmount: extractTaxAmount(text),
      totalAmount: extractTotalAmount(text),
      taxRates: extractMultipleTaxRates(text)
    }
  } catch (error) {
    console.error('[发票解析] 错误:', (error as Error).message)
    throw new Error(`发票字段提取失败: ${(error as Error).message}`)
  }
}

// ============================================================================
// 字段提取函数
// ============================================================================

/** 提取发票号码 */
function extractInvoiceNumber(text: string): string | undefined {
  for (const pattern of INVOICE_NUMBER_PATTERNS) {
    const match = text.match(pattern)
    if (match?.[1] && /^\d{20}$/.test(match[1])) {
      return match[1]
    }
  }
  return undefined
}

/** 提取发票类型 */
function extractInvoiceType(text: string): string | undefined {
  // 专票关键字（优先匹配）
  if (/增值税专用发票/.test(text) || /专票/.test(text) || /增值税专用发票/.test(text.replace(/\s+/g, ''))) {
    return '专票'
  }
  
  // 普票关键字
  if (/增值税普通发票/.test(text) || /普票/.test(text) || /普通发票/.test(text) || /增值税普通发票/.test(text.replace(/\s+/g, ''))) {
    return '普票'
  }
  
  // 通过发票代码判断（11位代码：1-2位代表地区，3-4位代表年度，5-8位代表批次，9-11位代表版本）
  // 专票代码通常以1开头，普票通常以2、3、4开头
  const invoiceCodeMatch = text.match(/发票代码[：:]*\s*(\d{10,12})/)
  if (invoiceCodeMatch) {
    const code = invoiceCodeMatch[1]
    if (code.length >= 10) {
      const firstDigit = code.charAt(0)
      if (firstDigit === '1') {
        return '专票'
      } else if (['2', '3', '4'].includes(firstDigit)) {
        return '普票'
      }
    }
  }
  
  // 免税发票通常是普票
  if (isTaxExempt(text)) {
    return '普票'
  }
  
  return undefined
}

/** 提取金额（不含税） */
function extractAmount(text: string): string | undefined {
  return matchFirstValidAmount(text, AMOUNT_PATTERNS, 0)
}

/** 提取税额 */
function extractTaxAmount(text: string): string | undefined {
  // 免税发票直接返回0.00
  if (isTaxExempt(text)) {
    return '0.00'
  }
  return matchFirstValidAmount(text, TAX_AMOUNT_PATTERNS, 0)
}

/** 提取价税合计 */
function extractTotalAmount(text: string): string | undefined {
  return matchFirstValidAmount(text, TOTAL_AMOUNT_PATTERNS, 0)
}

/** 提取税率信息 */
export function extractMultipleTaxRates(text: string): TaxRate[] {
  if (isTaxExempt(text)) {
    return [{ rate: '免税', index: 1 }]
  }
  
  for (const pattern of TAX_RATE_PATTERNS) {
    const rates = extractRatesWithPattern(text, pattern)
    if (rates.length > 0) return rates
  }
  return []
}

// ============================================================================
// 辅助函数
// ============================================================================

/** 检查是否为免税发票 */
function isTaxExempt(text: string): boolean {
  return text.includes('免税') || /\*\*\*\s*免税|免税\s*\*\*\*/.test(text)
}

/** 使用模式列表匹配第一个有效金额 */
function matchFirstValidAmount(text: string, patterns: RegExp[], minValue: number): string | undefined {
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match) {
      const amountStr = match[1] || match[3] || match[2]
      if (amountStr) {
        const amount = amountStr.replace(/,/g, '').replace(/\s+/g, '')
        const numAmount = parseFloat(amount)
        if (!isNaN(numAmount) && numAmount >= minValue) {
          if (isDev) console.log('[调试] 匹配成功 -', pattern, '->', amount)
          return amount
        }
      }
    }
  }
  return undefined
}

/** 使用指定模式提取税率 */
function extractRatesWithPattern(text: string, pattern: RegExp): TaxRate[] {
  const taxRates: TaxRate[] = []
  const seenRates = new Set<string>()
  let match
  let index = 1
  
  pattern.lastIndex = 0
  while ((match = pattern.exec(text)) !== null) {
    const rate = match[1]
    if (!rate) continue
    
    const rateValue = parseFloat(rate)
    if (!isNaN(rateValue) && VALID_TAX_RATES.has(rateValue) && !seenRates.has(rate)) {
      seenRates.add(rate)
      taxRates.push({ rate: `${rate}%`, index: index++ })
    }
  }
  return taxRates
}

// 调试函数已移除，仅保留生产环境必需的日志

// ============================================================================
// 数据验证
// ============================================================================

/**
 * 验证提取的发票数据
 */
export function validateInvoiceData(data: InvoiceFieldsResult): ValidationResult {
  const errors: string[] = []
  
  if (data.invoiceNumber && !/^\d{20}$/.test(data.invoiceNumber)) {
    errors.push('发票号码格式不正确')
  }
  
  if (data.amount) {
    const amount = parseFloat(data.amount)
    if (isNaN(amount) || amount <= 0) errors.push('金额格式不正确')
  }
  
  if (data.taxAmount) {
    const taxAmount = parseFloat(data.taxAmount)
    if (isNaN(taxAmount) || taxAmount < 0) errors.push('税额格式不正确')
  }
  
  if (data.totalAmount) {
    const totalAmount = parseFloat(data.totalAmount)
    if (isNaN(totalAmount) || totalAmount <= 0) errors.push('价税合计格式不正确')
    
    if (data.taxAmount) {
      const taxAmount = parseFloat(data.taxAmount)
      if (!isNaN(taxAmount) && taxAmount > totalAmount) {
        errors.push('税额不应大于价税合计')
      }
    }
  }
  
  if (data.taxRates) {
    for (const taxRate of data.taxRates) {
      if (taxRate.rate === '免税') continue
      const rateValue = parseFloat(taxRate.rate.replace('%', ''))
      if (isNaN(rateValue) || rateValue < 0 || rateValue > 100) {
        errors.push(`税率 ${taxRate.rate} 不在有效范围内`)
      }
    }
  }
  
  return { valid: errors.length === 0, errors }
}

// ============================================================================
// 文件读取
// ============================================================================

/** 读取文件为ArrayBuffer */
function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = () => reject(new Error('文件读取失败'))
    reader.readAsArrayBuffer(file)
  })
}
