/**
 * Desktop devices repository — localStorage-backed device identity persistence.
 */

import type { Device, DeviceIdentity, PrimaryDeviceState } from './types.js'
import type { UUID, ShopId, ISO8601 } from '@soostori/core'
import type { DevicesRepository } from './repository.js'

const STORAGE_KEY = 'soostori_device_identity'
const PRIMARY_STATE_PREFIX = 'soostori_primary_state_'

export class DesktopDevicesRepository implements DevicesRepository {
  async getLocalIdentity(): Promise<DeviceIdentity | null> {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return null
      return JSON.parse(raw) as DeviceIdentity
    } catch {
      return null
    }
  }

  async saveLocalIdentity(identity: DeviceIdentity): Promise<void> {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(identity))
  }

  // Remaining methods are no-ops for desktop — device registry is cloud-only.
  // Platform adapters that need shop-scoped device tracking can subclass and override.

  async findDevice(id: UUID): Promise<Device | null> {
    return null
  }

  async findByShop(shopId: ShopId): Promise<Device[]> {
    return []
  }

  async registerDevice(device: Device): Promise<void> {
    // no-op
  }

  async updateDevice(id: UUID, changes: Partial<Device>): Promise<Device> {
    throw new Error('Device registry not available on desktop')
  }

  async revokeDevice(id: UUID, at: ISO8601): Promise<void> {
    // no-op
  }

  async countActiveDevices(shopId: ShopId): Promise<number> {
    return 0
  }

  async getPrimaryState(shopId: ShopId): Promise<PrimaryDeviceState | null> {
    try {
      const raw = localStorage.getItem(PRIMARY_STATE_PREFIX + shopId)
      if (!raw) return null
      return JSON.parse(raw) as PrimaryDeviceState
    } catch {
      return null
    }
  }

  async savePrimaryState(shopId: ShopId, state: PrimaryDeviceState): Promise<void> {
    localStorage.setItem(PRIMARY_STATE_PREFIX + shopId, JSON.stringify(state))
  }
}
