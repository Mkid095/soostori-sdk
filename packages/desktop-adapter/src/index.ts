/**
 * @soostori/desktop-adapter — Desktop (Electron) platform adapter.
 *
 * Implements SDK repository contracts over the existing soostori.db SQLite database.
 * All business logic remains in canonical SDK packages.
 * This adapter is internal to the soostori-sdk workspace — NOT published to NPM.
 *
 * Usage from Electron main process:
 *   import { setDatabase } from '@soostori/desktop-adapter'
 *   import { getDatabase } from 'soostori-desktop/electron/database'
 *   setDatabase(getDatabase())
 *
 * Then IPC handlers can use:
 *   import { DesktopDevicesRepository, DesktopBusinessRepository } from '@soostori/desktop-adapter'
 */

export { setDatabase, getDatabase, isDatabaseSet } from './sqlite-database'
export { SqliteRepository } from './sqlite-repository'
export { SqliteTransactionHandle } from './sqlite-transaction'
export { DesktopDevicesRepository } from './devices-repository'
export { DesktopBusinessRepository } from './business-repository'
export {
  ProductsRepository,
  CategoriesRepository,
  CustomersRepository,
  DesktopSalesRepository,
  type PaymentMethod,
} from './domain-repositories'
export { DesktopInventoryRepository } from './inventory-repository'
export {
  hashPin,
  verifyPin,
  ROLE_PERMISSIONS,
  hasPermission,
} from './auth-pin'
export { asUserId, asShopId, asEmployeeId, asDeviceId, asProductId, asCategoryId } from '@soostori/core'
