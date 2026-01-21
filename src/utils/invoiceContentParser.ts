/**
 * 发票内容（项目明细行）解析工具
 * 基于坐标的表格识别和解析系统
 * 
 * 架构: ETL流水线
 * - 提取层(Extraction): 复用invoicePdfParser的文本提取
 * - 表格识别层(Table Detection): 识别表格区域和列映射
 * - 行提取层(Row Extraction): 提取项目明细行
 * - 校验层(Validation): 格式校验
 */
import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { InvoiceContentItem, ColumnMapping, TableRegion } from '../types/invoiceContent'

// ============================================================================
// 配置常量
// ============================================================================

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker

const isDev = import.meta.env.DEV

// 坐标相关常量
const Y_AXIS_TOLERANCE = 3      // Y轴行对齐容差(px)

// 列关键词配置（支持带空格和不带空格的版本）
const COLUMN_KEYWORDS: Record<string, string[]> = {
  goodsName: ['货物或应税劳务', '服务名称', '项目名称', '货物或应税劳务、服务名称'],
  specification: ['规格型号', '规格'],
  unit: ['单位', '计量单位', '单  位'],
  quantity: ['数量', '数  量'],
  unitPrice: ['单价', '含税单价', '不含税单价', '单  价'],
  amount: ['金额', '不含税金额', '金  额'],
  taxRate: ['税率', '征收率', '税率/征收率', '税率/征收率'],
  taxAmount: ['税额', '税  额']
}

// 表头识别关键词
const TABLE_HEADER_KEYWORDS = ['货物或应税劳务', '服务名称', '项目名称', '规格型号']
// 表尾识别关键词
const TABLE_FOOTER_KEYWORDS = ['合计', '合  计', '价税合计']

// ============================================================================
// 类型定义
// ============================================================================

/** PDF文本项(带坐标) */
interface PDFTextItem {
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

/** 提取的原始行数据 */
interface RawContentRow {
  y: number
  items: PDFTextItem[]
  pageNumber: number
}

// ============================================================================
// 主入口函数
// ============================================================================

/**
 * 从PDF文件中提取发票内容项目行
 * @param file PDF文件
 * @param fileId 文件唯一标识
 * @returns 项目行数组
 */
export async function extractInvoiceContentItems(
  file: File,
  fileId: string
): Promise<InvoiceContentItem[]> {
  try {
    if (isDev) {
      console.log('[内容解析] 开始解析文件:', file.name)
    }
    
    // 1. 提取带坐标的文本
    const pages = await extractTextWithCoordinates(file)
    
    if (pages.length === 0) {
      throw new Error('PDF文件为空或无法读取')
    }
    
    // 2. 提取发票基础信息（发票号码、日期、类型）
    const invoiceNumber = extractInvoiceNumber(pages)
    const invoiceDate = extractInvoiceDate(pages)
    const invoiceType = extractInvoiceType(pages)
    
    if (isDev) {
      console.log('[内容解析] 发票号码:', invoiceNumber, '日期:', invoiceDate, '类型:', invoiceType)
    }
    
    // 3. 识别表格区域和列映射
    const tableRegions = detectTableRegions(pages)
    
    if (tableRegions.length === 0) {
      if (isDev) {
        console.warn('[内容解析] 未找到表格区域')
      }
      throw new Error('未找到项目明细表格')
    }
    
    // 4. 提取项目行
    const items: InvoiceContentItem[] = []
    let lineNumber = 1
    
    for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
      const page = pages[pageIndex]
      const region = tableRegions[pageIndex]
      
      if (!region) continue
      
      const rawRows = extractRawContentRows(page, region)
      
      for (const row of rawRows) {
        const item = parseContentRow(row, region.columnMapping, page.viewport.width, {
          fileId,
          fileName: file.name,
          invoiceNumber,
          invoiceDate,
          invoiceType,
          lineNumber: lineNumber++,
          pageNumber: page.pageNumber
        })
        
        // 只添加有效的项目行（至少有货物名称或金额，且不是合计/备注等行）
        if (item.goodsName || item.amount) {
          // 过滤掉无效的项目行
          if (!isInvalidItemRow(item.goodsName)) {
            items.push(item)
          }
        }
      }
    }
    
    if (isDev) {
      console.log('[内容解析] 提取项目行数:', items.length)
    }
    
    return items
  } catch (error) {
    console.error('[内容解析] 错误:', (error as Error).message)
    throw error
  }
}

// ============================================================================
// 第一层: 提取层(Extraction)
// ============================================================================

/**
 * 从PDF文件中提取带坐标的文本流
 */
async function extractTextWithCoordinates(file: File): Promise<ReconstructedPage[]> {
  const arrayBuffer = await readFileAsArrayBuffer(file)
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const totalPages = pdf.numPages
  
  const pages: ReconstructedPage[] = []
  
  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    const page = await pdf.getPage(pageNum)
    const viewport = page.getViewport({ scale: 1.0 })
    const textContent = await page.getTextContent()
    
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
    
    const reconstructedPage = reconstructPage(textItems, pageNum, viewport)
    pages.push(reconstructedPage)
  }
  
  return pages
}

/**
 * 重组页面文本(Y轴行对齐 + X轴排序)
 */
function reconstructPage(
  items: PDFTextItem[],
  pageNumber: number,
  viewport: any
): ReconstructedPage {
  const lineGroups = new Map<number, PDFTextItem[]>()
  
  items.forEach(item => {
    let foundLine = false
    for (const [lineY, lineItems] of lineGroups.entries()) {
      if (Math.abs(item.y - lineY) <= Y_AXIS_TOLERANCE) {
        lineItems.push(item)
        foundLine = true
        break
      }
    }
    
    if (!foundLine) {
      lineGroups.set(item.y, [item])
    }
  })
  
  const lines: ReconstructedLine[] = []
  lineGroups.forEach((lineItems, lineY) => {
    lineItems.sort((a, b) => a.x - b.x)
    lines.push({
      y: lineY,
      items: lineItems
    })
  })
  
  // 按Y坐标排序（从上到下，PDF坐标系Y越大越靠上）
  lines.sort((a, b) => b.y - a.y)
  
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
// 第二层: 表格识别层(Table Detection)
// ============================================================================

/** 合并后的文本项 */
interface MergedTextItem {
  text: string
  x: number           // 最左侧x坐标
  rightX: number      // 最右侧边界
  width: number       // 总宽度
  items: PDFTextItem[] // 原始文本块
}

/**
 * 合并相邻的文本块
 * 解决表头中"规格"+"型号"被拆分成多个text item的问题
 * 以及"单 位"等带空格的列名被拆分的问题
 */
function mergeAdjacentTextItems(line: ReconstructedLine, maxGap: number = 20): MergedTextItem[] {
  const items = [...line.items].sort((a, b) => a.x - b.x)
  if (items.length === 0) return []
  
  if (isDev) {
    console.log('[内容解析] 原始表头文本项:', items.map(i => ({
      text: i.str,
      x: Math.round(i.x),
      width: Math.round(i.width)
    })))
  }
  
  // 分析表头间距分布，识别列分隔符
  const gaps: number[] = []
  for (let i = 1; i < items.length; i++) {
    const gap = items[i].x - (items[i-1].x + items[i-1].width)
    gaps.push(gap)
  }
  
  // 计算中位数间距，作为列分隔阈值
  const sortedGaps = [...gaps].sort((a, b) => a - b)
  const medianGap = sortedGaps[Math.floor(sortedGaps.length / 2)] || maxGap
  
  // 列分隔阈值：使用中位数的70%，避免将列内空格当作分隔符
  const columnSeparatorThreshold = Math.max(medianGap * 0.7, maxGap)
  
  if (isDev) {
    console.log('[内容解析] 表头间距分析:', {
      gaps: gaps.map(g => Math.round(g)),
      medianGap: Math.round(medianGap),
      threshold: Math.round(columnSeparatorThreshold)
    })
  }
  
  const merged: MergedTextItem[] = []
  let currentGroup: PDFTextItem[] = [items[0]]
  
  for (let i = 1; i < items.length; i++) {
    const prev = currentGroup[currentGroup.length - 1]
    const curr = items[i]
    const gap = curr.x - (prev.x + prev.width)
    
    // 自适应合并策略：
    // 1. 对于单字符，使用宽松阈值（处理"单 位"这种情况）
    // 2. 对于多字符，使用列分隔阈值
    const bothSingleChar = prev.str.length === 1 && curr.str.length === 1
    const effectiveMaxGap = bothSingleChar ? maxGap * 1.5 : columnSeparatorThreshold
    
    if (gap < effectiveMaxGap) {
      // 间距小于阈值，合并到当前组
      currentGroup.push(curr)
    } else {
      // 间距大于阈值，保存当前组并开始新组
      merged.push(createMergedItem(currentGroup))
      currentGroup = [curr]
    }
  }
  
  // 保存最后一组
  if (currentGroup.length > 0) {
    merged.push(createMergedItem(currentGroup))
  }
  
  if (isDev) {
    console.log('[内容解析] 合并后列数:', merged.length)
  }
  
  return merged
}

/**
 * 从文本块数组创建合并项
 */
function createMergedItem(items: PDFTextItem[]): MergedTextItem {
  const text = items.map(i => i.str).join('')
  const x = Math.min(...items.map(i => i.x))
  const rightX = Math.max(...items.map(i => i.x + i.width))
  return {
    text,
    x,
    rightX,
    width: rightX - x,
    items
  }
}

/**
 * 基于已检测到的列推断缺失列的位置
 * 列的标准顺序: goodsName -> specification -> unit -> quantity -> unitPrice -> amount -> taxRate -> taxAmount
 */
function inferMissingColumns(mapping: ColumnMapping, _mergedItems: MergedTextItem[]): void {
  // 获取所有已检测到的列的X坐标，按从左到右排序
  const detectedColumns: { field: string; x: number; width: number }[] = []
  for (const [field, col] of Object.entries(mapping)) {
    if (col) {
      detectedColumns.push({ field, x: col.x, width: col.width })
    }
  }
  detectedColumns.sort((a, b) => a.x - b.x)
  
  if (detectedColumns.length < 2) return
  
  // 计算平均列间距（更精确的方法：使用中位数）
  const gaps: number[] = []
  for (let i = 1; i < detectedColumns.length; i++) {
    gaps.push(detectedColumns[i].x - detectedColumns[i - 1].x)
  }
  gaps.sort((a, b) => a - b)
  const avgGap = gaps[Math.floor(gaps.length / 2)] || 60
  
  if (isDev) {
    console.log('[内容解析] 列间距分析:', {
      gaps: gaps.map(g => Math.round(g)),
      avgGap: Math.round(avgGap),
      detectedCount: detectedColumns.length
    })
  }
  
  // 推断规格型号列位置（如果缺失）
  if (!mapping.specification && mapping.goodsName && mapping.unit) {
    const midX = (mapping.goodsName.x + mapping.unit.x) / 2
    mapping.specification = {
      x: midX,
      width: avgGap * 0.8
    }
    if (isDev) {
      console.log('[内容解析] 推断规格型号列位置:', midX)
    }
  }
  
  // 推断单位列位置（如果缺失但有规格型号和数量）
  if (!mapping.unit && mapping.specification && mapping.quantity) {
    const midX = (mapping.specification.x + mapping.quantity.x) / 2
    mapping.unit = {
      x: midX,
      width: 30
    }
    if (isDev) {
      console.log('[内容解析] 推断单位列位置:', midX)
    }
  }
  
  // 推断数量列位置（如果缺失但有单价）
  if (!mapping.quantity && mapping.unitPrice) {
    mapping.quantity = {
      x: mapping.unitPrice.x - avgGap,
      width: 40
    }
    if (isDev) {
      console.log('[内容解析] 推断数量列位置:', mapping.quantity.x)
    }
  }
  
  // ==== 增强：基于已检测列推断缺失的数值列 ====
  
  // 识别数值列的检测情况
  const numericCols = {
    quantity: mapping.quantity,
    unitPrice: mapping.unitPrice,
    amount: mapping.amount,
    taxRate: mapping.taxRate,
    taxAmount: mapping.taxAmount
  }
  
  const detectedNumericCols = Object.entries(numericCols)
    .filter(([_, col]) => col !== undefined)
    .map(([name, col]) => ({ name, x: col!.x }))
    .sort((a, b) => a.x - b.x)
  
  const missingNumericCols = Object.entries(numericCols)
    .filter(([_, col]) => col === undefined)
    .map(([name]) => name)
  
  if (isDev) {
    console.log('[内容解析] 数值列检测:', {
      detected: detectedNumericCols.map(c => c.name),
      missing: missingNumericCols
    })
  }
  
  // 标准数值列顺序
  const standardOrder = ['quantity', 'unitPrice', 'amount', 'taxRate', 'taxAmount']
  
  // 如果检测到至少一个数值列，基于标准顺序推断缺失列
  if (detectedNumericCols.length > 0) {
    for (const missingCol of missingNumericCols) {
      const missingIndex = standardOrder.indexOf(missingCol)
      
      // 查找相邻的已检测列
      let leftCol: { name: string; x: number } | undefined
      let rightCol: { name: string; x: number } | undefined
      
      for (let i = missingIndex - 1; i >= 0; i--) {
        const col = detectedNumericCols.find(c => c.name === standardOrder[i])
        if (col) {
          leftCol = col
          break
        }
      }
      
      for (let i = missingIndex + 1; i < standardOrder.length; i++) {
        const col = detectedNumericCols.find(c => c.name === standardOrder[i])
        if (col) {
          rightCol = col
          break
        }
      }
      
      // 根据相邻列推断位置
      let inferredX: number
      if (leftCol && rightCol) {
        // 两侧都有列，取中点
        inferredX = (leftCol.x + rightCol.x) / 2
      } else if (leftCol) {
        // 只有左侧列，向右偏移
        const stepsToRight = missingIndex - standardOrder.indexOf(leftCol.name)
        inferredX = leftCol.x + avgGap * stepsToRight
      } else if (rightCol) {
        // 只有右侧列，向左偏移
        const stepsToLeft = standardOrder.indexOf(rightCol.name) - missingIndex
        inferredX = rightCol.x - avgGap * stepsToLeft
      } else {
        continue
      }
      
      (mapping as any)[missingCol] = {
        x: inferredX,
        width: 60
      }
      
      if (isDev) {
        console.log(`[内容解析] 推断${missingCol}列位置:`, Math.round(inferredX), 
          `(基于 left=${leftCol?.name}, right=${rightCol?.name})`)
      }
    }
  }
}

/**
 * 检测所有页面的表格区域
 */
function detectTableRegions(pages: ReconstructedPage[]): (TableRegion | null)[] {
  const regions: (TableRegion | null)[] = []
  
  // 首先从第一页识别列映射
  let globalColumnMapping: ColumnMapping | null = null
  
  for (const page of pages) {
    const headerLine = findTableHeaderLine(page)
    
    if (headerLine && !globalColumnMapping) {
      globalColumnMapping = detectColumnMapping(headerLine)
      if (isDev) {
        console.log('[内容解析] 检测到列映射:', Object.keys(globalColumnMapping).filter(k => (globalColumnMapping as any)[k]))
      }
    }
  }
  
  if (!globalColumnMapping) {
    return regions
  }
  
  // 为每页确定表格区域
  for (const page of pages) {
    const headerLine = findTableHeaderLine(page)
    const footerLine = findTableFooterLine(page)
    
    if (headerLine) {
      regions.push({
        headerY: headerLine.y,
        footerY: footerLine ? footerLine.y : 0,
        columnMapping: globalColumnMapping
      })
    } else if (page.pageNumber > 1) {
      // 多页发票，后续页可能没有表头但有数据
      regions.push({
        headerY: page.viewport.height,
        footerY: footerLine ? footerLine.y : 0,
        columnMapping: globalColumnMapping
      })
    } else {
      regions.push(null)
    }
  }
  
  return regions
}

/**
 * 查找表格表头行
 */
function findTableHeaderLine(page: ReconstructedPage): ReconstructedLine | null {
  for (const line of page.lines) {
    const lineText = line.items.map(item => item.str).join('')
    
    for (const keyword of TABLE_HEADER_KEYWORDS) {
      if (lineText.includes(keyword)) {
        return line
      }
    }
  }
  return null
}

/**
 * 查找表格表尾行（合计行）
 */
function findTableFooterLine(page: ReconstructedPage): ReconstructedLine | null {
  for (const line of page.lines) {
    const lineText = line.items.map(item => item.str).join('')
    
    for (const keyword of TABLE_FOOTER_KEYWORDS) {
      if (lineText.includes(keyword) && !lineText.includes('价税合计')) {
        return line
      }
    }
  }
  return null
}

/**
 * 从表头行检测列映射
 * 直接使用原始文本项匹配列关键词，避免合并导致的位置偏差
 */
function detectColumnMapping(headerLine: ReconstructedLine): ColumnMapping {
  const mapping: ColumnMapping = {}
  
  // Step 1: 过滤掉纯空格的文本项
  const nonSpaceItems = headerLine.items.filter(item => item.str.trim().length > 0)
  
  if (isDev) {
    console.log('[内容解析] 表头非空文本项:', nonSpaceItems.map(item => ({
      text: item.str,
      x: Math.round(item.x),
      width: Math.round(item.width)
    })))
  }
  
  // Step 2: 直接使用非空文本项匹配列关键词
  for (const item of nonSpaceItems) {
    const text = item.str.replace(/\s+/g, '')  // 移除空格便于匹配
    const centerX = item.x + item.width / 2
    
    for (const [field, keywords] of Object.entries(COLUMN_KEYWORDS)) {
      // 如果该字段已匹配，跳过
      if ((mapping as any)[field]) continue
      
      for (const keyword of keywords) {
        const normalizedKeyword = keyword.replace(/\s+/g, '')  // 同样移除关键词中的空格
        if (text.includes(normalizedKeyword)) {
          (mapping as any)[field] = {
            x: centerX,
            width: item.width
          }
          if (isDev) {
            console.log(`[内容解析] 匹配列 ${field}: "${text}" -> x=${Math.round(centerX)}`)
          }
          break
        }
      }
    }
  }
  
  // Step 3: 特殊处理：税率/征收率 可能是拆分的两个文本项
  if (!mapping.taxRate) {
    for (let i = 0; i < nonSpaceItems.length; i++) {
      const item = nonSpaceItems[i]
      if (item.str.includes('税率') || item.str.includes('征收率')) {
        // 查找相邻的"/征收率"
        let combinedWidth = item.width
        const combinedX = item.x
        if (i + 1 < nonSpaceItems.length && nonSpaceItems[i + 1].str.includes('征收率')) {
          combinedWidth = nonSpaceItems[i + 1].x + nonSpaceItems[i + 1].width - item.x
        }
        mapping.taxRate = {
          x: combinedX + combinedWidth / 2,
          width: combinedWidth
        }
        if (isDev) {
          console.log(`[内容解析] 匹配列 taxRate (特殊): x=${Math.round(mapping.taxRate.x)}`)
        }
        break
      }
    }
  }
  
  // Step 3.5: 特殊处理：分隔的两字符列名（如"单 位"、"数 量"、"单 价"、"金 额"）
  const twoCharColumns: Array<{ field: keyof ColumnMapping; chars: [string, string] }> = [
    { field: 'unit', chars: ['单', '位'] },
    { field: 'quantity', chars: ['数', '量'] },
    { field: 'unitPrice', chars: ['单', '价'] },
    { field: 'amount', chars: ['金', '额'] },
    { field: 'taxAmount', chars: ['税', '额'] }
  ]
  
  for (const { field, chars } of twoCharColumns) {
    if (mapping[field]) continue
    
    // 查找第一个字符
    for (let i = 0; i < nonSpaceItems.length; i++) {
      const item = nonSpaceItems[i]
      if (item.str.trim() === chars[0]) {
        // 在后续10个文本项中查找第二个字符
        for (let j = i + 1; j < Math.min(i + 10, nonSpaceItems.length); j++) {
          const nextItem = nonSpaceItems[j]
          if (nextItem.str.trim() === chars[1]) {
            // 找到了配对，计算中心点
            const combinedX = item.x
            const combinedWidth = nextItem.x + nextItem.width - item.x
            mapping[field] = {
              x: combinedX + combinedWidth / 2,
              width: combinedWidth
            }
            if (isDev) {
              console.log(`[内容解析] 匹配列 ${field} (分隔): "${chars[0]}...${chars[1]}" -> x=${Math.round(mapping[field]!.x)}`)
            }
            break
          }
        }
        if (mapping[field]) break
      }
    }
  }
  
  // Step 4: 相对位置推断（当某列未检测到时）
  const mergedItems = mergeAdjacentTextItems(headerLine)
  inferMissingColumns(mapping, mergedItems)
  
  // 输出最终列映射详情
  if (isDev) {
    console.log('[内容解析] 最终列映射:', {
      goodsName: mapping.goodsName ? Math.round(mapping.goodsName.x) : null,
      specification: mapping.specification ? Math.round(mapping.specification.x) : null,
      unit: mapping.unit ? Math.round(mapping.unit.x) : null,
      quantity: mapping.quantity ? Math.round(mapping.quantity.x) : null,
      unitPrice: mapping.unitPrice ? Math.round(mapping.unitPrice.x) : null,
      amount: mapping.amount ? Math.round(mapping.amount.x) : null,
      taxRate: mapping.taxRate ? Math.round(mapping.taxRate.x) : null,
      taxAmount: mapping.taxAmount ? Math.round(mapping.taxAmount.x) : null,
    })
  }
  
  return mapping
}

// ============================================================================
// 第三层: 行提取层(Row Extraction)
// ============================================================================

/**
 * 项目数据结构（用于分组）
 */
interface ItemGroup {
  nameItems: PDFTextItem[]  // 项目名称文本块
  dataItems: PDFTextItem[]  // 数据文本块（规格、单位、数量等）
  startY: number
  endY: number
}

/**
 * 从页面中提取原始内容行
 * 新策略：基于项目起始标记(*类别*)分组
 */
function extractRawContentRows(
  page: ReconstructedPage,
  region: TableRegion
): RawContentRow[] {
  // 1. 收集表格区域内的所有文本块
  const allItems: PDFTextItem[] = []
  for (const line of page.lines) {
    if (line.y >= region.headerY) continue
    if (region.footerY > 0 && line.y <= region.footerY) continue
    
    for (const item of line.items) {
      const text = item.str.trim()
      if (!text || text.length < 1) continue
      // 跳过表头表尾关键词
      if (isHeaderOrFooterLine(text)) continue
      allItems.push(item)
    }
  }
  
  if (allItems.length === 0) return []
  
  // 2. 找出所有项目起始点（以 *类别* 开头的文本）
  const itemStarts: PDFTextItem[] = allItems.filter(item => 
    /^\*[^*]+\*/.test(item.str.trim())
  )
  
  if (itemStarts.length === 0) {
    if (isDev) {
      console.log('[内容解析] 未找到项目起始标记')
    }
    return []
  }
  
  // 按Y坐标排序（从上到下，Y越大越靠上）
  itemStarts.sort((a, b) => b.y - a.y)
  
  if (isDev) {
    console.log('[内容解析] 找到', itemStarts.length, '个项目起始点')
  }
  
  // 3. 为每个项目收集相关的文本块
  const itemGroups: ItemGroup[] = []
  
  for (let i = 0; i < itemStarts.length; i++) {
    const startItem = itemStarts[i]
    const nextItem = itemStarts[i + 1]
    
    // 项目Y坐标范围
    const startY = startItem.y + 10  // 稍微扩大范围
    const endY = nextItem ? nextItem.y + 5 : region.footerY
    
    // 收集该Y范围内的所有文本
    const groupItems = allItems.filter(item => 
      item.y <= startY && item.y > endY
    )
    
    // 分离项目名称和数据
    const nameItems: PDFTextItem[] = []
    const dataItems: PDFTextItem[] = []
    
    // 找到项目名称区域的X边界（左侧区域）
    const nameStartX = startItem.x
    
    // 动态计算字段边界（避免硬编码偏移量）
    const boundaries = calculateFieldBoundaries(nameStartX, region.columnMapping, page.viewport.width)
    
    for (const item of groupItems) {
      const text = item.str.trim()
      if (!text) continue
      
      // 判断是否是数据字段（基于动态边界和内容特征）
      const isNumeric = /^[\d.,-]+$/.test(text)
      const isPercent = /^\d+%$/.test(text) || /^免税$/.test(text) || /^\*{3}$/.test(text)
      // 单位通常是1-4个字符的短文本，在单位列边界之后
      const isPossibleUnit = text.length >= 1 && text.length <= 4 && !isNumeric && !isPercent && item.x > boundaries.unitLeftEdge
      // 规格型号在规格列边界范围内，但不是纯数字或百分比
      const isSpec = item.x > boundaries.specLeftEdge && item.x < boundaries.specRightEdge && !isNumeric && !isPercent && text.length < 50
      
      if (isNumeric || isPercent || isPossibleUnit || isSpec) {
        dataItems.push(item)
      } else {
        // 检查是否是项目名称的一部分（在名称右边界之前）
        if (item.x < boundaries.nameRightEdge || /^\*[^*]+\*/.test(text)) {
          nameItems.push(item)
        } else {
          dataItems.push(item)
        }
      }
    }
    
    itemGroups.push({
      nameItems,
      dataItems,
      startY,
      endY
    })
  }
  
  // 4. 转换为RawContentRow格式
  const rows: RawContentRow[] = itemGroups.map(group => {
    const allGroupItems = [...group.nameItems, ...group.dataItems]
    allGroupItems.sort((a, b) => a.x - b.x)
    
    return {
      y: group.startY,
      items: allGroupItems,
      pageNumber: page.pageNumber
    }
  })
  
  return rows
}

/**
 * 判断是否为表头或表尾行
 */
function isHeaderOrFooterLine(text: string): boolean {
  const skipKeywords = [
    '货物或应税劳务',
    '服务名称',
    '规格型号',
    '合计',
    '价税合计',
    '销售方',
    '购买方',
    '开票人',
    '收款人',
    '复核',
    '备注'
  ]
  
  return skipKeywords.some(keyword => text.includes(keyword))
}

/**
 * 判断是否为应跳过的无关文本
 */
function isIrrelevantText(text: string): boolean {
  const patterns = [
    /^zp\d+/i,                    // 发票编码 zp81055817160
    /^\(\d+,\d+\)$/,              // 括号数字 (00001,345035970218)
    /^注$/,                        // 单独的"注"字
    /^备$/,                        // 单独的"备"字
    /^合$/,                        // 单独的"合"字
    /^计$/,                        // 单独的"计"字
    /^[零壹贰叁肆伍陆柒捌玖拾佰仟万亿圆角分整]+$/, // 大写金额
    /^\d{10,}$/,                   // 长数字串
    /^¥[\d.]+$/,                   // 金额 ¥9.08
    /^￥[\d.]+$/,                  // 金额 ￥9.08
  ]
  
  return patterns.some(p => p.test(text.trim()))
}

/**
 * 判断是否为无效的项目行（根据货物名称）
 */
function isInvalidItemRow(goodsName?: string): boolean {
  if (!goodsName) return false
  
  const invalidPatterns = [
    /^合\s*计$/,          // "合计" 或 "合  计"
    /^小\s*计$/,          // "小计"
    /^备\s*注/,           // "备注"开头
    /^价税合计/,          // "价税合计"开头
    /^[a-z]{2}\d+/i,      // 类似"zp81055862446"的编码
    /^\d{10,}/,           // 纯数字长串
    /^[(（]\d+[)）]/,     // 以括号数字开头
  ]
  
  const trimmed = goodsName.trim()
  return invalidPatterns.some(pattern => pattern.test(trimmed))
}

/**
 * 判断文本是否在指定列的X坐标范围内
 */
function isInColumnRange(itemX: number, colX: number, colWidth: number, tolerance: number = 40): boolean {
  if (colX === 0) return false
  // 文本中心点应该在列范围内（考虑容差）
  return itemX >= colX - colWidth / 2 - tolerance && itemX <= colX + colWidth / 2 + tolerance
}

/** 字段边界（动态计算） */
interface FieldBoundaries {
  nameRightEdge: number     // 项目名称右边界
  specLeftEdge: number      // 规格型号左边界
  specRightEdge: number     // 规格型号右边界
  unitLeftEdge: number      // 单位左边界
  dataStartX: number        // 数据区域起始X
}

/**
 * 动态计算字段边界
 * 基于列映射信息计算，避免硬编码偏移量
 */
function calculateFieldBoundaries(
  nameStartX: number,
  columnMapping: ColumnMapping,
  pageWidth: number
): FieldBoundaries {
  // 如果列映射完整，使用精确边界
  if (columnMapping.specification && columnMapping.unit) {
    return {
      nameRightEdge: columnMapping.specification.x - columnMapping.specification.width / 2 - 10,
      specLeftEdge: columnMapping.specification.x - columnMapping.specification.width / 2 - 15,
      specRightEdge: columnMapping.specification.x + columnMapping.specification.width / 2 + 15,
      unitLeftEdge: columnMapping.unit.x - (columnMapping.unit.width / 2) - 15,
      dataStartX: columnMapping.quantity?.x ? columnMapping.quantity.x - 40 : nameStartX + pageWidth * 0.5,
    }
  }
  
  // 如果只有部分列映射
  if (columnMapping.specification) {
    return {
      nameRightEdge: columnMapping.specification.x - columnMapping.specification.width / 2 - 10,
      specLeftEdge: columnMapping.specification.x - columnMapping.specification.width / 2 - 15,
      specRightEdge: columnMapping.specification.x + columnMapping.specification.width / 2 + 15,
      unitLeftEdge: columnMapping.unit?.x ? columnMapping.unit.x - 15 : nameStartX + pageWidth * 0.38,
      dataStartX: columnMapping.quantity?.x ? columnMapping.quantity.x - 40 : nameStartX + pageWidth * 0.45,
    }
  }
  
  if (columnMapping.unit) {
    return {
      nameRightEdge: columnMapping.unit.x - columnMapping.unit.width / 2 - 30,
      specLeftEdge: nameStartX + pageWidth * 0.25,
      specRightEdge: columnMapping.unit.x - columnMapping.unit.width / 2 - 10,
      unitLeftEdge: columnMapping.unit.x - columnMapping.unit.width / 2 - 15,
      dataStartX: columnMapping.quantity?.x ? columnMapping.quantity.x - 40 : nameStartX + pageWidth * 0.45,
    }
  }
  
  // Fallback: 使用百分比布局
  return {
    nameRightEdge: nameStartX + pageWidth * 0.28,
    specLeftEdge: nameStartX + pageWidth * 0.25,
    specRightEdge: nameStartX + pageWidth * 0.38,
    unitLeftEdge: nameStartX + pageWidth * 0.38,
    dataStartX: nameStartX + pageWidth * 0.45,
  }
}

/** 数值字段（带坐标信息） */
interface NumericField {
  value: string
  x: number
  column?: 'quantity' | 'unitPrice' | 'amount' | 'taxAmount'
}

/**
 * 将数值字段匹配到对应的列
 * 基于X坐标与列中心点的距离进行匹配
 * 使用列宽度的一半加固定值作为动态容差
 */
function matchNumericFieldToColumn(
  field: NumericField,
  columnMapping: ColumnMapping,
  baseTolerance: number = 25
): 'quantity' | 'unitPrice' | 'amount' | 'taxAmount' | undefined {
  const columns: Array<{ name: 'quantity' | 'unitPrice' | 'amount' | 'taxAmount'; col: { x: number; width: number } | undefined }> = [
    { name: 'quantity', col: columnMapping.quantity },
    { name: 'unitPrice', col: columnMapping.unitPrice },
    { name: 'amount', col: columnMapping.amount },
    { name: 'taxAmount', col: columnMapping.taxAmount },
  ]
  
  // 统计有效列数，用于自适应容差
  const validColumnCount = columns.filter(c => c.col).length
  
  // 自适应容差：列数越多，容差越小（避免重叠）
  const adaptiveTolerance = validColumnCount >= 4 ? baseTolerance * 0.8 : 
                           validColumnCount === 3 ? baseTolerance : 
                           baseTolerance * 1.2
  
  let bestMatch: { name: 'quantity' | 'unitPrice' | 'amount' | 'taxAmount'; distance: number } | undefined = undefined
  
  for (const { name, col } of columns) {
    if (!col) continue
    
    const distance = Math.abs(field.x - col.x)
    // 优化容差计算：使用自适应基础容差
    const tolerance = Math.min(adaptiveTolerance, col.width * 0.6)
    
    if (distance <= tolerance) {
      if (!bestMatch || distance < bestMatch.distance) {
        bestMatch = { name, distance }
      }
    }
  }
  
  // 如果没有匹配，尝试查找最近的列（不超过2倍自适应容差）
  if (!bestMatch) {
    for (const { name, col } of columns) {
      if (!col) continue
      
      const distance = Math.abs(field.x - col.x)
      if (distance <= adaptiveTolerance * 2) {
        if (!bestMatch || distance < bestMatch.distance) {
          bestMatch = { name, distance }
        }
      }
    }
  }
  
  return bestMatch ? bestMatch.name : undefined
}

/**
 * 使用启发式顺序分配未匹配的数值字段
 * 按发票标准顺序: 数量 -> 单价 -> 金额 -> 税额
 * 增强：基于数值特征进行智能分配
 */
function assignUnmatchedNumericFields(
  item: InvoiceContentItem,
  unmatchedFields: NumericField[]
): void {
  // 按X坐标排序（从左到右）
  const sortedFields = [...unmatchedFields].sort((a, b) => a.x - b.x)
  
  // 确定需要分配的字段列表
  const fieldsToAssign: ('quantity' | 'unitPrice' | 'amount' | 'taxAmount')[] = []
  if (!item.quantity) fieldsToAssign.push('quantity')
  if (!item.unitPrice) fieldsToAssign.push('unitPrice')
  if (!item.amount) fieldsToAssign.push('amount')
  if (!item.taxAmount) fieldsToAssign.push('taxAmount')
  
  if (isDev) {
    console.log('[内容解析] 启发式分配 - 待分配字段:', fieldsToAssign, '未匹配数值:', sortedFields.map(f => f.value))
  }
  
  // 数值特征分析
  const analyzeNumericValue = (val: string): { likelyQuantity: boolean; likelyTax: boolean; magnitude: number } => {
    const num = parseFloat(val)
    const isSmall = num <= 20  // 可能是数量
    const hasDecimals = val.includes('.') && val.split('.')[1].length === 2  // 精确到分
    
    return {
      likelyQuantity: isSmall && !hasDecimals,  // 数量通常是整数或简单小数
      likelyTax: hasDecimals && num < 1000,     // 税额通常是带两位小数的中小数值
      magnitude: num
    }
  }
  
  // 智能分配策略
  if (sortedFields.length === fieldsToAssign.length) {
    // 数值数量与待分配字段数量匹配
    // 如果有4个未匹配数值，尝试基于特征智能分配
    if (sortedFields.length === 4 && fieldsToAssign.length === 4) {
      const analyzed = sortedFields.map(f => ({ 
        field: f, 
        ...analyzeNumericValue(f.value) 
      }))
      
      // 按标准顺序分配，但优先考虑特征
      // 数量：通常最小且可能是整数
      const quantityIdx = analyzed.findIndex(a => a.likelyQuantity) 
      if (quantityIdx >= 0) {
        item.quantity = analyzed[quantityIdx].field.value
        analyzed.splice(quantityIdx, 1)
      } else {
        item.quantity = sortedFields[0].value
        analyzed.splice(0, 1)
      }
      
      // 税额：通常最小的带两位小数的值
      const taxIdx = analyzed.findIndex(a => a.likelyTax)
      if (taxIdx >= 0) {
        item.taxAmount = analyzed[taxIdx].field.value
        analyzed.splice(taxIdx, 1)
      } else {
        item.taxAmount = analyzed[analyzed.length - 1].field.value
        analyzed.pop()
      }
      
      // 剩余两个：单价和金额（金额通常稍大）
      if (analyzed.length === 2) {
        if (analyzed[0].magnitude > analyzed[1].magnitude) {
          item.amount = analyzed[0].field.value
          item.unitPrice = analyzed[1].field.value
        } else {
          item.unitPrice = analyzed[0].field.value
          item.amount = analyzed[1].field.value
        }
      }
    } else {
      // 按位置顺序分配
      for (let i = 0; i < sortedFields.length; i++) {
        const field = fieldsToAssign[i]
        const value = sortedFields[i].value
        if (field === 'quantity') item.quantity = value
        else if (field === 'unitPrice') item.unitPrice = value
        else if (field === 'amount') item.amount = value
        else if (field === 'taxAmount') item.taxAmount = value
      }
    }
  } else if (sortedFields.length > fieldsToAssign.length) {
    // 数值比待分配字段多，按位置分配前N个
    for (let i = 0; i < fieldsToAssign.length && i < sortedFields.length; i++) {
      const field = fieldsToAssign[i]
      const value = sortedFields[i].value
      if (field === 'quantity') item.quantity = value
      else if (field === 'unitPrice') item.unitPrice = value
      else if (field === 'amount') item.amount = value
      else if (field === 'taxAmount') item.taxAmount = value
    }
  } else {
    // 数值比待分配字段少，从后向前分配（优先保证金额、税额）
    const reversedFields = [...fieldsToAssign].reverse()
    const reversedValues = [...sortedFields].reverse()
    
    for (let i = 0; i < reversedValues.length && i < reversedFields.length; i++) {
      const field = reversedFields[i]
      const value = reversedValues[i].value
      if (field === 'quantity') item.quantity = value
      else if (field === 'unitPrice') item.unitPrice = value
      else if (field === 'amount') item.amount = value
      else if (field === 'taxAmount') item.taxAmount = value
    }
  }
}

/**
 * 解析单行内容为项目对象
 * 基于表头检测到的列位置进行字段识别，避免硬编码
 */
function parseContentRow(
  row: RawContentRow,
  columnMapping: ColumnMapping,
  pageWidth: number,  // 页面宽度，用于动态边界计算
  meta: {
    fileId: string
    fileName: string
    invoiceNumber?: string
    invoiceDate?: string
    invoiceType?: string
    lineNumber: number
    pageNumber: number
  }
): InvoiceContentItem {
  const item: InvoiceContentItem = {
    id: generateUUID(),
    sourceInvoiceNumber: meta.invoiceNumber,
    sourceInvoiceDate: meta.invoiceDate,
    sourceInvoiceType: meta.invoiceType,
    sourceFileName: meta.fileName,
    sourceFileId: meta.fileId,
    lineNumber: meta.lineNumber,
    status: 'success',
    parseTime: new Date().toISOString()
  }
  
  // 分类收集各类数据
  const nameTexts: string[] = []
  const specTexts: string[] = []
  const numericFields: NumericField[] = []  // 带坐标的数值字段
  let unitValue: string | undefined
  let taxRateValue: string | undefined
  let smartSplitResult: SplitNumericResult | null = null  // 智能拆分结果
  
  // 找到项目名称起始位置（*xxx*）
  const nameStartItem = row.items.find(i => /^\*[^*]+\*/.test(i.str))
  const nameStartX = nameStartItem ? nameStartItem.x : 0
  
  // 动态计算字段边界（避免硬编码偏移量）
  const boundaries = calculateFieldBoundaries(nameStartX, columnMapping, pageWidth)
  
  // 获取各列的X坐标（从表头检测）
  const specColumn = columnMapping.specification
  const unitColumn = columnMapping.unit
  const quantityColumn = columnMapping.quantity
  const unitPriceColumn = columnMapping.unitPrice
  const amountColumn = columnMapping.amount
  const taxAmountColumn = columnMapping.taxAmount
  
  const specColX = specColumn ? specColumn.x : 0
  const specColWidth = specColumn ? specColumn.width : 50
  const unitColX = unitColumn ? unitColumn.x : 0
  const unitColWidth = unitColumn ? unitColumn.width : 30
  const quantityColX = quantityColumn ? quantityColumn.x : 0
  
  // 需要过滤的无效文本模式
  const invalidTextPatterns = [
    /^\(小写\)$/,
    /^[(（]小写[)）]$/,
    /^备注/,
    /^合计/,
    /^价税合计/,
    /^￥/,
    /^¥/,
    /^[零壹贰叁肆伍陆柒捌玖拾佰仟万亿圆角分整]+$/  // 大写金额
  ]
  
  // 按X坐标排序，便于调试
  const sortedItems = [...row.items].sort((a, b) => a.x - b.x)
  
  for (const textItem of sortedItems) {
    const text = textItem.str.trim()
    if (!text) continue
    
    // 跳过无效文本
    if (invalidTextPatterns.some(p => p.test(text))) continue
    
    // 跳过无关文本（发票编码、开票人等）
    if (isIrrelevantText(text)) continue
    
    // 1. 税率（带%或免税或***）- 优先级最高
    if (/^\d+%$/.test(text)) {
      taxRateValue = text
      continue
    }
    if (/^免税$/.test(text) || /^\*{2,}$/.test(text)) {
      taxRateValue = '免税'
      continue
    }
    
    // 2. 项目名称（以*开头的标记）- 优先级最高
    if (/^\*[^*]+\*/.test(text)) {
      nameTexts.push(text)
      continue
    }
    
    // 3. 基于列位置判断 - 核心逻辑
    
    // 3.1 单位列：基于列位置识别（短文本且在单位列范围内）
    if (unitColX > 0 && isInColumnRange(textItem.x, unitColX, unitColWidth, 25)) {
      // 单位通常是1-4个汉字或字母
      if (text.length >= 1 && text.length <= 4 && !/^[\d.,-]+$/.test(text)) {
        unitValue = text
        continue
      }
    }
    
    // 3.2 规格型号列：基于列位置识别
    if (specColX > 0 && isInColumnRange(textItem.x, specColX, specColWidth, 35)) {
      // 规格型号可以是数字（如"3100003"），也可以是文字
      // 注意：纯数字规格通常不带小数点和逗号，且位数较长（>=6位）
      const isPureDigitSpec = /^\d{6,}$/.test(text)  // 6位以上纯数字视为规格型号
      if (isPureDigitSpec || (!isNumericValue(text) && text.length < 50)) {
        specTexts.push(text)
        continue
      }
    }
    
    // 4. 数值（纯数字或带小数点）- 记录X坐标用于列匹配
    // 特殊处理：包含税率的连接字符串（如"52.2113%"）
    if (text.includes('%') && /\d/.test(text) && !/^\d+%$/.test(text)) {
      // 尝试智能拆分连接的数值+税率字符串
      const splitResult = splitConcatenatedNumericString(text)
      if (splitResult) {
        smartSplitResult = splitResult
        if (splitResult.taxRate) {
          taxRateValue = splitResult.taxRate
        }
        if (isDev) {
          console.log('[内容解析] 智能拆分:', text, '->', splitResult)
        }
      }
      continue
    }
    
    if (/^[\d.,-]+$/.test(text) && text !== '-') {
      const nums = extractAllNumbers(text)
      nums.forEach(num => {
        numericFields.push({
          value: num,
          x: textItem.x
        })
      })
      continue
    }
    
    // 5. 启发式规格型号判断（当列位置检测不可用时的备用方案）
    // 规格型号通常在项目名称右侧、单位列左侧
    if (specColX === 0 && unitColX > 0) {
      // 在项目名称和单位列之间的非数字文本
      if (textItem.x > boundaries.specLeftEdge && textItem.x < boundaries.unitLeftEdge && 
          !isNumericValue(text) && text.length < 40) {
        specTexts.push(text)
        continue
      }
    } else if (specColX === 0 && quantityColX > 0) {
      // 在项目名称和数量列之间
      if (textItem.x > boundaries.specLeftEdge && textItem.x < quantityColX - 15 && 
          !isNumericValue(text) && text.length < 40) {
        specTexts.push(text)
        continue
      }
    }
    
    // 6. 项目名称续行（在名称右边界之前）
    if (nameStartItem && textItem.x < boundaries.nameRightEdge) {
      nameTexts.push(text)
      continue
    }
    
    // 7. 默认处理：短文本可能是单位或规格
    // 如果在规格型号列的大致范围内
    if (textItem.x > boundaries.specLeftEdge && textItem.x < boundaries.specRightEdge) {
      if (!isNumericValue(text) && text.length < 40) {
        specTexts.push(text)
        continue
      }
    }
    
    // 8. 其他情况归入项目名称
    nameTexts.push(text)
  }
  
  // 组装项目名称
  item.goodsName = nameTexts.join('')
  
  // 组装规格型号，过滤掉明显不是规格的文本
  const validSpecs = specTexts.filter(s => {
    return s.length > 0 && s.length < 50
  })
  if (validSpecs.length > 0) {
    item.specification = validSpecs.join(' ')
  }
  
  // 单位
  if (unitValue) {
    item.unit = unitValue
  }
  
  // 税率
  if (taxRateValue) {
    item.taxRate = taxRateValue
  }
  
  if (isDev) {
    console.log('[内容解析] 数值字段:', numericFields.map(f => ({ value: f.value, x: Math.round(f.x) })), '税率:', taxRateValue, '单位列X:', unitColX, '规格列X:', specColX)
    console.log('[内容解析] 列坐标 - 数量:', quantityColX, '单价:', unitPriceColumn?.x, '金额:', amountColumn?.x, '税额:', taxAmountColumn?.x)
  }
  
  // 分配数值字段（数量、单价、金额、税额）- 基于坐标匹配
  // Step 1: 尝试基于列坐标匹配每个数值字段
  for (const field of numericFields) {
    field.column = matchNumericFieldToColumn(field, columnMapping)
    if (isDev && field.column) {
      console.log(`[内容解析] 数值 ${field.value} (x=${Math.round(field.x)}) 匹配到列: ${field.column}`)
    }
  }
  
  // Step 2: 分配已匹配的字段
  const quantityField = numericFields.find(f => f.column === 'quantity')
  const unitPriceField = numericFields.find(f => f.column === 'unitPrice')
  const amountField = numericFields.find(f => f.column === 'amount')
  const taxAmountField = numericFields.find(f => f.column === 'taxAmount')
  
  if (quantityField) item.quantity = quantityField.value
  if (unitPriceField) item.unitPrice = unitPriceField.value
  if (amountField) item.amount = amountField.value
  if (taxAmountField) item.taxAmount = taxAmountField.value
  
  // Step 2.5: 预先应用智能拆分结果（优先级最高，直接覆盖）
  // 智能拆分通过业务规则验证，比坐标匹配更可靠
  if (smartSplitResult) {
    if (isDev) {
      console.log('[内容解析] Step 2.5 - 应用智能拆分, 当前item:', { qty: item.quantity, price: item.unitPrice, amt: item.amount, tax: item.taxAmount })
      console.log('[内容解析] Step 2.5 - smartSplitResult:', smartSplitResult)
    }
    // 直接覆盖，不检查是否为空
    if (smartSplitResult.quantity) {
      item.quantity = smartSplitResult.quantity
    }
    if (smartSplitResult.unitPrice) {
      item.unitPrice = smartSplitResult.unitPrice
    }
    if (smartSplitResult.amount) {
      item.amount = smartSplitResult.amount
    }
    if (smartSplitResult.taxAmount) {
      item.taxAmount = smartSplitResult.taxAmount
    }
    if (isDev) {
      console.log('[内容解析] Step 2.5 - 应用后item:', { qty: item.quantity, price: item.unitPrice, amt: item.amount, tax: item.taxAmount })
    }
  }
  
  // Step 3: 使用启发式方法分配未匹配的字段（仅当智能拆分未提供时）
  const unmatchedFields = numericFields.filter(f => !f.column)
  if (unmatchedFields.length > 0 && !smartSplitResult) {
    // 只在没有智能拆分结果时才使用启发式分配
    if (isDev) {
      console.log('[内容解析] 未匹配数值字段:', unmatchedFields.map(f => ({ value: f.value, x: Math.round(f.x) })))
    }
    assignUnmatchedNumericFields(item, unmatchedFields)
  }
  
  // Step 4: 最终确认智能拆分结果应用（智能拆分结果通过业务规则验证，优先级最高）
  if (smartSplitResult) {
    // 智能拆分的所有结果都应该被优先使用
    if (smartSplitResult.quantity) {
      item.quantity = smartSplitResult.quantity
    }
    if (smartSplitResult.unitPrice) {
      item.unitPrice = smartSplitResult.unitPrice
    }
    if (smartSplitResult.amount) {
      item.amount = smartSplitResult.amount
    }
    if (smartSplitResult.taxAmount) {
      item.taxAmount = smartSplitResult.taxAmount
    }
    if (isDev) {
      console.log('[内容解析] Step 4 - 最终应用智能拆分:', smartSplitResult)
    }
  }
  
  // 免税发票：税额可能显示为0或空
  if (item.taxRate === '免税' && !item.taxAmount) {
    item.taxAmount = '0'
  }
  
  // 处理连接的金额和税额（如"9.080.82"应为金额9.08+税额0.82）
  splitConcatenatedAmounts(item)
  
  if (isDev) {
    console.log('[内容解析] 最终结果:', item.goodsName?.substring(0, 20), '| 数量:', item.quantity, '| 单价:', item.unitPrice, '| 金额:', item.amount, '| 税额:', item.taxAmount)
  }
  
  return item
}

/**
 * 智能拆分连接的数值字符串（处理包含税率的复杂连接）
 * 例如: "52.2113%" -> { amount: "52.21", taxRate: "13%" }
 *       "137.9637.9613%4.94" -> { quantity: "1", unitPrice: "37.96", amount: "37.96", taxRate: "13%", taxAmount: "4.94" }
 */
interface SplitNumericResult {
  quantity?: string
  unitPrice?: string
  amount?: string
  taxRate?: string
  taxAmount?: string
}

/**
 * 验证数字字符串格式是否有效
 * 有效格式: "123", "123.45", "0.45"
 * 无效格式: "55.", "0055", "00.5"
 */
function isValidNumberFormat(str: string): boolean {
  if (!str || !/^\d+\.?\d*$/.test(str)) return false
  // 不能以.结尾
  if (str.endsWith('.')) return false
  // 处理前导零：只允许 "0" 或 "0.xx"
  if (str.length > 1 && str[0] === '0' && str[1] !== '.') return false
  return true
}

function splitConcatenatedNumericString(str: string): SplitNumericResult | null {
  const cleaned = str.replace(/[,，\s￥¥]/g, '')
  
  // 查找税率 (1%, 3%, 6%, 9%, 13%, 0%)
  const taxRateMatch = cleaned.match(/(1[39]|[01369])%/)
  if (!taxRateMatch) {
    return null // 没有税率，使用旧的处理方式
  }
  
  const taxRateIdx = cleaned.lastIndexOf(taxRateMatch[0])
  const taxRate = taxRateMatch[0]
  const beforeTaxRate = cleaned.substring(0, taxRateIdx)
  const afterTaxRate = cleaned.substring(taxRateIdx + taxRate.length)
  
  // 提取税额（税率后面的数字）
  const taxAmount = afterTaxRate.match(/^[\d.]+/) ? afterTaxRate.match(/^[\d.]+/)![0] : undefined
  const hasTaxAmount = !!taxAmount && parseFloat(taxAmount) > 0
  
  // 没有前缀数字，只有税率（可能还有税额）
  if (!beforeTaxRate) {
    return { taxRate, taxAmount }
  }
  
  // 解析税率数值用于反向验证
  const taxRateNum = parseFloat(taxRate.replace('%', '')) / 100
  
  // 尝试枚举所有可能的拆分方式
  type SplitCandidate = {
    quantity?: string
    unitPrice?: string
    amount?: string
    score: number
  }
  
  const candidates: SplitCandidate[] = []
  
  // 策略1: 尝试从前缀中拆分出 [数量] + [单价] + [金额]
  // 遍历所有可能的金额起始位置
  for (let amtStart = 0; amtStart < beforeTaxRate.length; amtStart++) {
    const amountStr = beforeTaxRate.substring(amtStart)
    const amountNum = parseFloat(amountStr)
    
    if (isNaN(amountNum) || amountNum <= 0) continue
    
    // 验证金额格式（应该是有效数字）
    if (!isValidNumberFormat(amountStr)) continue
    
    const prefix = beforeTaxRate.substring(0, amtStart)
    
    // 如果没有前缀，这是"纯金额"的情况
    if (!prefix) {
      // 计算期望的税额来验证
      if (hasTaxAmount) {
        const expectedTaxAmount = amountNum * taxRateNum
        const actualTaxAmount = parseFloat(taxAmount!)
        const tolerance = Math.max(0.02, actualTaxAmount * 0.01)
        if (Math.abs(expectedTaxAmount - actualTaxAmount) <= tolerance) {
          candidates.push({ amount: amountStr, score: 0 })
        }
      } else {
        // 没有税额的情况，纯金额匹配得分最低（最优先）
        candidates.push({ amount: amountStr, score: 0 })
      }
      continue
    }
    
    // 有前缀的情况，尝试拆分为 [数量] + [单价]
    for (let upStart = 0; upStart <= prefix.length; upStart++) {
      const qtyStr = prefix.substring(0, upStart)
      const upStr = prefix.substring(upStart)
      
      // 情况A: 有数量和单价
      if (qtyStr && upStr) {
        const qtyNum = parseFloat(qtyStr)
        const upNum = parseFloat(upStr)
        
        if (isNaN(qtyNum) || isNaN(upNum) || qtyNum <= 0 || upNum <= 0) continue
        if (!isValidNumberFormat(qtyStr) || !isValidNumberFormat(upStr)) continue
        
        // 验证: 数量 * 单价 ≈ 金额
        const expectedAmount = qtyNum * upNum
        const tolerance = Math.max(0.02, amountNum * 0.01)
        if (Math.abs(expectedAmount - amountNum) <= tolerance) {
          // 如果有税额，还要验证税额
          if (hasTaxAmount) {
            const expectedTaxAmount = amountNum * taxRateNum
            const actualTaxAmount = parseFloat(taxAmount!)
            const taxTolerance = Math.max(0.02, actualTaxAmount * 0.01)
            if (Math.abs(expectedTaxAmount - actualTaxAmount) <= taxTolerance) {
              candidates.push({ quantity: qtyStr, unitPrice: upStr, amount: amountStr, score: 1 })
            }
          } else {
            candidates.push({ quantity: qtyStr, unitPrice: upStr, amount: amountStr, score: 2 })
          }
        }
      }
      
      // 情况B: 只有数量（单价 = 金额 / 数量）
      if (qtyStr && !upStr) {
        const qtyNum = parseFloat(qtyStr)
        if (isNaN(qtyNum) || qtyNum <= 0) continue
        if (!isValidNumberFormat(qtyStr)) continue
        
        // 验证是否为整数数量
        if (Number.isInteger(qtyNum)) {
          // 如果有税额，验证
          if (hasTaxAmount) {
            const expectedTaxAmount = amountNum * taxRateNum
            const actualTaxAmount = parseFloat(taxAmount!)
            const tolerance = Math.max(0.02, actualTaxAmount * 0.01)
            if (Math.abs(expectedTaxAmount - actualTaxAmount) <= tolerance) {
              candidates.push({ quantity: qtyStr, amount: amountStr, score: 3 })
            }
          } else {
            // 没有税额，给较高的score（不太优先）
            candidates.push({ quantity: qtyStr, amount: amountStr, score: 10 })
          }
        }
      }
      
      // 情况C: 只有单价（金额 = 单价，数量 = 1）
      if (!qtyStr && upStr) {
        const upNum = parseFloat(upStr)
        if (isNaN(upNum) || upNum <= 0) continue
        if (!isValidNumberFormat(upStr)) continue
        
        // 验证: 单价 ≈ 金额（即数量为1）
        const tolerance = Math.max(0.02, amountNum * 0.01)
        if (Math.abs(upNum - amountNum) <= tolerance) {
          if (hasTaxAmount) {
            const expectedTaxAmount = amountNum * taxRateNum
            const actualTaxAmount = parseFloat(taxAmount!)
            const taxTolerance = Math.max(0.02, actualTaxAmount * 0.01)
            if (Math.abs(expectedTaxAmount - actualTaxAmount) <= taxTolerance) {
              candidates.push({ unitPrice: upStr, amount: amountStr, score: 2 })
            }
          } else {
            candidates.push({ unitPrice: upStr, amount: amountStr, score: 3 })
          }
        }
      }
    }
  }
  
  // 选择得分最低的候选
  if (candidates.length > 0) {
    candidates.sort((a, b) => a.score - b.score)
    const best = candidates[0]
    return {
      quantity: best.quantity,
      unitPrice: best.unitPrice,
      amount: best.amount,
      taxRate,
      taxAmount
    }
  }
  
  // 没有找到有效拆分，返回基本结果
  return {
    amount: beforeTaxRate,
    taxRate,
    taxAmount
  }
}

/**
 * 从文本中提取所有数值（处理连接的数值如"9.080.82"）
 * 注意：发票金额不会有负数，所以不匹配负号
 */
function extractAllNumbers(text: string): string[] {
  // 特殊处理：如果包含逗号（千分位），跳过数值提取
  // 这些文本应该在规格型号列中处理，不作为数值字段
  if (/[,，]/.test(text)) {
    return []
  }
  
  // 清理非数字字符（保留小数点，移除负号和其他符号）
  const cleaned = text.replace(/[,，\s￥¥\-]/g, '')
  
  // 如果清理后为空或不包含数字，返回空数组
  if (!cleaned || !/\d/.test(cleaned)) {
    return []
  }
  
  // 检测连接的数值模式
  // 模式1: 两个带两位小数的数连接（如 "9.080.82" -> ["9.08", "0.82"]）
  const twoDecimalMatch = cleaned.match(/^(\d+\.\d{2})(\d+\.\d{2})$/)
  if (twoDecimalMatch) {
    return [twoDecimalMatch[1], twoDecimalMatch[2]]
  }
  
  // 模式2: 小数+小数，不限制小数位数（如 "33.962.04"）
  // 通过查找第二个小数点来分割
  const decimalPoints = [...cleaned.matchAll(/\./g)]
  if (decimalPoints.length === 2) {
    // 找到第二个小数点的位置
    const secondDotIndex = cleaned.indexOf('.', cleaned.indexOf('.') + 1)
    // 向前查找数字开始的位置（第二个数字的开头）
    let splitIndex = secondDotIndex - 1
    while (splitIndex > 0 && /\d/.test(cleaned[splitIndex - 1])) {
      // 检查是否是合理的分割点（前面的数字是小数部分）
      const beforePart = cleaned.substring(0, splitIndex)
      const afterPart = cleaned.substring(splitIndex)
      // 如果前面部分是有效小数（有.且.后有数字），后面部分也是有效数字
      if (/^\d+\.\d+$/.test(beforePart) && /^\d+\.\d+$/.test(afterPart)) {
        return [beforePart, afterPart]
      }
      splitIndex--
    }
  }
  
  // 普通数值：提取所有独立的正数（不匹配负号）
  const numbers = cleaned.match(/\d+\.?\d*/g)
  return numbers ? numbers.filter(n => n && n !== '.' && parseFloat(n) > 0) : []
}

/**
 * 拆分连接的金额和税额
 * 如 amount="9.080.82" 应拆分为 amount="9.08", taxAmount="0.82"
 * 注意：只在确实是连接格式时才拆分，避免破坏已正确设置的值
 */
function splitConcatenatedAmounts(item: InvoiceContentItem): void {
  // 检查金额是否为连接格式（两个带两位小数的数连在一起）
  // 只有当taxAmount为空且金额看起来像是连接格式时才处理
  if (item.amount && !item.taxAmount) {
    // 严格匹配：必须是两个完整的两位小数数字连接
    const match = item.amount.match(/^(\d+\.\d{2})(\d+\.\d{2})$/)
    if (match) {
      const amt1 = parseFloat(match[1])
      const amt2 = parseFloat(match[2])
      // 验证：第二个数应该明显小于第一个数（税额通常是金额的13%左右）
      if (amt2 < amt1 && amt2 / amt1 < 0.2) {
        item.amount = match[1]
        item.taxAmount = match[2]
        if (isDev) {
          console.log('[内容解析] 拆分连接金额:', match[1], '+', match[2])
        }
      }
    }
  }
}

/**
 * 判断是否为数值
 */
function isNumericValue(value: string): boolean {
  return /^[\d.,\-￥¥%]+$/.test(value.trim())
}

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 提取发票号码
 */
function extractInvoiceNumber(pages: ReconstructedPage[]): string | undefined {
  if (pages.length === 0) return undefined
  const firstPage = pages[0]
  
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
  
  // 降级：在全文搜索20位数字
  for (const page of pages) {
    for (const line of page.lines) {
      const lineText = line.items.map(item => item.str).join('')
      const match = lineText.match(/(\d{20})/)
      if (match) {
        return match[1]
      }
    }
  }
  
  return undefined
}

/**
 * 提取发票日期
 */
function extractInvoiceDate(pages: ReconstructedPage[]): string | undefined {
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

/**
 * 提取发票类型（普票/专票）
 * 普通电子发票统一转换为'普票'
 */
function extractInvoiceType(pages: ReconstructedPage[]): string | undefined {
  if (pages.length === 0) return undefined
  const firstPage = pages[0]
  
  // 头部区域扫描（顶部80%以上）
  const headerThreshold = firstPage.viewport.height * 0.8
  
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
  
  // 降级：全文搜索
  for (const page of pages) {
    for (const line of page.lines) {
      const lineText = line.items.map(item => item.str).join('')
      if (/增值税专用发票/.test(lineText)) return '专票'
      if (/普通发票/.test(lineText)) return '普票'
    }
  }
  
  return undefined
}

/**
 * 读取文件为ArrayBuffer
 */
function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = () => reject(new Error('文件读取失败'))
    reader.readAsArrayBuffer(file)
  })
}

/**
 * 生成UUID
 */
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}
