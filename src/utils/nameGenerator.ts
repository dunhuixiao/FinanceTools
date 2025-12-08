/**
 * 文件名生成工具
 */

interface NamingRule {
  template: string
  separator: string
  fields: string[]
}

interface InvoiceData {
  invoiceType?: string
  invoiceCode?: string
  purchaserName?: string
  sellerName?: string
  totalAmount?: string
  issueDate?: string
  originalFileName: string
}

interface GenerateResult {
  success: boolean
  fileName?: string
  error?: string
  originalFileName: string
}

type FieldFormatter = (value: any) => string

// 当前启用的规则
let CURRENT_RULE = 'purchaser_amount'

// 命名规则定义（开发者可新增）
const NAMING_RULES: Record<string, NamingRule> = {
  // 当前规则：购方名称_金额
  purchaser_amount: {
    template: '{purchaserName}_{totalAmount}',
    separator: '_',
    fields: ['purchaserName', 'totalAmount']
  },
  
  // 预留规则示例（未来可启用）
  invoice_purchaser_amount: {
    template: '{invoiceType}_{purchaserName}_{totalAmount}',
    separator: '_',
    fields: ['invoiceType', 'purchaserName', 'totalAmount']
  },
  
  purchaser_date_amount: {
    template: '{purchaserName}_{issueDate}_{totalAmount}',
    separator: '_',
    fields: ['purchaserName', 'issueDate', 'totalAmount']
  },
  
  invoice_code_purchaser: {
    template: '{invoiceCode}_{purchaserName}',
    separator: '_',
    fields: ['invoiceCode', 'purchaserName']
  }
}

/**
 * 字段格式化器
 */
const fieldFormatters: Record<string, FieldFormatter> = {
  // 购买方名称格式化
  purchaserName: (value: any): string => {
    if (!value) return ''
    
    let formatted = String(value).trim()
    
    // 去除特殊字符
    formatted = formatted.replace(/[/\\:*?"<>|]/g, '')
    
    // 限制最大长度 30 字符
    if (formatted.length > 30) {
      formatted = formatted.substring(0, 30)
    }
    
    return formatted
  },
  
  // 发票类型格式化
  invoiceType: (value: any): string => {
    if (!value) return ''
    
    let formatted = String(value).trim()
    
    // 去除"电子发票"字样
    formatted = formatted.replace(/电子发票/g, '')
    
    // 去除括号
    formatted = formatted.replace(/[（()）]/g, '')
    
    return formatted.trim()
  },
  
  // 价税合计格式化
  totalAmount: (value: any): string => {
    if (!value) return ''
    
    const num = parseFloat(value)
    
    if (isNaN(num)) return value
    
    // 保留两位小数
    return num.toFixed(2)
  },
  
  // 开票日期格式化
  issueDate: (value: any): string => {
    if (!value) return ''
    
    // 格式化为 YYYYMMDD
    const str = String(value)
    const match = str.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/)
    
    if (match) {
      const year = match[1]
      const month = match[2].padStart(2, '0')
      const day = match[3].padStart(2, '0')
      return `${year}${month}${day}`
    }
    
    return str.replace(/[年月日\-/]/g, '')
  },
  
  // 发票号码格式化
  invoiceCode: (value: any): string => {
    if (!value) return ''
    return String(value).trim()
  },
  
  // 销售方名称格式化
  sellerName: (value: any): string => {
    return fieldFormatters.purchaserName(value)
  }
}

/**
 * 生成文件名
 */
export function generateFileName(invoiceData: InvoiceData, originalExtension: string): string {
  const rule = NAMING_RULES[CURRENT_RULE]
  
  if (!rule) {
    throw new Error(`命名规则 ${CURRENT_RULE} 不存在`)
  }
  
  // 格式化各个字段
  const formattedData: Record<string, string> = {}
  for (const field of rule.fields) {
    const formatter = fieldFormatters[field]
    formattedData[field] = formatter ? formatter((invoiceData as any)[field]) : (invoiceData as any)[field] || ''
  }
  
  // 检查必填字段
  for (const field of rule.fields) {
    if (!formattedData[field]) {
      throw new Error(`字段 ${field} 缺失或为空`)
    }
  }
  
  // 生成文件名
  const parts = rule.fields.map(field => formattedData[field])
  const fileName = parts.join(rule.separator)
  
  // 添加扩展名
  return `${fileName}${originalExtension}`
}

/**
 * 处理文件名冲突
 */
export function handleFileNameConflict(fileName: string, existingNames: string[]): string {
  let finalName = fileName
  let counter = 1
  
  // 提取文件名和扩展名
  const lastDotIndex = fileName.lastIndexOf('.')
  const nameWithoutExt = lastDotIndex > 0 ? fileName.substring(0, lastDotIndex) : fileName
  const extension = lastDotIndex > 0 ? fileName.substring(lastDotIndex) : ''
  
  // 如果文件名已存在，添加序号
  while (existingNames.includes(finalName)) {
    finalName = `${nameWithoutExt}_${counter}${extension}`
    counter++
  }
  
  return finalName
}

/**
 * 批量生成文件名（处理冲突）
 */
export function generateFileNames(invoiceDataList: InvoiceData[]): GenerateResult[] {
  const existingNames: string[] = []
  const results: GenerateResult[] = []
  
  for (const item of invoiceDataList) {
    try {
      const originalExt = item.originalFileName.substring(item.originalFileName.lastIndexOf('.'))
      let fileName = generateFileName(item, originalExt)
      
      // 处理冲突
      fileName = handleFileNameConflict(fileName, existingNames)
      
      existingNames.push(fileName)
      
      results.push({
        success: true,
        fileName,
        originalFileName: item.originalFileName
      })
    } catch (error) {
      results.push({
        success: false,
        error: (error as Error).message,
        originalFileName: item.originalFileName
      })
    }
  }
  
  return results
}

/**
 * 切换命名规则（开发者使用）
 */
export function setCurrentRule(ruleName: string): void {
  if (!NAMING_RULES[ruleName]) {
    throw new Error(`命名规则 ${ruleName} 不存在`)
  }
  CURRENT_RULE = ruleName
}

/**
 * 获取当前规则
 */
export function getCurrentRule(): string {
  return CURRENT_RULE
}

/**
 * 获取所有可用规则
 */
export function getAvailableRules(): string[] {
  return Object.keys(NAMING_RULES)
}
