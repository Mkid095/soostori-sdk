/**
 * ReportService tests — Phase 13.
 *
 * Run: cd packages/reports && npx vitest run test/ReportService.test.ts
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { ReportService } from '../src/ReportService.js'
import type { BusinessId } from '@soostori/core'

// ── Helpers ────────────────────────────────────────────────────────────────────

const BIZ_A = 'biz-a-test' as BusinessId
const BIZ_B = 'biz-b-test' as BusinessId

function tsOffset(days: number, hours = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  d.setHours(d.getHours() + hours)
  return d.toISOString()
}

function makeSale(overrides: Partial<{
  id: string; businessId: BusinessId; status: string
  totalAmount: number; costAmount: number; paymentMethod: string; createdAt: string
}> = {}) {
  return {
    id: `sale-${Math.random().toString(36).slice(2)}`,
    businessId: BIZ_A,
    status: 'completed',
    totalAmount: 10_000 as import('@soostori/core').Money,
    costAmount: 6_000 as import('@soostori/core').Money,
    paymentMethod: 'cash',
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

function makeProduct(overrides: Partial<{
  id: string; name: string; quantity: number
  unitCost: number; lowStockThreshold: number; lastMovementDate: string | null
}> = {}) {
  return {
    id: `prod-${Math.random().toString(36).slice(2)}`,
    name: 'Widget',
    quantity: 100,
    unitCost: 500 as import('@soostori/core').Money,
    lowStockThreshold: 10,
    lastMovementDate: new Date().toISOString(),
    ...overrides,
  }
}

function makeDebt(overrides: Partial<{
  id: string; businessId: BusinessId; customerId: string; customerName: string
  balance: number; status: string; dueDate: string | null; createdAt: string
}> = {}) {
  return {
    id: `debt-${Math.random().toString(36).slice(2)}`,
    businessId: BIZ_A,
    customerId: 'cust-1',
    customerName: 'Alice',
    balance: 5_000 as import('@soostori/core').Money,
    status: 'partial',
    dueDate: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

function makeExpense(overrides: Partial<{
  id: string; businessId: BusinessId; categoryName: string
  amount: number; status: string; date: string
}> = {}) {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  return {
    id: `exp-${Math.random().toString(36).slice(2)}`,
    businessId: BIZ_A,
    categoryName: 'Utilities',
    amount: 1_000 as import('@soostori/core').Money,
    status: 'pending',
    date: `${y}-${m}-15`,
    ...overrides,
  }
}

function makeCustomer(overrides: Partial<{
  id: string; businessId: BusinessId; lastPurchaseDate: string | null
}> = {}) {
  return {
    id: `cust-${Math.random().toString(36).slice(2)}`,
    businessId: BIZ_A,
    lastPurchaseDate: new Date().toISOString(),
    ...overrides,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ReportService', () => {

  // ── DashboardSummary ──────────────────────────────────────────────────────

  describe('getDashboardSummary', () => {

    it('returns all numeric fields defined', async () => {
      const svc = new ReportService()
      const result = await svc.getDashboardSummary(BIZ_A)
      expect(typeof result.todaySales).toBe('number')
      expect(typeof result.weekSales).toBe('number')
      expect(typeof result.monthSales).toBe('number')
      expect(typeof result.todayRevenue).toBe('number')
      expect(typeof result.weekRevenue).toBe('number')
      expect(typeof result.monthRevenue).toBe('number')
      expect(typeof result.monthCost).toBe('number')
      expect(typeof result.grossProfit).toBe('number')
      expect(typeof result.grossMargin).toBe('number')
      expect(typeof result.lowStockCount).toBe('number')
      expect(typeof result.outstandingDebts).toBe('number')
      expect(typeof result.pendingExpenses).toBe('number')
      expect(typeof result.activeCustomers).toBe('number')
    })

    it('counts today/week/month sales from completed sales', async () => {
      const svc = new ReportService()

      // Today
      svc.addSale(makeSale({ status: 'completed', createdAt: new Date().toISOString() }))
      svc.addSale(makeSale({ status: 'completed', createdAt: new Date().toISOString() }))
      // Week-old but still this month
      svc.addSale(makeSale({ status: 'completed', createdAt: tsOffset(-3) }))
      // 15 days ago — only counts if still this month; if near month boundary use explicit date
      svc.addSale(makeSale({ status: 'completed', createdAt: tsOffset(-8) }))

      const result = await svc.getDashboardSummary(BIZ_A)
      expect(result.todaySales).toBe(2)
      expect(result.weekSales).toBe(3)
      expect(result.monthSales).toBe(4)
    })

    it('ignores voided / refunded sales in counts and revenue', async () => {
      const svc = new ReportService()
      svc.addSale(makeSale({ status: 'completed', totalAmount: 10_000 }))
      svc.addSale(makeSale({ status: 'voided',   totalAmount: 10_000 }))
      svc.addSale(makeSale({ status: 'refunded',  totalAmount: 10_000 }))
      const result = await svc.getDashboardSummary(BIZ_A)
      expect(result.todaySales).toBe(1)
      expect(result.todayRevenue).toBe(10_000)
    })

    it('computes grossProfit = monthRevenue - monthCost', async () => {
      const svc = new ReportService()
      const now = new Date()
      const y = now.getFullYear(); const m = String(now.getMonth() + 1).padStart(2, '0')
      // Stable dates in the current month
      svc.addSale(makeSale({ totalAmount: 20_000, costAmount: 12_000, createdAt: `${y}-${m}-05T10:00:00.000Z` }))
      svc.addSale(makeSale({ totalAmount: 10_000, costAmount:  6_000, createdAt: `${y}-${m}-10T10:00:00.000Z` }))
      const result = await svc.getDashboardSummary(BIZ_A)
      expect(result.grossProfit).toBe(12_000)
    })

    it('computes grossMargin as percentage', async () => {
      const svc = new ReportService()
      svc.addSale(makeSale({ totalAmount: 20_000, costAmount: 15_000 }))
      const result = await svc.getDashboardSummary(BIZ_A)
      // grossProfit = 5000, grossMargin = 5000/20000*100 = 25
      expect(result.grossMargin).toBe(25)
    })

    it('counts lowStockCount from products at or below threshold', async () => {
      const svc = new ReportService()
      const sale = makeSale({ id: 'sale-1' })
      svc.addSale(sale)
      svc.addSaleItem({ productId: 'p1', saleId: 'sale-1', quantity: 1, totalPrice: 1000 as import('@soostori/core').Money })
      svc.addProduct(makeProduct({ id: 'p1', name: 'Good Stock',   quantity: 50, lowStockThreshold: 10 }))
      svc.addProduct(makeProduct({ id: 'p2', name: 'Low Stock',   quantity:  5, lowStockThreshold: 10 }))
      svc.addProduct(makeProduct({ id: 'p3', name: 'Zero Stock',  quantity:  0, lowStockThreshold: 10 }))
      const result = await svc.getDashboardSummary(BIZ_A)
      // p2 is low (5 <= 10, qty > 0); p3 is out-of-stock
      expect(result.lowStockCount).toBe(1)
    })

    it('accumulates outstandingDebts from non-paid debts', async () => {
      const svc = new ReportService()
      svc.addDebt(makeDebt({ balance: 5_000, status: 'partial' }))
      svc.addDebt(makeDebt({ balance: 3_000, status: 'partial' }))
      svc.addDebt(makeDebt({ balance: 2_000, status: 'paid' }))
      const result = await svc.getDashboardSummary(BIZ_A)
      expect(result.outstandingDebts).toBe(8_000)
    })

    it('counts pendingExpenses for the current month', async () => {
      const svc = new ReportService()
      const now = new Date()
      const y = now.getFullYear()
      const m = String(now.getMonth() + 1).padStart(2, '0')
      const lm = String(now.getMonth()).padStart(2, '0') // previous month
      svc.addExpense(makeExpense({ status: 'pending', date: `${y}-${m}-01` }))
      svc.addExpense(makeExpense({ status: 'pending', date: `${y}-${m}-15` }))
      svc.addExpense(makeExpense({ status: 'paid',     date: `${y}-${m}-10` }))
      svc.addExpense(makeExpense({ status: 'pending', date: `${y}-${lm}-20` })) // last month — should not count
      const result = await svc.getDashboardSummary(BIZ_A)
      expect(result.pendingExpenses).toBe(2)
    })

    it('counts activeCustomers who purchased this month', async () => {
      const svc = new ReportService()
      const now = new Date()
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString()
      svc.addCustomer(makeCustomer({ id: 'c1', lastPurchaseDate: now.toISOString() }))
      svc.addCustomer(makeCustomer({ id: 'c2', lastPurchaseDate: startOfMonth }))
      svc.addCustomer(makeCustomer({ id: 'c3', lastPurchaseDate: lastMonth }))
      const result = await svc.getDashboardSummary(BIZ_A)
      // c1 and c2 purchased this month
      expect(result.activeCustomers).toBe(2)
    })

    it('isolates businessId: other business sales do not affect the result', async () => {
      const svc = new ReportService()
      svc.addSale(makeSale({ businessId: BIZ_A, totalAmount: 99_000 }))
      svc.addSale(makeSale({ businessId: BIZ_B, totalAmount: 1_000_000 }))
      const resultA = await svc.getDashboardSummary(BIZ_A)
      const resultB = await svc.getDashboardSummary(BIZ_B)
      expect(resultA.todayRevenue).toBe(99_000)
      expect(resultB.todayRevenue).toBe(1_000_000)
    })

  })

  // ── SalesReport ────────────────────────────────────────────────────────────

  describe('getSalesReport', () => {

    it('computes period, totals, salesCount, averageSaleValue', async () => {
      const svc = new ReportService()
      svc.addSale(makeSale({ id: 's1', totalAmount: 20_000, costAmount: 12_000 }))
      svc.addSale(makeSale({ id: 's2', totalAmount: 10_000, costAmount:  6_000 }))
      const from = '2020-01-01'; const to = '2030-12-31'
      const result = await svc.getSalesReport(BIZ_A, from, to)
      expect(result.period.from).toBe(from)
      expect(result.period.to).toBe(to)
      expect(result.totalSales).toBe(2)
      expect(result.totalRevenue).toBe(30_000)
      expect(result.totalCost).toBe(18_000)
      expect(result.grossProfit).toBe(12_000)
      expect(result.salesCount).toBe(2)
      expect(result.averageSaleValue).toBe(15_000)
    })

    it('groups revenue by paymentMethod', async () => {
      const svc = new ReportService()
      svc.addSale(makeSale({ paymentMethod: 'cash',         totalAmount: 10_000 }))
      svc.addSale(makeSale({ paymentMethod: 'cash',         totalAmount:  5_000 }))
      svc.addSale(makeSale({ paymentMethod: 'mobile_money', totalAmount: 20_000 }))
      const result = await svc.getSalesReport(BIZ_A, '2020-01-01', '2030-12-31')
      expect(result.byPaymentMethod['cash']['count']).toBe(2)
      expect(result.byPaymentMethod['cash']['amount']).toBe(15_000)
      expect(result.byPaymentMethod['mobile_money']['count']).toBe(1)
      expect(result.byPaymentMethod['mobile_money']['amount']).toBe(20_000)
    })

    it('sorts topProducts by revenue descending', async () => {
      const svc = new ReportService()
      const s1 = makeSale({ id: 's1' })
      const s2 = makeSale({ id: 's2' })
      svc.addSale(s1); svc.addSale(s2)
      svc.addSaleItem({ productId: 'p1', saleId: 's1', quantity: 10, totalPrice: 5_000 as import('@soostori/core').Money })
      svc.addSaleItem({ productId: 'p2', saleId: 's2', quantity: 10, totalPrice: 20_000 as import('@soostori/core').Money })
      svc.addProduct(makeProduct({ id: 'p1', name: 'Cheap' }))
      svc.addProduct(makeProduct({ id: 'p2', name: 'Expensive' }))
      const result = await svc.getSalesReport(BIZ_A, '2020-01-01', '2030-12-31')
      expect(result.topProducts[0].productId).toBe('p2')
      expect(result.topProducts[0].revenue).toBe(20_000)
      expect(result.topProducts[1].productId).toBe('p1')
    })

    it('filters sales by date range', async () => {
      const svc = new ReportService()
      svc.addSale(makeSale({ id: 's1', totalAmount: 100_000, createdAt: '2024-01-01T00:00:00.000Z' }))
      svc.addSale(makeSale({ id: 's2', totalAmount: 200_000, createdAt: '2024-06-01T00:00:00.000Z' }))
      const result = await svc.getSalesReport(BIZ_A, '2024-01-01', '2024-03-31')
      expect(result.totalSales).toBe(1)
      expect(result.totalRevenue).toBe(100_000)
    })

    it('returns empty report for a period with no sales', async () => {
      const svc = new ReportService()
      const result = await svc.getSalesReport(BIZ_A, '2099-01-01', '2099-12-31')
      expect(result.totalSales).toBe(0)
      expect(result.totalRevenue).toBe(0)
      expect(result.byPaymentMethod).toEqual({})
      expect(result.topProducts).toEqual([])
    })

  })

  // ── InventoryReport ────────────────────────────────────────────────────────

  describe('getInventoryReport', () => {

    it('counts totalProducts, lowStockCount, outOfStockCount', async () => {
      const svc = new ReportService()
      const sale = makeSale({ id: 'sale-1' })
      svc.addSale(sale)
      svc.addSaleItem({ productId: 'p1', saleId: 'sale-1', quantity: 1, totalPrice: 1000 as import('@soostori/core').Money })
      svc.addSaleItem({ productId: 'p2', saleId: 'sale-1', quantity: 1, totalPrice: 1000 as import('@soostori/core').Money })
      svc.addSaleItem({ productId: 'p3', saleId: 'sale-1', quantity: 1, totalPrice: 1000 as import('@soostori/core').Money })
      svc.addProduct(makeProduct({ id: 'p1', name: 'Healthy',    quantity: 50,  lowStockThreshold: 10 }))
      svc.addProduct(makeProduct({ id: 'p2', name: 'Low',       quantity:  5,  lowStockThreshold: 10 }))
      svc.addProduct(makeProduct({ id: 'p3', name: 'Empty',     quantity:  0,  lowStockThreshold: 10 }))
      const result = await svc.getInventoryReport(BIZ_A)
      expect(result.totalProducts).toBe(3)
      expect(result.lowStockCount).toBe(1)    // p2: qty 5 <= threshold 10
      expect(result.outOfStockCount).toBe(1)  // p3: qty 0
    })

    it('computes totalStockValue = SUM(quantity * unitCost)', async () => {
      const svc = new ReportService()
      const sale = makeSale({ id: 'sale-1' })
      svc.addSale(sale)
      svc.addSaleItem({ productId: 'p1', saleId: 'sale-1', quantity: 1, totalPrice: 1000 as import('@soostori/core').Money })
      svc.addProduct(makeProduct({ id: 'p1', quantity: 10, unitCost: 500 }))
      const result = await svc.getInventoryReport(BIZ_A)
      expect(result.totalStockValue).toBe(5_000)
    })

    it('detects dead stock: no movement > 30 days', async () => {
      const svc = new ReportService()
      const sale = makeSale({ id: 'sale-1' })
      svc.addSale(sale)
      svc.addSaleItem({ productId: 'p1', saleId: 'sale-1', quantity: 1, totalPrice: 1000 as import('@soostori/core').Money })
      svc.addProduct(makeProduct({
        id: 'p1',
        name: 'Stale',
        lastMovementDate: tsOffset(-45), // 45 days ago
      }))
      const result = await svc.getInventoryReport(BIZ_A)
      expect(result.deadStock.length).toBe(1)
      expect(result.deadStock[0].productId).toBe('p1')
    })

    it('returns empty deadStock when all products moved recently', async () => {
      const svc = new ReportService()
      const sale = makeSale({ id: 'sale-1' })
      svc.addSale(sale)
      svc.addSaleItem({ productId: 'p1', saleId: 'sale-1', quantity: 1, totalPrice: 1000 as import('@soostori/core').Money })
      svc.addProduct(makeProduct({ id: 'p1', name: 'Fresh', lastMovementDate: new Date().toISOString() }))
      const result = await svc.getInventoryReport(BIZ_A)
      expect(result.deadStock).toEqual([])
    })

    it('provides reorderSuggestions with suggestedOrder > 0', async () => {
      const svc = new ReportService()
      const sale = makeSale({ id: 'sale-1' })
      svc.addSale(sale)
      svc.addSaleItem({ productId: 'p1', saleId: 'sale-1', quantity: 1, totalPrice: 1000 as import('@soostori/core').Money })
      svc.addProduct(makeProduct({ id: 'p1', quantity: 5, lowStockThreshold: 20 }))
      const result = await svc.getInventoryReport(BIZ_A)
      expect(result.reorderSuggestions.length).toBe(1)
      expect(result.reorderSuggestions[0].suggestedOrder).toBeGreaterThan(0)
    })

  })

  // ── DebtReport ─────────────────────────────────────────────────────────────

  describe('getDebtReport', () => {

    it('accumulates totalOutstanding and counts overdue / partial', async () => {
      const svc = new ReportService()
      // Not overdue
      svc.addDebt(makeDebt({ id: 'd1', balance: 5_000, status: 'partial', dueDate: tsOffset(+10) }))
      // Overdue
      svc.addDebt(makeDebt({ id: 'd2', balance: 3_000, status: 'partial', dueDate: tsOffset(-5) }))
      // Paid — should not count
      svc.addDebt(makeDebt({ id: 'd3', balance: 2_000, status: 'paid',    dueDate: tsOffset(-1) }))
      const result = await svc.getDebtReport(BIZ_A)
      expect(result.totalOutstanding).toBe(8_000)
      expect(result.overdueCount).toBe(1)
      expect(result.partialCount).toBe(2)
    })

    it('populates aging buckets (0-30, 31-60, 61-90, 90+)', async () => {
      const svc = new ReportService()
      svc.addDebt(makeDebt({ id: 'd1', balance: 1_000, dueDate: tsOffset(-10) }))   // 0-30
      svc.addDebt(makeDebt({ id: 'd2', balance: 2_000, dueDate: tsOffset(-45) }))   // 31-60
      svc.addDebt(makeDebt({ id: 'd3', balance: 3_000, dueDate: tsOffset(-75) }))   // 61-90
      svc.addDebt(makeDebt({ id: 'd4', balance: 4_000, dueDate: tsOffset(-100) }))  // 90+
      const result = await svc.getDebtReport(BIZ_A)
      expect(result.agingBuckets['0-30']).toBe(1_000)
      expect(result.agingBuckets['31-60']).toBe(2_000)
      expect(result.agingBuckets['61-90']).toBe(3_000)
      expect(result.agingBuckets['90+']).toBe(4_000)
    })

    it('sorts byCustomer by outstanding descending', async () => {
      const svc = new ReportService()
      svc.addDebt(makeDebt({ id: 'd1', customerId: 'c1', customerName: 'Small',    balance: 1_000 }))
      svc.addDebt(makeDebt({ id: 'd2', customerId: 'c2', customerName: 'Big',      balance: 9_000 }))
      svc.addDebt(makeDebt({ id: 'd3', customerId: 'c3', customerName: 'Medium',   balance: 5_000 }))
      const result = await svc.getDebtReport(BIZ_A)
      expect(result.byCustomer[0].customerId).toBe('c2') // 9 000
      expect(result.byCustomer[1].customerId).toBe('c3') // 5 000
      expect(result.byCustomer[2].customerId).toBe('c1') // 1 000
    })

    it('isolates businessId: other business debts do not appear', async () => {
      const svc = new ReportService()
      svc.addDebt(makeDebt({ businessId: BIZ_A, balance: 5_000 }))
      svc.addDebt(makeDebt({ businessId: BIZ_B, balance: 1_000_000 }))
      const resultA = await svc.getDebtReport(BIZ_A)
      expect(resultA.totalOutstanding).toBe(5_000)
    })

  })

  // ── ExpenseReport ─────────────────────────────────────────────────────────

  describe('getExpenseReport', () => {

    it('totals and groups by category for the given month', async () => {
      const svc = new ReportService()
      const y = new Date().getFullYear()
      const m = String(new Date().getMonth() + 1).padStart(2, '0')
      const month = `${y}-${m}`
      svc.addExpense(makeExpense({ categoryName: 'Rent',    amount: 50_000, date: `${month}-01` }))
      svc.addExpense(makeExpense({ categoryName: 'Utilities', amount: 5_000, date: `${month}-10` }))
      svc.addExpense(makeExpense({ categoryName: 'Rent',    amount:  2_000, date: `${month}-20` }))
      const result = await svc.getExpenseReport(BIZ_A, month)
      expect(result.total).toBe(57_000)
      expect(result.byCategory['Rent']).toBe(52_000)
      expect(result.byCategory['Utilities']).toBe(5_000)
    })

    it('counts pending expenses in the period', async () => {
      const svc = new ReportService()
      const y = new Date().getFullYear()
      const m = String(new Date().getMonth() + 1).padStart(2, '0')
      const month = `${y}-${m}`
      svc.addExpense(makeExpense({ status: 'pending', date: `${month}-05` }))
      svc.addExpense(makeExpense({ status: 'pending', date: `${month}-15` }))
      svc.addExpense(makeExpense({ status: 'paid',    date: `${month}-20` }))
      const result = await svc.getExpenseReport(BIZ_A, month)
      expect(result.pendingCount).toBe(2)
    })

    it('computes vsPriorMonth as percentage change', async () => {
      const svc = new ReportService()
      const now = new Date()
      const y = now.getFullYear(); const m = now.getMonth() + 1
      const curMonth  = `${y}-${String(m).padStart(2, '0')}`
      const prevMonth = `${y}-${String(m - 1 || 12).padStart(2, '0')}`
      svc.addExpense(makeExpense({ amount: 20_000, date: `${curMonth}-01` }))
      svc.addExpense(makeExpense({ amount: 10_000, date: `${prevMonth}-01` }))
      const result = await svc.getExpenseReport(BIZ_A, curMonth)
      // This month 20 000 vs prior month 10 000 → +100%
      expect(result.vsPriorMonth).toBe(100)
    })

    it('returns 0 for vsPriorMonth when prior month is empty and current is 0', async () => {
      const svc = new ReportService()
      const now = new Date()
      const y = now.getFullYear(); const m = now.getMonth() + 1
      const curMonth = `${y}-${String(m).padStart(2, '0')}`
      const result = await svc.getExpenseReport(BIZ_A, curMonth)
      expect(result.vsPriorMonth).toBe(0)
    })

    it('isolates businessId on getExpenseReport', async () => {
      const svc = new ReportService()
      const y = new Date().getFullYear()
      const m = String(new Date().getMonth() + 1).padStart(2, '0')
      const month = `${y}-${m}`
      svc.addExpense(makeExpense({ businessId: BIZ_A, amount: 9_000, date: `${month}-01` }))
      svc.addExpense(makeExpense({ businessId: BIZ_B, amount: 1_000_000, date: `${month}-01` }))
      const result = await svc.getExpenseReport(BIZ_A, month)
      expect(result.total).toBe(9_000)
    })

  })

})
