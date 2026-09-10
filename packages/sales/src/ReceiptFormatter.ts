/**
 * ReceiptFormatter — plain-text receipt generation.
 */

import type { Sale, SaleItem, Refund, Business, Receipt } from './types.js'
import type { ISO8601, Money } from '@soostori/core'

function formatMoney(cents: Money): string {
  const KenyaDate = new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' })
  return KenyaDate.format(cents / 100)
}

function formatDate(iso: ISO8601): string {
  const d = new Date(iso)
  return d.toLocaleString('en-KE', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function padRight(str: string, width: number): string {
  return str.padEnd(width, ' ')
}

function padLeft(str: string, width: number): string {
  return str.padStart(width, ' ')
}

/**
 * Format a sale as a plain-text receipt.
 *
 * @param sale     The completed/refunded sale
 * @param items    The sale's line items
 * @param business Business info (name, address, taxRate)
 * @param cashierName  Cashier's display name
 * @param refund   Optional refund record for refund receipts
 */
export function formatReceipt(
  sale: Sale,
  items: SaleItem[],
  business: Business,
  cashierName: string,
  refund?: Refund,
): Receipt {
  const LINE_WIDTH = 40
  const DIVIDER = '-'.repeat(LINE_WIDTH)

  const lines: string[] = []

  // ── Header ──────────────────────────────────────────────────────────────
  lines.push(padRight(business.name.toUpperCase(), LINE_WIDTH))
  if (business.address) {
    lines.push(padRight(business.address, LINE_WIDTH))
  }
  lines.push(DIVIDER)

  // ── Meta ─────────────────────────────────────────────────────────────────
  const dateStr = `Date: ${formatDate(sale.createdAt)}`
  lines.push(padRight(dateStr, LINE_WIDTH))
  lines.push(padRight(`Register: ${sale.registerId}`, LINE_WIDTH))
  lines.push(padRight(`Cashier: ${cashierName}`, LINE_WIDTH))
  if (sale.customerId) {
    lines.push(padRight(`Customer: ${sale.customerId}`, LINE_WIDTH))
  }
  lines.push(DIVIDER)

  // ── Refund banner ─────────────────────────────────────────────────────────
  if (sale.status === 'refunded' && refund) {
    lines.push('*** REFUND ***'.padStart(Math.floor((LINE_WIDTH + 10) / 2)))
    lines.push(`Reason: ${refund.reason}`)
    lines.push(`Refund Amount: ${formatMoney(refund.amount)}`)
    lines.push(DIVIDER)
  }

  // ── Line items ────────────────────────────────────────────────────────────
  lines.push(padRight('ITEM', 18) + padRight('QTY', 4) + padRight('PRICE', 10) + padRight('DISC', 6))
  lines.push(DIVIDER)

  for (const item of items) {
    const name = item.productName.length > 18 ? item.productName.slice(0, 16) + '..' : item.productName
    const qty = String(item.quantity)
    const price = formatMoney(item.unitPrice)
    const disc = item.discount > 0 ? '-' + formatMoney(item.discount) : '-'
    lines.push(
      padRight(name, 18) +
      padRight(qty, 4) +
      padLeft(price, 10) +
      padLeft(disc, 6),
    )
    // Show total for line if discount was applied
    if (item.discount > 0) {
      lines.push(padLeft(formatMoney(item.totalPrice), LINE_WIDTH))
    }
  }

  lines.push(DIVIDER)

  // ── Totals ────────────────────────────────────────────────────────────────
  lines.push(
    padRight('Subtotal:', 28) + padLeft(formatMoney(sale.subtotal), 12),
  )
  if (sale.saleDiscount > 0) {
    lines.push(
      padRight('Sale Discount:', 28) + padLeft('-' + formatMoney(sale.saleDiscount), 12),
    )
  }
  if (sale.taxAmount > 0) {
    lines.push(
      padRight(`Tax (${((business.taxRate ?? 0) * 100).toFixed(0)}%):`, 28) + padLeft(formatMoney(sale.taxAmount), 12),
    )
  }
  lines.push(DIVIDER)
  lines.push(
    padRight('TOTAL:', 28) + padLeft(formatMoney(sale.totalAmount), 12),
  )

  // ── Payment ───────────────────────────────────────────────────────────────
  lines.push(DIVIDER)
  const methodLabel = sale.paymentMethod === 'credit' ? 'Credit' : sale.paymentMethod.replace('_', ' ').toUpperCase()
  lines.push(padRight(`Paid by: ${methodLabel}`, LINE_WIDTH))
  if (sale.paymentMethod === 'cash') {
    lines.push(padRight(`Tendered: ${formatMoney(sale.amountTendered)}`, LINE_WIDTH))
    lines.push(padRight(`Change:   ${formatMoney(sale.changeGiven)}`, LINE_WIDTH))
  }
  lines.push(DIVIDER)

  // ── Notes ─────────────────────────────────────────────────────────────────
  if (sale.notes) {
    lines.push(`Note: ${sale.notes}`)
    lines.push(DIVIDER)
  }

  // ── Footer ───────────────────────────────────────────────────────────────
  lines.push(padRight('Thank you!', LINE_WIDTH))
  lines.push(padRight('Powered by Soostori', LINE_WIDTH))

  // Build structured receipt object
  const receipt: Receipt = {
    saleId: sale.id,
    businessName: business.name,
    businessAddress: business.address,
    date: sale.createdAt,
    registerId: sale.registerId,
    cashierName,
    customerName: sale.customerId ?? null,
    lineItems: items.map(item => ({
      name: item.productName,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      discount: item.discount,
      total: item.totalPrice,
    })),
    subtotal: sale.subtotal,
    saleDiscount: sale.saleDiscount,
    taxAmount: sale.taxAmount,
    total: sale.totalAmount,
    paymentMethod: sale.paymentMethod,
    amountTendered: sale.amountTendered,
    changeGiven: sale.changeGiven,
  }

  return receipt
}
