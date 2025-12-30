/**
 * 发票PDF结构化解析工具
 * 基于坐标的智能解析系统
 * 
 * 架构: ETL(Extract-Transform-Load) 流水线
 * - 提取层(Extraction): 获取带坐标的文本流
 * - 重组层(Reconstruction): Y轴行对齐 + X轴排序
 * - 解析层(Parsing): 基于坐标的锚点定位法
 * - 校验层(Validation): 格式校验 + 逻辑闭环校验
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

// 坐标相关常量
const Y_AXIS_TOLERANCE = 3  // Y轴行对齐容差(px)
const X_AXIS_TOLERANCE = 20  // X轴列对齐容差(px)
const HEADER_REGION_RATIO = 0.8  // 头部区域比例(顶部20%)

// 常见税率白名单
const VALID_TAX_RATES = new Set([0, 1, 3, 5, 6, 9, 10, 11, 13, 16, 17])

// ============================================================================
// 类型定义
// ============================================================================

/** PDF文本项(带坐标) */
export interface PDFTextItem {
  str: string
  x: number
  y: number
  width: number
  height: number
  pageNumber: number
}

/** 重组后的行数据 */
interface ReconstructedLine {
  y: number
  items: PDFTextItem[]
}

/** 重组后的页面数据 */
interface ReconstructedPage {
  pageNumber: number
  lines: ReconstructedLine[]
  viewport: {
    width: number
    height: number
  }
}

/** 发票字段提取结果 */
export interface InvoiceFieldsResult {
  invoiceNumber?: string
  invoiceType?: string
  invoiceDate?: string
  amount?: string
  taxAmount?: string
  totalAmount?: string
  taxRates?: TaxRate[]
}

/** 校验结果(增强版) */
export interface ValidationResult {
  valid: boolean
  errors: string[]
  passed?: boolean
  message?: string
  calcDiff?: number
}

// ============================================================================
// 第一层: 提取层(Extraction)
// ============================================================================

/**
 * 从PDF文件中提取带坐标的文本流
 * @param file PDF文件
 * @returns 重组后的页面数据数组
 */
export async function extractTextWithCoordinates(file: File): Promise<ReconstructedPage[]> {
  try {
    const arrayBuffer = await readFileAsArrayBuffer(file)
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
    const totalPages = pdf.numPages
    
    const pages: ReconstructedPage[] = []
    
    // 解析所有页面
    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      const page = await pdf.getPage(pageNum)
      const viewport = page.getViewport({ scale: 1.0 })
      const textContent = await page.getTextContent()
      
      // 提取文本项及其坐标
      const textItems: PDFTextItem[] = textContent.items.map((item: any) => {
        const transform = item.transform
        return {
          str: item.str,
          x: transform[4],
          y: transform[5],
          width: item.width,
          height: item.height,
          pageNumber: pageNum
        }
      })
      
      // 重组该页面的文本(Y轴对齐 + X轴排序)
      const reconstructedPage = reconstructPage(textItems, pageNum, viewport)
      pages.push(reconstructedPage)
    }
    
    if (isDev) {
      console.log('[提取层] 成功提取', totalPages, '页,共', pages.reduce((sum, p) => sum + p.lines.length, 0), '行')
    }
    
    return pages
  } catch (error) {
    console.error('[提取层] 错误:', (error as Error).message)
    throw new Error(`PDF文本提取失败: ${(error as Error).message}`)
  }
}

/**
 * 降级方案:提取纯文本(不带坐标)
 * 当坐标信息缺失时使用
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
// 第二层: 重组层(Reconstruction)
// ============================================================================

/**
 * 重组页面文本(Y轴行对齐 + X轴排序)
 */
function reconstructPage(
  items: PDFTextItem[],
  pageNumber: number,
  viewport: any
): ReconstructedPage {
  // 1. 按Y坐标分组(行对齐)
  const lineGroups = new Map<number, PDFTextItem[]>()
  
  items.forEach(item => {
    // 找到Y坐标相近的行
    let foundLine = false
    for (const [lineY, lineItems] of lineGroups.entries()) {
      if (Math.abs(item.y - lineY) <= Y_AXIS_TOLERANCE) {
        lineItems.push(item)
        foundLine = true
        break
      }
    }
    
    // 如果没找到相近的行,创建新行
    if (!foundLine) {
      lineGroups.set(item.y, [item])
    }
  })
  
  // 2. 在每行内按X坐标排序
  const lines: ReconstructedLine[] = []
  lineGroups.forEach((lineItems, lineY) => {
    lineItems.sort((a, b) => a.x - b.x)
    lines.push({
      y: lineY,
      items: lineItems
    })
  })
  
  // 3. 按Y坐标排序所有行(从上到下)
  lines.sort((a, b) => b.y - a.y)  // PDF坐标系原点在左下角,Y越大越靠上
  
  return {
    pageNumber,
    lines,
    viewport: {
      width: viewport.width,
      height: viewport.height
    }
  }
}

// ============================================================================
// 第三层: 解析层(Parsing) - 基于坐标的锚点定位法
// ============================================================================

/**
 * 从重组后的页面中提取发票字段
 */
export function extractInvoiceFieldsWithCoordinates(pages: ReconstructedPage[]): InvoiceFieldsResult {
  try {
    // 构建全文本(用于降级正则匹配)
    const fullText = pages.map(p =>
      p.lines.map(line => line.items.map(item => item.str).join(' ')).join('\n')
    ).join('\n')
    
    // 尝试使用坐标解析
    const hasCoordinates = pages.length > 0 && pages[0].lines.length > 0
    
    if (hasCoordinates) {
      if (isDev) console.log('[解析层] 使用坐标解析模式')
      
      return {
        invoiceNumber: extractInvoiceNumberWithCoord(pages) || extractInvoiceNumberFallback(fullText),
        invoiceType: extractInvoiceTypeWithCoord(pages) || extractInvoiceTypeFallback(fullText),
        invoiceDate: extractInvoiceDateWithCoord(pages) || extractInvoiceDateFallback(fullText),
        amount: extractAmountWithCoord(pages) || extractAmountFallback(fullText),
        taxAmount: extractTaxAmountWithCoord(pages) || extractTaxAmountFallback(fullText),
        totalAmount: extractTotalAmountWithCoord(pages) || extractTotalAmountFallback(fullText),
        taxRates: extractTaxRatesWithCoord(pages) || extractTaxRatesFallback(fullText)
      }
    } else {
      // 降级为纯文本正则解析
      if (isDev) console.log('[解析层] 降级为正则解析模式')
      return extractInvoiceFieldsFallback(fullText)
    }
  } catch (error) {
    console.error('[解析层] 错误:', (error as Error).message)
    throw new Error(`发票字段提取失败: ${(error as Error).message}`)
  }
}

/**
 * 降级方案:从纯文本提取发票字段
 */
export function extractInvoiceFields(text: string): InvoiceFieldsResult {
  return extractInvoiceFieldsFallback(text)
}

// ============================================================================
// 坐标解析函数
// ============================================================================

/** 提取发票号码(基于坐标) */
function extractInvoiceNumberWithCoord(pages: ReconstructedPage[]): string | undefined {
  // 仅在第一页查找
  if (pages.length === 0) return undefined
  const firstPage = pages[0]
  
  // 查找"发票号码"锚点
  for (const line of firstPage.lines) {
    for (let i = 0; i < line.items.length; i++) {
      const item = line.items[i]
      if (/发票号码/.test(item.str)) {
        // 查找该行后续的20位数字
        for (let j = i + 1; j < line.items.length; j++) {
          const numItem = line.items[j]
          const match = numItem.str.match(/(\d{20})/)
          if (match) {
            return match[1]
          }
        }
      }
    }
  }
  
  return undefined
}

/** 提取发票类型(基于坐标) */
function extractInvoiceTypeWithCoord(pages: ReconstructedPage[]): string | undefined {
  if (pages.length === 0) return undefined
  const firstPage = pages[0]
  
  // 头部区域扫描(顶部20%)
  const headerThreshold = firstPage.viewport.height * HEADER_REGION_RATIO
  
  for (const line of firstPage.lines) {
    if (line.y >= headerThreshold) {
      const lineText = line.items.map(item => item.str).join('')
      
      // 优先匹配专票
      if (/增值税专用发票/.test(lineText)) return '专票'
      
      // 匹配普通发票（包括增值税普通发票和电子普通发票）
      if (/普通发票/.test(lineText) || (/电子(普通)?发票/.test(lineText) && /普通/.test(lineText))) {
        return '普票'
      }
    }
  }
  
  return undefined
}

/** 提取开票日期(基于坐标) */
function extractInvoiceDateWithCoord(pages: ReconstructedPage[]): string | undefined {
  if (pages.length === 0) return undefined
  const firstPage = pages[0]
  
  for (const line of firstPage.lines) {
    const lineText = line.items.map(item => item.str).join(' ')
    const match = lineText.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/)
    if (match) {
      return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`
    }
  }
  
  return undefined
}

/** 提取金额(不含税)(基于坐标) */
function extractAmountWithCoord(pages: ReconstructedPage[]): string | undefined {
  // 在最后一页查找"合计"行
  if (pages.length === 0) return undefined
  const lastPage = pages[pages.length - 1]
  
  for (const line of lastPage.lines) {
    const lineText = line.items.map(item => item.str).join('')
    if (/合\s*计/.test(lineText)) {
      // 提取该行的所有金额
      const amounts: { value: string, x: number }[] = []
      for (const item of line.items) {
        const match = item.str.match(/[￥¥]?\s*([\d,]+\.\d+)/)
        if (match) {
          amounts.push({ value: match[1].replace(/,/g, ''), x: item.x })
        }
      }
      
      // 按X坐标排序,取倒数第二个(金额通常在税额前面)
      amounts.sort((a, b) => a.x - b.x)
      if (amounts.length >= 2) {
        return amounts[amounts.length - 2].value
      } else if (amounts.length === 1) {
        return amounts[0].value
      }
    }
  }
  
  return undefined
}

/** 提取税额(基于坐标) */
function extractTaxAmountWithCoord(pages: ReconstructedPage[]): string | undefined {
  if (pages.length === 0) return undefined
  const lastPage = pages[pages.length - 1]
  
  // 先检查是否免税
  const fullText = pages.map(p =>
    p.lines.map(line => line.items.map(item => item.str).join(' ')).join('\n')
  ).join('\n')
  if (isTaxExempt(fullText)) {
    return '0.00'
  }
  
  for (const line of lastPage.lines) {
    const lineText = line.items.map(item => item.str).join('')
    if (/合\s*计/.test(lineText)) {
      // 提取该行的所有金额
      const amounts: { value: string, x: number }[] = []
      for (const item of line.items) {
        const match = item.str.match(/[￥¥]?\s*([\d,]+\.\d+)/)
        if (match) {
          amounts.push({ value: match[1].replace(/,/g, ''), x: item.x })
        }
      }
      
      // 按X坐标排序,取最后一个(税额通常在最右边)
      amounts.sort((a, b) => a.x - b.x)
      if (amounts.length > 0) {
        return amounts[amounts.length - 1].value
      }
    }
  }
  
  return undefined
}

/** 提取价税合计(基于坐标) */
function extractTotalAmountWithCoord(pages: ReconstructedPage[]): string | undefined {
  if (pages.length === 0) return undefined
  const lastPage = pages[pages.length - 1]
  
  // 查找"价税合计"或"(小写)"锚点
  for (const line of lastPage.lines) {
    const lineText = line.items.map(item => item.str).join(' ')
    if (/价税合计|小写/.test(lineText)) {
      // 提取该行右侧的金额
      for (const item of line.items) {
        const match = item.str.match(/[￥¥]\s*([\d,]+\.\d+)/)
        if (match) {
          return match[1].replace(/,/g, '')
        }
      }
    }
  }
  
  return undefined
}

/** 提取税率(基于坐标-垂直列扫描) */
function extractTaxRatesWithCoord(pages: ReconstructedPage[]): TaxRate[] | undefined {
  const fullText = pages.map(p =>
    p.lines.map(line => line.items.map(item => item.str).join(' ')).join('\n')
  ).join('\n')
  
  if (isTaxExempt(fullText)) {
    return [{ rate: '免税', index: 1 }]
  }
  
  const taxRates: TaxRate[] = []
  const seenRates = new Set<string>()
  let index = 1
  
  // 查找"税率"列的X坐标
  let taxRateColumnX: number | undefined
  
  for (const page of pages) {
    for (const line of page.lines) {
      for (const item of line.items) {
        if (/税\s*率/.test(item.str)) {
          taxRateColumnX = item.x
          break
        }
      }
      if (taxRateColumnX !== undefined) break
    }
    if (taxRateColumnX !== undefined) break
  }
  
  if (taxRateColumnX === undefined) {
    return undefined
  }
  
  // 在税率列垂直扫描
  for (const page of pages) {
    for (const line of page.lines) {
      for (const item of line.items) {
        // 检查X坐标是否在税率列范围内
        if (Math.abs(item.x - taxRateColumnX) <= X_AXIS_TOLERANCE) {
          const match = item.str.match(/(\d+)%/)
          if (match) {
            const rate = match[1]
            const rateValue = parseFloat(rate)
            if (VALID_TAX_RATES.has(rateValue) && !seenRates.has(rate)) {
              seenRates.add(rate)
              taxRates.push({ rate: `${rate}%`, index: index++ })
            }
          }
          // 检查免税标记
          if (/\*+|免税/.test(item.str) && !seenRates.has('免税')) {
            seenRates.add('免税')
            taxRates.push({ rate: '免税', index: index++ })
          }
        }
      }
    }
  }
  
  return taxRates.length > 0 ? taxRates : undefined
}

// ============================================================================
// 降级正则解析函数(保持向后兼容)
// ============================================================================

function extractInvoiceFieldsFallback(text: string): InvoiceFieldsResult {
  return {
    invoiceNumber: extractInvoiceNumberFallback(text),
    invoiceType: extractInvoiceTypeFallback(text),
    invoiceDate: extractInvoiceDateFallback(text),
    amount: extractAmountFallback(text),
    taxAmount: extractTaxAmountFallback(text),
    totalAmount: extractTotalAmountFallback(text),
    taxRates: extractTaxRatesFallback(text)
  }
}

function extractInvoiceNumberFallback(text: string): string | undefined {
  const patterns = [
    /发票号码[：:]\s*(\d{20})/,
    /No\.\s*(\d{20})/i,
    /(\d{20})/
  ]
  
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match?.[1] && /^\d{20}$/.test(match[1])) {
      return match[1]
    }
  }
  return undefined
}

function extractInvoiceTypeFallback(text: string): string | undefined {
  // 优先匹配专票
  if (/增值税专用发票/.test(text) || /专票/.test(text)) return '专票'
  
  // 匹配普通发票（包括增值税普通发票和电子普通发票）
  if (/普通发票/.test(text) || /普票/.test(text) || (/电子(普通)?发票/.test(text) && /普通/.test(text))) {
    return '普票'
  }
  
  // 通过发票代码判断
  const invoiceCodeMatch = text.match(/发票代码[：:]*\s*(\d{10,12})/)
  if (invoiceCodeMatch) {
    const code = invoiceCodeMatch[1]
    if (code.length >= 10) {
      const firstDigit = code.charAt(0)
      if (firstDigit === '1') return '专票'
      if (['2', '3', '4'].includes(firstDigit)) return '普票'
    }
  }
  
  if (isTaxExempt(text)) return '普票'
  
  return undefined
}

function extractInvoiceDateFallback(text: string): string | undefined {
  const match = text.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/)
  if (match) {
    return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`
  }
  return undefined
}

function extractAmountFallback(text: string): string | undefined {
  const patterns = [
    /不含税金额[：:]\s*[￥$¥]?\s*([\d,]+\.?\d*)/,
    /金额[：:]\s*[￥$¥]?\s*([\d,]+\.?\d*)/,
    /小计[：:]\s*[￥$¥]?\s*([\d,]+\.?\d*)/,
    /合\s+计[：:\s]*[￥$¥]?\s*([\d,]+\.\d+)/,
    /合计[：:\s]*[￥$¥]?\s*([\d,]+\.\d+)/
  ]
  return matchFirstValidAmount(text, patterns, 0)
}

function extractTaxAmountFallback(text: string): string | undefined {
  if (isTaxExempt(text)) return '0.00'
  
  const patterns = [
    /税额[：:]\s*[￥$¥]?\s*([\d,]+\.?\d*)/,
    /税金[：:]\s*[￥$¥]?\s*([\d,]+\.?\d*)/,
    /合\s+计[：:\s]*[￥$¥]?\s*[\d,]+\.\d+\s+[￥$¥]?\s*([\d,]+\.\d+)/,
    /合计[：:\s]*[￥$¥]?\s*[\d,]+\.\d+\s+[￥$¥]?\s*([\d,]+\.\d+)/
  ]
  return matchFirstValidAmount(text, patterns, 0)
}

function extractTotalAmountFallback(text: string): string | undefined {
  const patterns = [
    /[(（]小写[)）][￥¥]\s*([\d,]+\.\d+)/,
    /[(（]小写[)）]\s*[￥¥]\s*([\d,]+\.\d+)/,
    /[一二三四五六七八九十零壹贰叁肆伍陆柒捌玖拾佰仟万千分角元圆整]+\s+[￥¥]\s*([\d,]+\.\d+)/,
    /(价税合计|合\s*计)[：:\s]*[(（](大写|小写)[)）][：:\s]*[￥$¥]?\s*([\d,]+\.?\d*)/,
    /(价税合计|合\s*计)[：:\s]*[￥$¥]?\s*([\d,]+\.?\d*)/,
    /总计[：:\s]*[￥$¥]?\s*([\d,]+\.?\d*)/
  ]
  return matchFirstValidAmount(text, patterns, 0)
}

function extractTaxRatesFallback(text: string): TaxRate[] {
  if (isTaxExempt(text)) {
    return [{ rate: '免税', index: 1 }]
  }
  
  const patterns = [
    /[\d,]+\.\d+\s+(\d+)%/g,
    /\s(\d+)%\s/g,
    /税率[\s/征收率]*[:：]?\s*(\d+)%/g
  ]
  
  for (const pattern of patterns) {
    const rates = extractRatesWithPattern(text, pattern)
    if (rates.length > 0) return rates
  }
  
  return []
}

// ============================================================================
// 第四层: 校验层(Validation)
// ============================================================================

/**
 * 验证提取的发票数据(增强版 - 包含逻辑闭环校验)
 */
export function validateInvoiceData(data: InvoiceFieldsResult): ValidationResult {
  const errors: string[] = []
  
  // 格式校验
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
  
  // 逻辑闭环校验: 价税合计 = 金额 + 税额
  let calcDiff = 0
  let logicPassed = true
  let logicMessage = ''
  
  if (data.amount && data.taxAmount && data.totalAmount) {
    const amount = parseFloat(data.amount)
    const taxAmount = parseFloat(data.taxAmount)
    const totalAmount = parseFloat(data.totalAmount)
    
    if (!isNaN(amount) && !isNaN(taxAmount) && !isNaN(totalAmount)) {
      // 使用整数化计算避免精度问题
      const sumInt = Math.round(amount * 100) + Math.round(taxAmount * 100)
      const totalInt = Math.round(totalAmount * 100)
      const diffInt = Math.abs(sumInt - totalInt)
      calcDiff = diffInt / 100
      
      // 允许5分钱误差
      if (calcDiff > 0.05) {
        logicPassed = false
        logicMessage = `金额校验失败,误差 ${calcDiff.toFixed(2)} 元`
        errors.push(logicMessage)
      } else {
        logicMessage = '金额校验通过'
      }
    }
  } else {
    logicMessage = '跳过逻辑校验(缺少必要字段)'
  }
  
  return {
    valid: errors.length === 0,
    errors,
    passed: logicPassed,
    message: logicMessage,
    calcDiff
  }
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

/** 读取文件为ArrayBuffer */
function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = () => reject(new Error('文件读取失败'))
    reader.readAsArrayBuffer(file)
  })
}
