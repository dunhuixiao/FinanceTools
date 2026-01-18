#!/usr/bin/env node
/**
 * 发票解析器自动化测试脚本
 * 用于验证 35865.33.pdf 的数据解析
 * 
 * 运行方式: node scripts/test-invoice-parser.js
 */

// ============================================================================
// 核心解析算法（从 invoiceContentParser.ts 提取）
// ============================================================================

/**
 * 验证数字字符串格式是否有效
 */
function isValidNumberFormat(str) {
  if (!str || !/^\d+\.?\d*$/.test(str)) return false
  if (str.endsWith('.')) return false
  if (str.length > 1 && str[0] === '0' && str[1] !== '.') return false
  return true
}

/**
 * 智能拆分连接的数值字符串
 */
function splitConcatenatedNumericString(str) {
  const cleaned = str.replace(/[,，\s￥¥]/g, '')
  
  // 查找税率 (1%, 3%, 6%, 9%, 13%, 0%)
  const taxRateMatch = cleaned.match(/(1[39]|[01369])%/)
  if (!taxRateMatch) {
    return null
  }
  
  const taxRateIdx = cleaned.lastIndexOf(taxRateMatch[0])
  const taxRate = taxRateMatch[0]
  const beforeTaxRate = cleaned.substring(0, taxRateIdx)
  const afterTaxRate = cleaned.substring(taxRateIdx + taxRate.length)
  
  // 提取税额
  const taxAmount = afterTaxRate.match(/^[\d.]+/) ? afterTaxRate.match(/^[\d.]+/)[0] : undefined
  const hasTaxAmount = !!taxAmount && parseFloat(taxAmount) > 0
  
  if (!beforeTaxRate) {
    return { taxRate, taxAmount }
  }
  
  const taxRateNum = parseFloat(taxRate.replace('%', '')) / 100
  
  const candidates = []
  
  // 枚举所有可能的拆分方式
  for (let amtStart = 0; amtStart < beforeTaxRate.length; amtStart++) {
    const amountStr = beforeTaxRate.substring(amtStart)
    const amountNum = parseFloat(amountStr)
    
    if (isNaN(amountNum) || amountNum <= 0) continue
    if (!isValidNumberFormat(amountStr)) continue
    
    const prefix = beforeTaxRate.substring(0, amtStart)
    
    // 纯金额情况
    if (!prefix) {
      if (hasTaxAmount) {
        const expectedTaxAmount = amountNum * taxRateNum
        const actualTaxAmount = parseFloat(taxAmount)
        const tolerance = Math.max(0.02, actualTaxAmount * 0.01)
        if (Math.abs(expectedTaxAmount - actualTaxAmount) <= tolerance) {
          candidates.push({ amount: amountStr, score: 0 })
        }
      } else {
        candidates.push({ amount: amountStr, score: 0 })
      }
      continue
    }
    
    // 有前缀的情况
    for (let upStart = 0; upStart <= prefix.length; upStart++) {
      const qtyStr = prefix.substring(0, upStart)
      const upStr = prefix.substring(upStart)
      
      // 有数量和单价
      if (qtyStr && upStr) {
        const qtyNum = parseFloat(qtyStr)
        const upNum = parseFloat(upStr)
        
        if (isNaN(qtyNum) || isNaN(upNum) || qtyNum <= 0 || upNum <= 0) continue
        if (!isValidNumberFormat(qtyStr) || !isValidNumberFormat(upStr)) continue
        
        const expectedAmount = qtyNum * upNum
        const tolerance = Math.max(0.02, amountNum * 0.01)
        if (Math.abs(expectedAmount - amountNum) <= tolerance) {
          if (hasTaxAmount) {
            const expectedTaxAmount = amountNum * taxRateNum
            const actualTaxAmount = parseFloat(taxAmount)
            const taxTolerance = Math.max(0.02, actualTaxAmount * 0.01)
            if (Math.abs(expectedTaxAmount - actualTaxAmount) <= taxTolerance) {
              candidates.push({ quantity: qtyStr, unitPrice: upStr, amount: amountStr, score: 1 })
            }
          } else {
            candidates.push({ quantity: qtyStr, unitPrice: upStr, amount: amountStr, score: 2 })
          }
        }
      }
      
      // 只有单价（数量=1）
      if (!qtyStr && upStr) {
        const upNum = parseFloat(upStr)
        if (isNaN(upNum) || upNum <= 0) continue
        if (!isValidNumberFormat(upStr)) continue
        
        const tolerance = Math.max(0.02, amountNum * 0.01)
        if (Math.abs(upNum - amountNum) <= tolerance) {
          if (hasTaxAmount) {
            const expectedTaxAmount = amountNum * taxRateNum
            const actualTaxAmount = parseFloat(taxAmount)
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
  
  // 选择最佳候选
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
  
  // 默认返回：整个前缀作为金额
  return {
    amount: beforeTaxRate,
    taxRate,
    taxAmount
  }
}

/**
 * 从文本中提取所有数值
 */
function extractAllNumbers(text) {
  const cleaned = text.replace(/[,，\s￥¥\-]/g, '')
  
  if (!cleaned || !/\d/.test(cleaned)) {
    return []
  }
  
  // 两个带两位小数的数连接
  const twoDecimalMatch = cleaned.match(/^(\d+\.\d{2})(\d+\.\d{2})$/)
  if (twoDecimalMatch) {
    return [twoDecimalMatch[1], twoDecimalMatch[2]]
  }
  
  // 两个小数点的情况
  const decimalPoints = [...cleaned.matchAll(/\./g)]
  if (decimalPoints.length === 2) {
    const secondDotIndex = cleaned.indexOf('.', cleaned.indexOf('.') + 1)
    let splitIndex = secondDotIndex - 1
    while (splitIndex > 0 && /\d/.test(cleaned[splitIndex - 1])) {
      const beforePart = cleaned.substring(0, splitIndex)
      const afterPart = cleaned.substring(splitIndex)
      if (/^\d+\.\d+$/.test(beforePart) && /^\d+\.\d+$/.test(afterPart)) {
        return [beforePart, afterPart]
      }
      splitIndex--
    }
  }
  
  const numbers = cleaned.match(/\d+\.?\d*/g)
  return numbers ? numbers.filter(n => n && n !== '.' && parseFloat(n) > 0) : []
}

// ============================================================================
// 测试用例（来自 35865.33.pdf）
// ============================================================================

const testCases = [
  // 格式1: 金额+税率连接，无税额后缀
  {
    input: '75.2213%',
    expected: { amount: '75.22', taxRate: '13%' },
    description: '威露士洗衣液 - 金额+税率连接'
  },
  {
    input: '48.7613%',
    expected: { amount: '48.76', taxRate: '13%' },
    description: '玻璃啤酒杯 - 金额+税率连接'
  },
  {
    input: '10.9713%',
    expected: { amount: '10.97', taxRate: '13%' },
    description: '窝窝醪糟 - 金额+税率连接'
  },
  
  // 格式2: 完整连接（单价+金额+税率+税额，数量=1）
  {
    input: '145.7545.7513%5.95',
    expected: { quantity: '1', unitPrice: '45.75', amount: '45.75', taxRate: '13%', taxAmount: '5.95' },
    description: '重庆小面 - 完整连接格式'
  },
  {
    input: '138.8538.8513%5.05',
    expected: { quantity: '1', unitPrice: '38.85', amount: '38.85', taxRate: '13%', taxAmount: '5.05' },
    description: '菊乐酸乐奶 - 完整连接格式'
  },
  {
    input: '123.8923.8913%3.11',
    expected: { quantity: '1', unitPrice: '23.89', amount: '23.89', taxRate: '13%', taxAmount: '3.11' },
    description: '如水黑西瓜籽 - 完整连接格式'
  },
  {
    input: '133.0133.0113%4.29',
    expected: { quantity: '1', unitPrice: '33.01', amount: '33.01', taxRate: '13%', taxAmount: '4.29' },
    description: '杨大爷香肠 - 完整连接格式'
  },
  
  // 格式3: 带数量的连接格式
  {
    input: '444.16176.6413%22.96',
    expected: { quantity: '4', unitPrice: '44.16', amount: '176.64', taxRate: '13%', taxAmount: '22.96' },
    description: '百历坚开心果 - 数量4'
  },
  {
    input: '230.5361.0613%7.94',
    expected: { quantity: '2', unitPrice: '30.53', amount: '61.06', taxRate: '13%', taxAmount: '7.94' },
    description: '南孚电池 - 数量2'
  },
  {
    input: '223.89547.7913%6.21',
    expected: { quantity: '2', unitPrice: '23.895', amount: '47.79', taxRate: '13%', taxAmount: '6.21' },
    description: '核桃仁 - 数量2'
  },
  
  // 格式4: 税率+税额连接
  {
    input: '13%15.19',
    expected: { taxRate: '13%', taxAmount: '15.19' },
    description: '京东京造菜板 - 税率+税额'
  },
  {
    input: '13%1.37',
    expected: { taxRate: '13%', taxAmount: '1.37' },
    description: '如水香辣味青豌豆 - 税率+税额'
  },
  
  // 特殊格式
  {
    input: '1248.08248.0813%32.25',
    expected: { quantity: '1', unitPrice: '248.08', amount: '248.08', taxRate: '13%', taxAmount: '32.25' },
    description: '苏泊尔电饼铛 - 1+单价+金额'
  },
  {
    input: '111.4211.4213%1.48',
    expected: { quantity: '1', unitPrice: '11.42', amount: '11.42', taxRate: '13%', taxAmount: '1.48' },
    description: '如水红糖黑豆 - 1+单价+金额'
  },
]

// ============================================================================
// 测试执行
// ============================================================================

console.log('╔══════════════════════════════════════════════════════════════╗')
console.log('║     35865.33.pdf 发票解析自动化测试                         ║')
console.log('╚══════════════════════════════════════════════════════════════╝\n')

let passed = 0
let failed = 0
const failures = []

for (const tc of testCases) {
  const result = splitConcatenatedNumericString(tc.input)
  
  let isPass = true
  const issues = []
  
  if (!result) {
    isPass = false
    issues.push('解析返回null')
  } else {
    // 检查各字段
    if (tc.expected.amount !== undefined && result.amount !== tc.expected.amount) {
      isPass = false
      issues.push(`金额: 期望"${tc.expected.amount}", 实际"${result.amount}"`)
    }
    if (tc.expected.taxRate !== undefined && result.taxRate !== tc.expected.taxRate) {
      isPass = false
      issues.push(`税率: 期望"${tc.expected.taxRate}", 实际"${result.taxRate}"`)
    }
    if (tc.expected.taxAmount !== undefined && result.taxAmount !== tc.expected.taxAmount) {
      isPass = false
      issues.push(`税额: 期望"${tc.expected.taxAmount}", 实际"${result.taxAmount}"`)
    }
    if (tc.expected.quantity !== undefined && result.quantity !== tc.expected.quantity) {
      isPass = false
      issues.push(`数量: 期望"${tc.expected.quantity}", 实际"${result.quantity}"`)
    }
    if (tc.expected.unitPrice !== undefined && result.unitPrice !== tc.expected.unitPrice) {
      isPass = false
      issues.push(`单价: 期望"${tc.expected.unitPrice}", 实际"${result.unitPrice}"`)
    }
  }
  
  if (isPass) {
    passed++
    console.log(`✓ PASS: ${tc.description}`)
    console.log(`  输入: "${tc.input}"`)
    if (result) {
      const parts = []
      if (result.quantity) parts.push(`数量=${result.quantity}`)
      if (result.unitPrice) parts.push(`单价=${result.unitPrice}`)
      if (result.amount) parts.push(`金额=${result.amount}`)
      parts.push(`税率=${result.taxRate}`)
      if (result.taxAmount) parts.push(`税额=${result.taxAmount}`)
      console.log(`  结果: ${parts.join(', ')}`)
    }
  } else {
    failed++
    console.log(`✗ FAIL: ${tc.description}`)
    console.log(`  输入: "${tc.input}"`)
    if (result) {
      console.log(`  结果: ${JSON.stringify(result)}`)
    }
    console.log(`  问题: ${issues.join('; ')}`)
    failures.push({ tc, result, issues })
  }
  console.log()
}

// ============================================================================
// 测试 extractAllNumbers
// ============================================================================

console.log('─────────────────────────────────────────────────────────────────')
console.log('extractAllNumbers 测试\n')

const extractTests = [
  { input: '75.22', expected: ['75.22'], desc: '单个小数' },
  { input: '1', expected: ['1'], desc: '单个整数' },
  { input: '9.080.82', expected: ['9.08', '0.82'], desc: '连接的金额+税额' },
  { input: '-92.00', expected: ['92.00'], desc: '负数应提取正数部分' },
  { input: '¥75.22', expected: ['75.22'], desc: '带货币符号' },
]

for (const et of extractTests) {
  const result = extractAllNumbers(et.input)
  const resultStr = JSON.stringify(result)
  const expectedStr = JSON.stringify(et.expected)
  
  if (resultStr === expectedStr) {
    passed++
    console.log(`✓ PASS: ${et.desc} - "${et.input}" -> ${resultStr}`)
  } else {
    failed++
    console.log(`✗ FAIL: ${et.desc}`)
    console.log(`  输入: "${et.input}"`)
    console.log(`  期望: ${expectedStr}`)
    console.log(`  实际: ${resultStr}`)
  }
}

// ============================================================================
// 测试总结
// ============================================================================

console.log('\n═══════════════════════════════════════════════════════════════')
console.log(`测试结果: ${passed}/${passed + failed} 通过`)

if (failed > 0) {
  console.log(`\n⚠️  ${failed} 个测试失败`)
  console.log('\n失败的测试用例需要修复:')
  for (const f of failures) {
    console.log(`  - ${f.tc.description}: ${f.issues.join('; ')}`)
  }
  process.exit(1)
} else {
  console.log('\n✅ 所有测试通过！解析器可以正确处理 35865.33.pdf 的数据格式')
  process.exit(0)
}
