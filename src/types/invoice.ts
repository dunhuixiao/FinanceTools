/**
 * 发票相关类型定义
 */

// 通用状态类型
export type InvoiceStatus = 'success' | 'failed' | 'pending'

// 税率数据结构
export interface TaxRate {
  rate: string        // 税率值（如"13%"）
  amount?: string     // 对应金额
  index: number       // 序号（用于动态列展示，从1开始）
}

// 发票重命名数据结构
export interface InvoiceRow {
  id: string
  originalFileName: string
  invoiceType: string
  purchaserName: string
  totalAmount: string
  newFileName: string
  status: InvoiceStatus
  errorMessage: string
}

// 发票解析结果数据结构
export interface InvoiceParseResult {
  id: string                    // 唯一标识符（UUID）
  fileName: string              // 原始文件名
  invoiceNumber?: string        // 发票号码
  invoiceType?: string          // 发票类型（普票/专票）
  amount?: string               // 不含税金额
  taxAmount?: string            // 税额
  totalAmount?: string          // 价税合计
  taxRates?: TaxRate[]          // 税率列表（支持多税率）
  status: InvoiceStatus         // 解析状态
  errorMessage?: string         // 失败原因
  parseTime: string             // 解析时间戳（ISO格式）
  originalFile?: File           // 原始文件对象（可选择性释放）
}
