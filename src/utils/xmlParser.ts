/**
 * XML 解析工具
 */
import { XMLParser } from 'fast-xml-parser'

interface ParserOptions {
  ignoreAttributes: boolean
  attributeNamePrefix: string
  textNodeName: string
  ignoreDeclaration: boolean
  parseAttributeValue: boolean
  trimValues: boolean
}

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
}

// XML 解析器配置
const parserOptions: ParserOptions = {
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  ignoreDeclaration: true,
  parseAttributeValue: true,
  trimValues: true
}

/**
 * 解析 XML 文件
 */
export async function parseXMLFile(file: File): Promise<any> {
  try {
    const text = await readFileAsText(file)
    return parseXMLText(text)
  } catch (error) {
    throw new Error(`XML 文件读取失败: ${(error as Error).message}`)
  }
}

/**
 * 解析 XML 文本
 */
export function parseXMLText(xmlText: string): any {
  try {
    const parser = new XMLParser(parserOptions)
    const result = parser.parse(xmlText)
    return result
  } catch (error) {
    throw new Error(`XML 解析失败: ${(error as Error).message}`)
  }
}

/**
 * 从 XML 数据中提取发票信息
 */
export function extractInvoiceData(xmlData: any): InvoiceData {
  try {
    // 这里需要根据实际的 XML 结构来提取数据
    // 暂时返回一个通用的提取逻辑，实际使用时可能需要调整
    
    const invoice = xmlData.Invoice || xmlData
    
    return {
      invoiceType: extractField(invoice, ['InvoiceType', 'Type', 'InvoiceName']),
      invoiceCode: extractField(invoice, ['InvoiceCode', 'Code', 'InvoiceNumber']),
      purchaserName: extractField(invoice, ['PurchaserName', 'Purchaser', 'BuyerName']),
      sellerName: extractField(invoice, ['SellerName', 'Seller', 'SellerName']),
      totalAmount: extractField(invoice, ['TotalAmount', 'Total', 'Amount']),
      issueDate: extractField(invoice, ['IssueDate', 'Date', 'InvoiceDate'])
    }
  } catch (error) {
    throw new Error(`发票信息提取失败: ${(error as Error).message}`)
  }
}

/**
 * 尝试从多个可能的字段名中提取值
 */
function extractField(obj: any, fieldNames: string[]): string | null {
  for (const name of fieldNames) {
    if (obj && obj[name] !== undefined && obj[name] !== null) {
      return String(obj[name]).trim()
    }
  }
  return null
}

/**
 * 读取文件为文本
 */
function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    
    reader.onload = (e) => {
      resolve(e.target!.result as string)
    }
    
    reader.onerror = () => {
      reject(new Error('文件读取失败'))
    }
    
    reader.readAsText(file)
  })
}

/**
 * 验证必填字段
 */
export function validateInvoiceData(data: InvoiceData): ValidationResult {
  const errors: string[] = []
  
  if (!data.invoiceType) {
    errors.push('缺少发票类型')
  }
  
  if (!data.purchaserName) {
    errors.push('缺少购买方名称')
  }
  
  if (!data.totalAmount) {
    errors.push('缺少价税合计')
  }
  
  return {
    valid: errors.length === 0,
    errors
  }
}
