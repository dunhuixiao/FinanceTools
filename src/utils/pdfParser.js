/**
 * PDF 解析工具
 */
import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

// 配置 PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker

// 判断是否为开发环境
const isDev = import.meta.env.DEV

/**
 * 从 PDF 文件提取文本
 */
export async function extractTextFromPDF(file) {
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
      const pageText = textContent.items.map(item => item.str).join(' ')
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
    throw new Error(`PDF 文本提取失败: ${error.message}`)
  }
}

/**
 * 从 PDF 文本中提取发票信息
 */
export function extractInvoiceDataFromText(text) {
  const data = {
    invoiceType: null,
    invoiceCode: null,
    purchaserName: null,
    sellerName: null,
    totalAmount: null,
    issueDate: null
  }
  
  try {
    console.log('[发票解析] 开始提取发票信息')
    if (isDev) console.log('[发票解析] 原始文本:', text)
    
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
    
    // 提取价税合计(小写)
    const smallWriteIndex = text.indexOf('(小写)')
    if (smallWriteIndex !== -1) {
      const afterSmallWrite = text.substring(smallWriteIndex)
      // 找所有的金额(¥ 后面的数字)
      const amounts = afterSmallWrite.match(/¥\s*([\d,.]+)/g)
      if (amounts && amounts.length > 0) {
        // 取最后一个金额作为价税合计
        const lastAmount = amounts[amounts.length - 1]
        const amountMatch = lastAmount.match(/¥\s*([\d,.]+)/)
        if (amountMatch) {
          data.totalAmount = amountMatch[1].replace(/,/g, '')
          if (isDev) console.log('[发票解析] 价税合计:', data.totalAmount)
        }
      }
    }
    
    if (isDev && !data.totalAmount) {
      console.warn('[发票解析] 未找到价税合计')
    }
    
    console.log('[发票解析] 信息提取完成')
    if (isDev) console.log('[发票解析] 提取结果:', data)
    return data
  } catch (error) {
    console.error('[发票解析] 错误:', error)
    throw new Error(`发票信息提取失败: ${error.message}`)
  }
}

/**
 * 解析 PDF 发票文件
 */
export async function parsePDFInvoice(file) {
  try {
    const text = await extractTextFromPDF(file)
    const data = extractInvoiceDataFromText(text)
    return data
  } catch (error) {
    throw new Error(`PDF 发票解析失败: ${error.message}`)
  }
}

/**
 * 读取文件为 ArrayBuffer
 */
function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    
    reader.onload = (e) => {
      resolve(e.target.result)
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
export function validatePDFInvoiceData(data) {
  const errors = []
  
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
    errors
  }
}
