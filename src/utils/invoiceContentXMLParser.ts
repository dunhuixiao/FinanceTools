/**
 * XML发票内容解析工具
 * 解析电子发票XML文件，提取项目明细数据
 */
import { parseXMLFile } from './xmlParser'
import type { InvoiceContentItem } from '../types/invoiceContent'

/**
 * 从XML文件中提取发票项目明细
 * @param file XML文件
 * @param fileId 文件唯一标识
 * @returns 项目明细数组
 */
export async function extractInvoiceContentFromXML(
  file: File,
  fileId: string
): Promise<InvoiceContentItem[]> {
  try {
    const xmlData = await parseXMLFile(file)
    return parseEInvoiceData(xmlData, file.name, fileId)
  } catch (error) {
    console.error('[XML解析] 文件解析失败:', file.name, (error as Error).message)
    throw error
  }
}

/**
 * 解析电子发票数据结构
 */
function parseEInvoiceData(
  xmlData: any,
  fileName: string,
  fileId: string
): InvoiceContentItem[] {
  const items: InvoiceContentItem[] = []
  const parseTime = new Date().toISOString()
  
  try {
    const eInvoice = xmlData.EInvoice || xmlData
    if (!eInvoice) {
      throw new Error('无效的XML结构：缺少EInvoice节点')
    }
    
    // 提取发票基本信息
    const invoiceNumber = extractInvoiceNumber(eInvoice)
    const invoiceDate = extractInvoiceDate(eInvoice)
    const invoiceType = extractInvoiceType(eInvoice)
    
    // 提取项目明细
    const eInvoiceData = eInvoice.EInvoiceData
    if (!eInvoiceData) {
      throw new Error('无效的XML结构：缺少EInvoiceData节点')
    }
    
    const itemsData = eInvoiceData.IssuItemInformation
    if (!itemsData) {
      return items
    }
    
    // 处理单个或多个明细行
    const itemsArray = Array.isArray(itemsData) ? itemsData : [itemsData]
    
    itemsArray.forEach((itemData: any, index: number) => {
      try {
        const item = parseItemData(
          itemData,
          fileName,
          fileId,
          index + 1,
          invoiceNumber,
          invoiceDate,
          invoiceType,
          parseTime
        )
        items.push(item)
      } catch (error) {
        // 单行解析失败，记录错误但继续处理其他行
        items.push({
          id: generateId(),
          sourceFileName: fileName,
          sourceFileId: fileId,
          lineNumber: index + 1,
          status: 'failed',
          errorMessage: (error as Error).message,
          parseTime
        })
      }
    })
  } catch (error) {
    // 整体解析失败，返回一个失败记录
    items.push({
      id: generateId(),
      sourceFileName: fileName,
      sourceFileId: fileId,
      lineNumber: 1,
      status: 'failed',
      errorMessage: (error as Error).message,
      parseTime
    })
  }
  
  return items
}

/**
 * 解析单个项目明细数据
 */
function parseItemData(
  itemData: any,
  fileName: string,
  fileId: string,
  lineNumber: number,
  invoiceNumber: string | undefined,
  invoiceDate: string | undefined,
  invoiceType: string | undefined,
  parseTime: string
): InvoiceContentItem {
  return {
    id: generateId(),
    sourceInvoiceNumber: invoiceNumber,
    sourceInvoiceDate: invoiceDate,
    sourceInvoiceType: invoiceType,
    goodsName: extractString(itemData.ItemName),
    specification: extractString(itemData.SpecMod),
    unit: extractString(itemData.MeaUnits),
    quantity: extractString(itemData.Quantity),
    unitPrice: extractString(itemData.UnPrice),
    amount: extractString(itemData.Amount),
    taxRate: formatTaxRate(itemData.TaxRate),
    taxAmount: extractString(itemData.ComTaxAm),
    sourceFileName: fileName,
    sourceFileId: fileId,
    lineNumber,
    status: 'success',
    parseTime
  }
}

/**
 * 提取发票号码
 */
function extractInvoiceNumber(eInvoice: any): string | undefined {
  // 优先从TaxSupervisionInfo获取
  const taxInfo = eInvoice.TaxSupervisionInfo
  if (taxInfo?.InvoiceNumber) {
    return extractString(taxInfo.InvoiceNumber)
  }
  
  // 备选：从Header获取EIid
  const header = eInvoice.Header
  if (header?.EIid) {
    return extractString(header.EIid)
  }
  
  return undefined
}

/**
 * 提取发票日期
 */
function extractInvoiceDate(eInvoice: any): string | undefined {
  const taxInfo = eInvoice.TaxSupervisionInfo
  if (taxInfo?.IssueTime) {
    return formatDate(taxInfo.IssueTime)
  }
  
  // 备选：从BasicInformation获取RequestTime
  const basicInfo = eInvoice.EInvoiceData?.BasicInformation
  if (basicInfo?.RequestTime) {
    return formatDate(basicInfo.RequestTime)
  }
  
  return undefined
}

/**
 * 提取发票类型
 */
function extractInvoiceType(eInvoice: any): string | undefined {
  const inherentLabel = eInvoice.Header?.InherentLabel
  if (inherentLabel?.GeneralOrSpecialVAT?.LabelName) {
    return simplifyInvoiceType(inherentLabel.GeneralOrSpecialVAT.LabelName)
  }
  
  return undefined
}

/**
 * 简化发票类型名称
 */
function simplifyInvoiceType(typeName: string): string {
  if (typeName.includes('专用')) {
    return '专票'
  }
  if (typeName.includes('普通')) {
    return '普票'
  }
  return typeName
}

/**
 * 格式化税率
 * 将小数转换为百分比字符串
 */
function formatTaxRate(value: any): string | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined
  }
  
  const numValue = parseFloat(String(value))
  
  if (isNaN(numValue)) {
    return String(value)
  }
  
  if (numValue === 0) {
    return '免税'
  }
  
  // 如果是小数（如0.13），转换为百分比
  if (numValue > 0 && numValue < 1) {
    return `${Math.round(numValue * 100)}%`
  }
  
  // 如果已经是百分比数值（如13），直接加%
  if (numValue >= 1 && numValue <= 100) {
    return `${numValue}%`
  }
  
  return String(value)
}

/**
 * 格式化日期
 * 提取YYYY-MM-DD格式
 */
function formatDate(value: any): string | undefined {
  if (!value) return undefined
  
  const dateStr = String(value).trim()
  
  // 匹配 YYYY-MM-DD 格式（可能后面跟时间）
  const match = dateStr.match(/(\d{4}-\d{2}-\d{2})/)
  if (match) {
    return match[1]
  }
  
  return dateStr
}

/**
 * 提取字符串值
 */
function extractString(value: any): string | undefined {
  if (value === undefined || value === null) {
    return undefined
  }
  return String(value).trim() || undefined
}

/**
 * 生成唯一ID
 */
function generateId(): string {
  return 'item-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9)
}
