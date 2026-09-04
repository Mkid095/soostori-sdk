/**
 * Domain repositories index — exports all domain repositories for Phase 9.2 wiring.
 *
 * These repositories expose Desktop's existing SQLite tables through the canonical
 * SDK Repository<T> interface. No existing IPC handlers or table schemas are modified.
 */

export { ProductsRepository } from './products-repository'
export { CategoriesRepository } from './categories-repository'
export { CustomersRepository } from './customers-repository'
export { DesktopSalesRepository, type PaymentMethod } from './sales-repository'
export { DebtsRepository } from './debts-repository'
