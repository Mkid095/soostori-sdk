/**
 * Device repository — local persistence for device identity.
 */

import type { Device, DeviceIdentity, PrimaryDeviceState } from './types'
import type { UUID, ShopId, ISO8601 } from '@soostori/core'

export interface DevicesRepository {
  // Local device identity (this device)
  getLocalIdentity(): Promise<DeviceIdentity | null>
  saveLocalIdentity(identity: DeviceIdentity): Promise<void>

  // Shop devices (this shop's known devices)
  findDevice(id: UUID): Promise<Device | null>
  findByShop(shopId: ShopId): Promise<Device[]>
  registerDevice(device: Device): Promise<void>
  updateDevice(id: UUID, changes: Partial<Device>): Promise<Device>
  revokeDevice(id: UUID, at: ISO8601): Promise<void>

  // Primary device state
  getPrimaryState(shopId: ShopId): Promise<PrimaryDeviceState | null>
  savePrimaryState(shopId: ShopId, state: PrimaryDeviceState): Promise<void>
}
