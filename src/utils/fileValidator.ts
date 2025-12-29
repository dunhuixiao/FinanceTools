/**
 * 文件验证工具
 */

// 支持的文件格式
export const SUPPORTED_FORMATS = {
  PDF: 'application/pdf',
  XML: 'text/xml',
  XML_ALT: 'application/xml'
} as const

// 文件大小限制 (10MB)
export const MAX_FILE_SIZE = 10 * 1024 * 1024

// 单次上传文件数量限制
export const MAX_FILE_COUNT = 100

interface ValidationResult {
  valid: boolean
  errors: string[]
}

interface FileValidationResult extends ValidationResult {
  file: File
}

interface FilesValidationResult {
  valid: boolean
  error?: string
  results?: FileValidationResult[]
  validFiles: File[]
  invalidCount?: number
}

/**
 * 验证文件格式
 */
export function validateFileFormat(file: File): boolean {
  const validTypes = Object.values(SUPPORTED_FORMATS)
  const isValidType = validTypes.includes(file.type as any)
  const isPdf = file.name.toLowerCase().endsWith('.pdf')
  const isXml = file.name.toLowerCase().endsWith('.xml')
  
  return isValidType || isPdf || isXml
}

/**
 * 验证文件大小
 */
export function validateFileSize(file: File): boolean {
  return file.size <= MAX_FILE_SIZE
}

/**
 * 验证文件
 */
export function validateFile(file: File): ValidationResult {
  const errors: string[] = []
  
  if (!validateFileFormat(file)) {
    errors.push(`文件格式不支持，仅支持 PDF 和 XML 格式`)
  }
  
  if (!validateFileSize(file)) {
    errors.push(`文件大小超过限制（最大 10MB）`)
  }
  
  return {
    valid: errors.length === 0,
    errors
  }
}

/**
 * 批量验证文件
 */
export function validateFiles(files: File[]): FilesValidationResult {
  const results: FileValidationResult[] = []
  const validFiles: File[] = []
  
  if (files.length > MAX_FILE_COUNT) {
    return {
      valid: false,
      error: `文件数量超过限制（最大 ${MAX_FILE_COUNT} 个）`,
      validFiles: []
    }
  }
  
  files.forEach(file => {
    const result = validateFile(file)
    if (result.valid) {
      validFiles.push(file)
    }
    results.push({
      file,
      ...result
    })
  })
  
  return {
    valid: validFiles.length > 0,
    results,
    validFiles,
    invalidCount: files.length - validFiles.length
  }
}
