/**
 * 发票内容解析相关类型定义
 * 用于项目明细行的解析和展示
 */

// 发票内容项目行（最小数据单元）
export interface InvoiceContentItem {
  id: string                      // 唯一标识符（UUID）
  sourceInvoiceNumber?: string    // 来源发票号码
  sourceInvoiceDate?: string      // 来源发票日期 (YYYY-MM-DD)
  sourceInvoiceType?: string      // 来源发票类型（普票/专票）
  
  // 项目明细字段（10个）
  goodsName?: string              // 货物或服务名称
  specification?: string          // 规格型号
  unit?: string                   // 单位
  quantity?: string               // 数量
  unitPrice?: string              // 单价
  amount?: string                 // 金额
  taxRate?: string                // 税率/征收率（如"13%"或"免税"）
  taxAmount?: string              // 税额
  
  // 元数据
  sourceFileName: string          // 来源文件名
  sourceFileId: string            // 来源文件ID（用于分组）
  lineNumber: number              // 在发票中的行号（从1开始）
  status: 'success' | 'failed'    // 解析状态
  errorMessage?: string           // 失败原因
  parseTime: string               // 解析时间戳（ISO格式）
}

// 发票内容解析结果（单个文件）
export interface InvoiceContentParseResult {
  fileId: string                  // 文件唯一标识
  fileName: string                // 文件名
  invoiceNumber?: string          // 发票号码
  invoiceDate?: string            // 发票日期
  items: InvoiceContentItem[]     // 项目行列表
  status: 'success' | 'failed'    // 解析状态
  errorMessage?: string           // 失败原因
  parseTime: string               // 解析时间戳
}

// 列坐标映射
export interface ColumnMapping {
  goodsName?: { x: number; width: number }
  specification?: { x: number; width: number }
  unit?: { x: number; width: number }
  quantity?: { x: number; width: number }
  unitPrice?: { x: number; width: number }
  amount?: { x: number; width: number }
  taxRate?: { x: number; width: number }
  taxAmount?: { x: number; width: number }
}

// 表格区域
export interface TableRegion {
  headerY: number                 // 表头Y坐标
  footerY: number                 // 表尾Y坐标（合计行）
  columnMapping: ColumnMapping    // 列映射
}
