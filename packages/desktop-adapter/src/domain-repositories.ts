/**
 * Domain repositories index — exports all domain repositories for Phase 9.2 wiring.
 *
 * These repositories expose Desktop's existing SQLite tables through the canonical
 * SDK Repository<T> interface. No existing IPC handlers or table schemas are modified.
 */

export { ProductsRepository } from './products-repository.js'
export { CategoriesRepository } from './categories-repository.js'
export { CustomersRepository } from './customers-repository.js'
export { DesktopSalesRepository, type PaymentMethod } from './sales-repository.js'
export { DebtsRepository } from './debts-repository.js'
