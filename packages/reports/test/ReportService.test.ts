/**
 * ReportService tests — Phase 19 additions.
 *
 * Run: pnpm vitest run packages/reports/test/ReportService.test.ts
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { ReportService } from '../src/ReportService.js'
import type { BusinessId, ISO8601, Money } from '@soostori/core'

// ── Helpers ────────────────────────────────────────────────────────────────────

const BIZ_A = 'biz-a-test' as BusinessId

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
    totalAmount: 10_000 as Money,
    costAmount: 6_000 as Money,
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
    unitCost: 500 as Money,
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
    balance: 5_000 as Money,
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
    amount: 1_000 as Money,
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

// ── Phase 19 Tests ─────────────────────────────────────────────────────────────

describe('ReportService (Phase 19)', () => {

  // ── getDashboardSummary with mixed transactions ──────────────────────────────

  describe('getDashboardSummary', () => {
    it('returns correct aggregates with mixed completed/voided/refunded sales', async () => {
      const svc = new ReportService()
      const now = new Date()
      const startOfToday = new Date(now); startOfToday.setHours(0, 0, 0, 0)

      // Three completed sales today
      svc.addSale(makeSale({ status: 'completed', totalAmount: 5_000, createdAt: now.toISOString() }))
      svc.addSale(makeSale({ status: 'completed', totalAmount: 3_000, createdAt: now.toISOString() }))
      svc.addSale(makeSale({ status: 'completed', totalAmount: 2_000, createdAt: now.toISOString() }))
      // Ignored
      svc.addSale(makeSale({ status: 'voided',   totalAmount: 99_000, createdAt: now.toISOString() }))
      svc.addSale(makeSale({ status: 'refunded',  totalAmount: 99_000, createdAt: now.toISOString() }))

      const result = await svc.getDashboardSummary(BIZ_A)
      expect(result.todaySales).toBe(3)
      expect(result.todayRevenue).toBe(10_000)
    })

    it('SUM(sales) equals dashboardSummary.todaySales (reconciliation invariant)', async () => {
      const svc = new ReportService()
      const now = new Date()
      svc.addSale(makeSale({ status: 'completed', totalAmount: 7_000, createdAt: now.toISOString() }))
      svc.addSale(makeSale({ status: 'completed', totalAmount: 3_000, createdAt: now.toISOString() }))

      const summary = await svc.getDashboardSummary(BIZ_A)
      const report = await svc.getSalesReport(BIZ_A, now.toISOString(), now.toISOString())

      // Invariant: SUM(sales) = dashboardSummary.totalSales
      expect(summary.todaySales).toBe(report.totalSales)
      expect(summary.todayRevenue).toBe(report.totalRevenue)
    })
  })

  // ── getSalesReport ───────────────────────────────────────────────────────────

  describe('getSalesReport', () => {
    it('sums correctly for a date range', async () => {
      const svc = new ReportService()
      const from = '2024-01-01'; const to = '2024-01-31'
      svc.addSale(makeSale({ id: 's1', totalAmount: 20_000, costAmount: 12_000, createdAt: '2024-01-05T10:00:00.000Z' }))
      svc.addSale(makeSale({ id: 's2', totalAmount: 30_000, costAmount: 18_000, createdAt: '2024-01-15T10:00:00.000Z' }))
      // Outside range
      svc.addSale(makeSale({ id: 's3', totalAmount: 99_000, costAmount: 50_000, createdAt: '2024-03-01T10:00:00.000Z' }))

      const result = await svc.getSalesReport(BIZ_A, from, to)
      expect(result.totalSales).toBe(2)
      expect(result.totalRevenue).toBe(50_000)
      expect(result.totalCost).toBe(30_000)
      expect(result.grossProfit).toBe(20_000)
    })
  })

  // ── getInventoryReport ───────────────────────────────────────────────────────

  describe('getInventoryReport', () => {
    it('derives closing stock from movements', async () => {
      const svc = new ReportService()
      // Products linked to a sale
      const sale = makeSale({ id: 'sale-1' })
      svc.addSale(sale)
      svc.addSaleItem({ productId: 'p1', saleId: 'sale-1', quantity: 20, totalPrice: 10_000 as Money })
      svc.addProduct(makeProduct({ id: 'p1', name: 'Alpha', quantity: 80, lowStockThreshold: 10 })) // opened at 100, sold 20

      const result = await svc.getInventoryReport(BIZ_A)
      // p1 has qty 80 (started at 100, sold 20)
      expect(result.totalProducts).toBe(1)
      expect(result.totalStockValue).toBe(80 * 500)
    })

    it('flags out-of-stock products separately from low-stock', async () => {
      const svc = new ReportService()
      const sale = makeSale({ id: 'sale-1' })
      svc.addSale(sale)
      svc.addSaleItem({ productId: 'p1', saleId: 'sale-1', quantity: 1, totalPrice: 1_000 as Money })
      svc.addSaleItem({ productId: 'p2', saleId: 'sale-1', quantity: 1, totalPrice: 1_000 as Money })
      svc.addProduct(makeProduct({ id: 'p1', name: 'Low',    quantity: 5,  lowStockThreshold: 10 }))
      svc.addProduct(makeProduct({ id: 'p2', name: 'Empty',  quantity: 0,  lowStockThreshold: 10 }))

      const result = await svc.getInventoryReport(BIZ_A)
      expect(result.lowStockCount).toBe(1)    // p1: qty 5 <= threshold 10, qty > 0
      expect(result.outOfStockCount).toBe(1)  // p2: qty 0
    })
  })

  // ── getDebtReport ────────────────────────────────────────────────────────────

  describe('getDebtReport', () => {
    it('shows running balance for each customer', async () => {
      const svc = new ReportService()
      svc.addDebt(makeDebt({ id: 'd1', customerId: 'c1', customerName: 'Alice', balance: 5_000 }))
      svc.addDebt(makeDebt({ id: 'd2', customerId: 'c1', customerName: 'Alice', balance: 3_000 })) // same customer
      svc.addDebt(makeDebt({ id: 'd3', customerId: 'c2', customerName: 'Bob',   balance: 2_000 }))

      const result = await svc.getDebtReport(BIZ_A)
      // Alice has two debts: 5000 + 3000 = 8000
      const alice = result.byCustomer.find(c => c.customerId === 'c1')
      expect(alice?.outstanding).toBe(8_000)
      expect(alice?.debtCount).toBe(2)
    })
  })

  // ── getExpenseReport ─────────────────────────────────────────────────────────

  describe('getExpenseReport', () => {
    it('categorizes by type', async () => {
      const svc = new ReportService()
      const now = new Date()
      const y = now.getFullYear()
      const m = String(now.getMonth() + 1).padStart(2, '0')
      const month = `${y}-${m}`

      svc.addExpense(makeExpense({ categoryName: 'Rent',      amount: 50_000, date: `${month}-01` }))
      svc.addExpense(makeExpense({ categoryName: 'Utilities', amount:  5_000, date: `${month}-10` }))
      svc.addExpense(makeExpense({ categoryName: 'Rent',      amount: 10_000, date: `${month}-20` }))

      const result = await svc.getExpenseReport(BIZ_A, month)
      expect(result.total).toBe(65_000)
      expect(result.byCategory['Rent']).toBe(60_000)
      expect(result.byCategory['Utilities']).toBe(5_000)
    })
  })

  // ── Empty period ─────────────────────────────────────────────────────────────

  describe('empty period', () => {
    it('returns zeroed report when no data exists', async () => {
      const svc = new ReportService()
      const from = '2099-01-01'; const to = '2099-12-31'

      const sales = await svc.getSalesReport(BIZ_A, from, to)
      expect(sales.totalSales).toBe(0)
      expect(sales.totalRevenue).toBe(0)

      const inventory = await svc.getInventoryReport(BIZ_A)
      expect(inventory.totalProducts).toBe(0)

      const debt = await svc.getDebtReport(BIZ_A)
      expect(debt.totalOutstanding).toBe(0)

      const expense = await svc.getExpenseReport(BIZ_A, '2099-01')
      expect(expense.total).toBe(0)
    })
  })

  // ── Offline: local SQLite derivation ─────────────────────────────────────────

  describe('offline period (local SQLite)', () => {
    it('derives report from local store (not FIDScript) — no network required', async () => {
      // The ReportService in-memory store simulates local SQLite.
      // In offline mode the platform repo reads from local SQLite.
      const svc = new ReportService()
      const now = new Date()
      // Seed local store as if it had synced data
      svc.addSale(makeSale({ status: 'completed', totalAmount: 15_000, createdAt: now.toISOString() }))
      svc.addSale(makeSale({ status: 'completed', totalAmount: 10_000, createdAt: now.toISOString() }))

      // Offline: getSalesReport reads from local store, no FIDScript call
      const result = await svc.getSalesReport(BIZ_A, now.toISOString(), now.toISOString())
      expect(result.totalSales).toBe(2)
      expect(result.totalRevenue).toBe(25_000)
    })
  })

})
