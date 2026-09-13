/**
 * Device repository — implements @soostori/devices DevicesRepository over Desktop SQLite.
 *
 * Desktop schema: devices(id, shop_id, employee_id, device_name, device_type,
 *   capabilities, is_host, is_online, connection_token, last_seen, created_at,
 *   status, authorized_at, app_version, hostname, platform)
 *
 * SDK Device shape: { id, shopId, deviceName, deviceType, status, isLanHost,
 *   lastSeenAt, authorizedAt, activeEmployeeId, appVersion, hostname, platform }
 *
 * CONFLICT resolved by Phase 9.1.1 schema migration (adds missing columns).
 * Desktop is_host (boolean) → SDK isLanHost (boolean): same semantics.
 */

import { getDatabase } from './sqlite-database.js'
import type { DevicesRepository } from '@soostori/devices'
import type { Device, DeviceIdentity, PrimaryDeviceState } from '@soostori/devices'
import type { UUID, ShopId, ISO8601 } from '@soostori/core'
import { asDeviceId } from '@soostori/core'

interface DeviceRow {
  id: string; shop_id: string; employee_id: string | null; device_name: string;
  device_type: string; capabilities: string; is_host: number; is_online: number;
  connection_token: string | null; last_seen: string | null; created_at: string;
  status: string | null; authorized_at: string | null; app_version: string | null;
  hostname: string | null; platform: string | null;
}

function rowToDevice(row: DeviceRow): Device {
  return {
    id: asDeviceId(row.id),
    shopId: row.shop_id as ShopId,
    deviceName: row.device_name,
    deviceType: row.device_type as Device['deviceType'],
    status: (row.status ?? 'offline') as Device['status'],
    isLanHost: row.is_host === 1,
    lastSeenAt: row.last_seen as ISO8601 | null,
    authorizedAt: row.authorized_at as ISO8601 | null,
    activeEmployeeId: row.employee_id as Device['activeEmployeeId'],
    appVersion: row.app_version ?? null,
    hostname: row.hostname ?? null,
    platform: row.platform ?? null,
  }
}

export class DesktopDevicesRepository implements DevicesRepository {
  async getLocalIdentity(): Promise<DeviceIdentity | null> {
    // Desktop stores identity in app_settings singleton.
    return null
  }

  async saveLocalIdentity(_identity: DeviceIdentity): Promise<void> {
    // Desktop uses app_settings singleton; handled by Electron main process
  }

  async findDevice(id: UUID): Promise<Device | null> {
    const row = getDatabase().prepare('SELECT * FROM devices WHERE id = ?').get(id) as DeviceRow | undefined
    return row ? rowToDevice(row) : null
  }

  async findByShop(shopId: ShopId): Promise<Device[]> {
    const rows = getDatabase().prepare(
      'SELECT * FROM devices WHERE shop_id = ? ORDER BY created_at DESC',
    ).all(shopId) as DeviceRow[]
    return rows.map(rowToDevice)
  }

  async registerDevice(device: Device): Promise<void> {
    const db = getDatabase()
    const existing = db.prepare('SELECT id FROM devices WHERE id = ?').get(device.id)
    if (existing) {
      db.prepare(`
        UPDATE devices SET device_name = ?, device_type = ?, status = ?,
          is_host = ?, last_seen = ? WHERE id = ?
      `).run(device.deviceName, device.deviceType, device.status,
        device.isLanHost ? 1 : 0, device.lastSeenAt ?? new Date().toISOString(), device.id)
    } else {
      db.prepare(`
        INSERT INTO devices (id, shop_id, device_name, device_type, capabilities, is_host,
          is_online, last_seen, status, authorized_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
      `).run(
        device.id, device.shopId, device.deviceName, device.deviceType,
        '{"sales":true,"inventory":true,"printing":true}',
        device.isLanHost ? 1 : 0,
        device.lastSeenAt ?? new Date().toISOString(),
        device.status, device.authorizedAt, new Date().toISOString(),
      )
    }
  }

  async updateDevice(id: UUID, changes: Partial<Device>): Promise<Device> {
    const db = getDatabase()
    const fieldMap: Record<string, string> = {
      deviceName: 'device_name', deviceType: 'device_type', status: 'status',
      isLanHost: 'is_host', lastSeenAt: 'last_seen', authorizedAt: 'authorized_at',
      activeEmployeeId: 'employee_id', appVersion: 'app_version', hostname: 'hostname', platform: 'platform',
    }
    const sets: string[] = []; const vals: unknown[] = []
    for (const [sdkKey, dbCol] of Object.entries(fieldMap)) {
      const v = changes[sdkKey as keyof Device]
      if (v !== undefined) { sets.push(`${dbCol} = ?`); vals.push(v) }
    }
    if (sets.length > 0) {
      db.prepare(`UPDATE devices SET ${sets.join(', ')} WHERE id = ?`).run(...vals, id)
    }
    const row = db.prepare('SELECT * FROM devices WHERE id = ?').get(id) as DeviceRow
    return rowToDevice(row)
  }

  async revokeDevice(id: UUID, _at: ISO8601): Promise<void> {
    getDatabase().prepare("UPDATE devices SET status = 'revoked' WHERE id = ?").run(id)
  }

  async countActiveDevices(shopId: ShopId): Promise<number> {
    const row = getDatabase().prepare(
      "SELECT COUNT(*) as count FROM devices WHERE shop_id = ? AND status != 'revoked'",
    ).get(shopId) as { count: number }
    return row.count
  }

  async getPrimaryState(_shopId: ShopId): Promise<PrimaryDeviceState | null> {
    const db = getDatabase()
    const primary = db.prepare(
      'SELECT id, last_seen FROM devices WHERE is_host = 1 LIMIT 1',
    ).get() as { id: string; last_seen: string | null } | undefined
    if (!primary) return null
    const now = Date.now()
    const lastSeen = primary.last_seen ? new Date(primary.last_seen).getTime() : 0
    const stalenessMs = now - lastSeen
    let status: PrimaryDeviceState['status'] = 'online'
    if (stalenessMs > 60_000) status = 'lost'
    else if (stalenessMs > 15_000) status = 'stale'
    return {
      primaryId: asDeviceId(primary.id),
      electedAt: null,
      lastHeartbeatAt: primary.last_seen as ISO8601 | null,
      stalenessMs,
      status,
      electionPending: false,
    }
  }

  async savePrimaryState(_shopId: ShopId, _state: PrimaryDeviceState): Promise<void> {
    // Desktop: primary state is derived from is_host column. No separate storage needed.
  }
}
