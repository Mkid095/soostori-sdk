/**
 * ReportService — Phase 13 flat-report entry points.
 *
 * These are the canonical, consumer-facing report APIs required by the
 * Phase 13 brief. They are simpler wrappers over the existing ReportsService
 * infrastructure, surfacing flat JSON-serialisable report shapes.
 *
 * All data is derived from canonical transactional entities.
 * No second source of truth. No denormalised summary tables.
 */

import type { BusinessId, ISO8601, Money } from '@soostori/core'

// ── DashboardSummary ────────────────────────────────────────────────────────────

/**
 * Top-level business health snapshot at a point in time.
 * Consumed by the Web / Desktop / Mobile dashboard widgets.
 */
export interface DashboardSummary {
  todaySales: number
  weekSales: number
  monthSales: number
  todayRevenue: number
  weekRevenue: number
  monthRevenue: number
  monthCost: number
  grossProfit: number
  grossMargin: number          // percentage (0–100)
  lowStockCount: number
  outstandingDebts: number
  pendingExpenses: number
  activeCustomers: number
}

// ── SalesReport ────────────────────────────────────────────────────────────────

export interface SalesReport {
  period: { from: string; to: string }
  totalSales: number
  totalRevenue: number
  totalCost: number
  grossProfit: number
  grossMargin: number
  byPaymentMethod: Record<string, { count: number; amount: number }>
  topProducts: Array<{ productId: string; name: string; quantitySold: number; revenue: number }>
  salesCount: number
  averageSaleValue: number
}

// ── InventoryReport ────────────────────────────────────────────────────────────

export interface InventoryReport {
  totalProducts: number
  totalStockValue: number
  lowStockCount: number
  outOfStockCount: number
  deadStock: Array<{ productId: string; name: string; lastMovementDate: string }>
  reorderSuggestions: Array<{
    productId: string
    name: string
    currentStock: number
    threshold: number
    suggestedOrder: number
  }>
}

// ── DebtReport ─────────────────────────────────────────────────────────────────

export interface DebtReport {
  totalOutstanding: number
  overdueCount: number
  partialCount: number
  agingBuckets: {
    '0-30': number
    '31-60': number
    '61-90': number
    '90+': number
  }
  byCustomer: Array<{ customerId: string; name: string; outstanding: number; debtCount: number }>
}

// ── ExpenseReport ──────────────────────────────────────────────────────────────

export interface ExpenseReport {
  total: number
  byCategory: Record<string, number>
  pendingCount: number
  vsPriorMonth: number   // percentage change vs prior month
}

// ── Service (mock-repository implementation for SDK) ────────────────────────────

/**
 * ReportService — pure reads, no mutations, no sync events.
 *
 * The default implementation uses an in-memory mock store so the SDK
 * has a working service without requiring a platform-specific repository.
 * Platform implementations (web / desktop / mobile) replace this with
 * their own repository-backed concrete class.
 */
export class ReportService {
  // In-memory stores seeded by tests — replace with platform repository in production
  private sales: Array<{
    id: string; businessId: BusinessId; status: string
    totalAmount: Money; costAmount: Money; paymentMethod: string; createdAt: ISO8601
  }> = []
  private saleItems: Array<{
    productId: string; saleId: string; quantity: number; totalPrice: Money
  }> = []
  private products: Array<{
    id: string; name: string; quantity: number; unitCost: Money; lowStockThreshold: number
    lastMovementDate: ISO8601 | null
  }> = []
  private debts: Array<{
    id: string; businessId: BusinessId; customerId: string; customerName: string
    balance: Money; status: string; dueDate: ISO8601 | null; createdAt: ISO8601
  }> = []
  private customers: Array<{
    id: string; businessId: BusinessId; lastPurchaseDate: ISO8601 | null
  }> = []
  private expenses: Array<{
    id: string; businessId: BusinessId; categoryName: string
    amount: Money; status: string; date: string
  }> = []

  // ── Seed data (for tests) ──────────────────────────────────────────────────

  addSale(sale: typeof this.sales[0]): void { this.sales.push(sale) }
  addSaleItem(item: typeof this.saleItems[0]): void { this.saleItems.push(item) }
  addProduct(p: typeof this.products[0]): void { this.products.push(p) }
  addDebt(d: typeof this.debts[0]): void { this.debts.push(d) }
  addCustomer(c: typeof this.customers[0]): void { this.customers.push(c) }
  addExpense(e: typeof this.expenses[0]): void { this.expenses.push(e) }

  // ── Report entry points ────────────────────────────────────────────────────

  async getDashboardSummary(businessId: BusinessId): Promise<DashboardSummary> {
    const now = new Date()
    const todayStr = now.toISOString().split('T')[0]

    const startOfToday = new Date(now); startOfToday.setHours(0, 0, 0, 0)
    const startOfWeek = new Date(now); startOfWeek.setDate(now.getDate() - now.getDay())
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

    const completedSales = this.sales.filter(s =>
      s.businessId === businessId && s.status === 'completed'
    )

    // ── Sales / Revenue ──────────────────────────────────────────────────────
    const todaySales = completedSales.filter(s => s.createdAt >= startOfToday.toISOString()).length
    const weekSales  = completedSales.filter(s => s.createdAt >= startOfWeek.toISOString()).length
    const monthSales = completedSales.filter(s => s.createdAt >= startOfMonth.toISOString()).length

    const todayRevenue = completedSales
      .filter(s => s.createdAt >= startOfToday.toISOString())
      .reduce((a, s) => a + s.totalAmount, 0 as Money)
    const weekRevenue = completedSales
      .filter(s => s.createdAt >= startOfWeek.toISOString())
      .reduce((a, s) => a + s.totalAmount, 0 as Money)
    const monthRevenue = completedSales
      .filter(s => s.createdAt >= startOfMonth.toISOString())
      .reduce((a, s) => a + s.totalAmount, 0 as Money)

    const monthCost = completedSales
      .filter(s => s.createdAt >= startOfMonth.toISOString())
      .reduce((a, s) => a + s.costAmount, 0 as Money)

    const grossProfit = monthRevenue - monthCost
    const grossMargin = monthRevenue > 0
      ? (grossProfit / monthRevenue) * 100
      : 0

    // ── Inventory ───────────────────────────────────────────────────────────
    const bizProducts = this.products.filter(p => {
      // Products with matching sale items
      return this.saleItems.some(si => {
        const sale = this.sales.find(s => s.id === si.saleId)
        return sale?.businessId === businessId
      })
    })
    const lowStockCount = bizProducts.filter(p => p.quantity > 0 && p.quantity <= p.lowStockThreshold).length

    // ── Debts ───────────────────────────────────────────────────────────────
    const bizDebts = this.debts.filter(d => d.businessId === businessId && d.status !== 'paid')
    const outstandingDebts = bizDebts.reduce((a, d) => a + d.balance, 0 as Money)
    const nowTS = now.getTime()
    const overdueCount = bizDebts.filter(d =>
      d.dueDate !== null && new Date(d.dueDate).getTime() < nowTS
    ).length

    // ── Expenses ────────────────────────────────────────────────────────────
    const bizExpenses = this.expenses.filter(e => e.businessId === businessId)
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const pendingExpenses = bizExpenses.filter(e =>
      e.status === 'pending' && e.date.startsWith(monthKey)
    ).length

    // ── Active customers (made a purchase this month) ──────────────────────
    const activeCustomers = this.customers.filter(c =>
      c.businessId === businessId &&
      c.lastPurchaseDate !== null &&
      c.lastPurchaseDate >= startOfMonth.toISOString()
    ).length

    return {
      todaySales, weekSales, monthSales,
      todayRevenue, weekRevenue, monthRevenue,
      monthCost, grossProfit,
      grossMargin: Math.round(grossMargin * 100) / 100,
      lowStockCount,
      outstandingDebts,
      pendingExpenses,
      activeCustomers,
    }
  }

  async getSalesReport(
    businessId: BusinessId,
    from: string,
    to: string,
  ): Promise<SalesReport> {
    const fromTS = new Date(from).getTime()
    const toTS   = new Date(to).getTime() + 86_399_999 // end-of-day inclusive

    const completed = this.sales.filter(s =>
      s.businessId === businessId &&
      s.status === 'completed' &&
      new Date(s.createdAt).getTime() >= fromTS &&
      new Date(s.createdAt).getTime() <= toTS
    )

    const totalSales = completed.length
    const totalRevenue = completed.reduce((a, s) => a + s.totalAmount, 0 as Money)
    const totalCost = completed.reduce((a, s) => a + s.costAmount, 0 as Money)
    const grossProfit = totalRevenue - totalCost
    const grossMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0
    const averageSaleValue = totalSales > 0 ? totalRevenue / totalSales : 0

    // ── By payment method ────────────────────────────────────────────────────
    const byPaymentMethod: Record<string, { count: number; amount: number }> = {}
    for (const sale of completed) {
      const pm = sale.paymentMethod
      if (!byPaymentMethod[pm]) byPaymentMethod[pm] = { count: 0, amount: 0 }
      byPaymentMethod[pm].count++
      byPaymentMethod[pm].amount += sale.totalAmount
    }

    // ── Top products by revenue ─────────────────────────────────────────────
    const productRevenue: Record<string, { name: string; quantitySold: number; revenue: number }> = {}
    for (const item of this.saleItems) {
      const sale = this.sales.find(s => s.id === item.saleId)
      if (!sale || sale.businessId !== businessId) continue
      if (new Date(sale.createdAt).getTime() < fromTS || new Date(sale.createdAt).getTime() > toTS) continue
      if (sale.status !== 'completed') continue
      if (!productRevenue[item.productId]) {
        const product = this.products.find(p => p.id === item.productId)
        productRevenue[item.productId] = { name: product?.name ?? item.productId, quantitySold: 0, revenue: 0 }
      }
      productRevenue[item.productId].quantitySold += item.quantity
      productRevenue[item.productId].revenue += item.totalPrice
    }

    const topProducts = Object.entries(productRevenue)
      .sort((a, b) => b[1].revenue - a[1].revenue)
      .slice(0, 10)
      .map(([productId, v]) => ({ productId, name: v.name, quantitySold: v.quantitySold, revenue: v.revenue }))

    return {
      period: { from, to },
      totalSales,
      totalRevenue,
      totalCost,
      grossProfit,
      grossMargin: Math.round(grossMargin * 100) / 100,
      byPaymentMethod,
      topProducts,
      salesCount: totalSales,
      averageSaleValue: Math.round(averageSaleValue),
    }
  }

  async getInventoryReport(businessId: BusinessId): Promise<InventoryReport> {
    const bizSaleIds = new Set(
      this.sales.filter(s => s.businessId === businessId).map(s => s.id)
    )

    const bizProducts = this.products.filter(p =>
      this.saleItems.some(si => bizSaleIds.has(si.saleId) && si.productId === p.id)
    )

    const totalProducts = bizProducts.length
    const totalStockValue = bizProducts.reduce((a, p) => a + p.quantity * p.unitCost, 0 as Money)
    const lowStockCount   = bizProducts.filter(p => p.quantity > 0 && p.quantity <= p.lowStockThreshold).length
    const outOfStockCount = bizProducts.filter(p => p.quantity === 0).length

    // Dead stock: no movement > 30 days
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 30)
    const deadStock = bizProducts
      .filter(p => p.lastMovementDate !== null && new Date(p.lastMovementDate) < cutoff)
      .map(p => ({ productId: p.id, name: p.name, lastMovementDate: p.lastMovementDate as string }))

    // Reorder suggestions: low stock + out of stock
    const reorderSuggestions = bizProducts
      .filter(p => p.quantity <= p.lowStockThreshold)
      .map(p => ({
        productId: p.id,
        name: p.name,
        currentStock: p.quantity,
        threshold: p.lowStockThreshold,
        suggestedOrder: Math.max(p.lowStockThreshold * 2 - p.quantity, p.lowStockThreshold),
      }))

    return { totalProducts, totalStockValue, lowStockCount, outOfStockCount, deadStock, reorderSuggestions }
  }

  async getDebtReport(businessId: BusinessId): Promise<DebtReport> {
    const bizDebts = this.debts.filter(d => d.businessId === businessId && d.status !== 'paid')
    const totalOutstanding = bizDebts.reduce((a, d) => a + d.balance, 0 as Money)
    const overdueCount = bizDebts.filter(d => {
      if (!d.dueDate) return false
      return new Date(d.dueDate).getTime() < Date.now()
    }).length
    const partialCount = bizDebts.filter(d => d.status === 'partial').length

    // Aging buckets
    const now = Date.now()
    const bucket0_30  = bizDebts.filter(d => d.dueDate && (now - new Date(d.dueDate).getTime()) <= 30 * 86_400_000).reduce((a, d) => a + d.balance, 0 as Money)
    const bucket31_60 = bizDebts.filter(d => {
      if (!d.dueDate) return false
      const days = (now - new Date(d.dueDate).getTime()) / 86_400_000
      return days > 30 && days <= 60
    }).reduce((a, d) => a + d.balance, 0 as Money)
    const bucket61_90 = bizDebts.filter(d => {
      if (!d.dueDate) return false
      const days = (now - new Date(d.dueDate).getTime()) / 86_400_000
      return days > 60 && days <= 90
    }).reduce((a, d) => a + d.balance, 0 as Money)
    const bucket90plus = bizDebts.filter(d => {
      if (!d.dueDate) return false
      return (now - new Date(d.dueDate).getTime()) / 86_400_000 > 90
    }).reduce((a, d) => a + d.balance, 0 as Money)

    // By customer
    const customerMap: Record<string, { name: string; outstanding: number; debtCount: number }> = {}
    for (const debt of bizDebts) {
      if (!customerMap[debt.customerId]) {
        customerMap[debt.customerId] = { name: debt.customerName, outstanding: 0, debtCount: 0 }
      }
      customerMap[debt.customerId].outstanding += debt.balance
      customerMap[debt.customerId].debtCount++
    }
    const byCustomer = Object.entries(customerMap)
      .sort((a, b) => b[1].outstanding - a[1].outstanding)
      .map(([customerId, v]) => ({ customerId, name: v.name, outstanding: v.outstanding, debtCount: v.debtCount }))

    return {
      totalOutstanding,
      overdueCount,
      partialCount,
      agingBuckets: {
        '0-30': bucket0_30,
        '31-60': bucket31_60,
        '61-90': bucket61_90,
        '90+': bucket90plus,
      },
      byCustomer,
    }
  }

  async getExpenseReport(businessId: BusinessId, month: string): Promise<ExpenseReport> {
    // month: YYYY-MM
    const priorMonthDate = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 2, 1)
    const priorMonth = `${priorMonthDate.getFullYear()}-${String(priorMonthDate.getMonth() + 1).padStart(2, '0')}`

    const thisMonth = this.expenses.filter(e =>
      e.businessId === businessId && e.date.startsWith(month)
    )
    const priorMonthExpenses = this.expenses.filter(e =>
      e.businessId === businessId && e.date.startsWith(priorMonth)
    )

    const total = thisMonth.reduce((a, e) => a + e.amount, 0 as Money)
    const priorTotal = priorMonthExpenses.reduce((a, e) => a + e.amount, 0 as Money)
    const vsPriorMonth = priorTotal > 0 ? ((total - priorTotal) / priorTotal) * 100 : total > 0 ? 100 : 0

    const byCategory: Record<string, number> = {}
    for (const e of thisMonth) {
      byCategory[e.categoryName] = (byCategory[e.categoryName] ?? 0) + e.amount
    }

    const pendingCount = thisMonth.filter(e => e.status === 'pending').length

    return {
      total,
      byCategory,
      pendingCount,
      vsPriorMonth: Math.round(vsPriorMonth * 100) / 100,
    }
  }
}
