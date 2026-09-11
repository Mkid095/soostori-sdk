import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DeviceService, type SyncEngineLike } from '../src/DeviceService'
import { PrimaryDeviceCoordinator } from '../src/index'
import { getEventBus } from '@soostori/events'
import {
  DEVICE_ENROLLED, DEVICE_APPROVED, DEVICE_REVOKED,
  DEVICE_PRIMARY_TRANSFERRED, HOST_TRANSFER,
} from '@soostori/events'
import { newId, asBusinessId } from '@soostori/core'
import type { Device, DevicesRepository } from '../src/index'
import type { SoostoriEvent } from '@soostori/events'

const BUSINESS = asBusinessId('biz-1')
const DEVICE_ID = newId()

// ── Mock repository ────────────────────────────────────────────────────────────

function createMockRepo(): DevicesRepository {
  const devices = new Map<string, Device>()
  return {
    async getLocalIdentity() { return null },
    async saveLocalIdentity() {},
    async findDevice(id) { return devices.get(String(id)) ?? null },
    async findByShop() { return [...devices.values()] },
    async registerDevice(d) { devices.set(String(d.id), d) },
    async updateDevice(id, changes) {
      const d = devices.get(String(id))
      // Silently skip if device not in repo (e.g. local device not yet enrolled)
      if (!d) return { id, ...changes } as Device
      const updated = { ...d, ...changes }
      devices.set(String(id), updated)
      return updated
    },
    async revokeDevice(id) {
      const d = devices.get(String(id))
      if (d) devices.set(String(id), { ...d, status: 'revoked' })
    },
    async getPrimaryState() { return null },
    async savePrimaryState() {},
  }
}

// ── Mock sync engine ───────────────────────────────────────────────────────────

function createMockSync(): SyncEngineLike {
  return {
    async enqueue(_event: SoostoriEvent) { /* noop for event-enqueue tests */ },
  }
}

function createSpySync(): SyncEngineLike & { enqueueSpy: ReturnType<typeof vi.fn> } {
  const enqueueSpy = vi.fn()
  return { async enqueue(e: SoostoriEvent) { enqueueSpy(e) }, enqueueSpy }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DeviceService', () => {
  let repo: DevicesRepository
  let primary: PrimaryDeviceCoordinator

  beforeEach(() => {
    getEventBus().clear()
    repo = createMockRepo()
    primary = new PrimaryDeviceCoordinator({
      shopId: BUSINESS as any,
      deviceId: DEVICE_ID as any,
    })
  })

  // ── enrollDevice ─────────────────────────────────────────────────────────────

  describe('enrollDevice', () => {
    it('registers device with pending status', async () => {
      const svc = new DeviceService({
        businessId: BUSINESS,
        deviceId: DEVICE_ID as any,
        repository: repo,
        syncEngine: createMockSync(),
      })

      const device = await svc.enrollDevice({
        deviceName: 'POS Terminal 1',
        deviceType: 'desktop',
        hostname: 'pos-1.local',
        platform: 'win32-x64',
        appVersion: '1.0.0',
      })

      expect(device.status).toBe('pending')
      expect(device.deviceName).toBe('POS Terminal 1')
      expect(device.deviceType).toBe('desktop')
      expect(device.isPrimary).toBe(false)
      expect(device.authorizedAt).toBeNull()
    })

    it('calls syncEngine.enqueue with device.enrolled event', async () => {
      const sync = createSpySync()
      const svc = new DeviceService({
        businessId: BUSINESS,
        deviceId: DEVICE_ID as any,
        repository: repo,
        syncEngine: sync,
      })

      await svc.enrollDevice({ deviceName: 'Test', deviceType: 'mobile' })
      expect(sync.enqueueSpy).toHaveBeenCalledTimes(1)
      const ev = sync.enqueueSpy.mock.calls[0][0] as SoostoriEvent
      expect(ev.name).toBe(DEVICE_ENROLLED)
    })

    it('publishes event to local bus', async () => {
      const handler = vi.fn()
      getEventBus().on(DEVICE_ENROLLED, handler)

      const svc = new DeviceService({
        businessId: BUSINESS,
        deviceId: DEVICE_ID as any,
        repository: repo,
        syncEngine: createMockSync(),
      })
      await svc.enrollDevice({ deviceName: 'Bus Test', deviceType: 'desktop' })
      expect(handler).toHaveBeenCalledTimes(1)
    })

    it('throws on empty device name', async () => {
      const svc = new DeviceService({
        businessId: BUSINESS,
        deviceId: DEVICE_ID as any,
        repository: repo,
        syncEngine: createMockSync(),
      })
      await expect(
        svc.enrollDevice({ deviceName: '', deviceType: 'desktop' })
      ).rejects.toThrow()
    })
  })

  // ── approveDevice ─────────────────────────────────────────────────────────────

  describe('approveDevice', () => {
    it('sets status to authorized and records authorizedAt', async () => {
      const svc = new DeviceService({
        businessId: BUSINESS,
        deviceId: DEVICE_ID as any,
        repository: repo,
        syncEngine: createMockSync(),
      })

      const enrolled = await svc.enrollDevice({
        deviceName: 'To Approve', deviceType: 'desktop',
      })
      const approved = await svc.approveDevice(enrolled.id as any, 'user-1' as any)

      expect(approved.status).toBe('authorized')
      expect(approved.authorizedAt).not.toBeNull()
    })

    it('throws when device not found', async () => {
      const svc = new DeviceService({
        businessId: BUSINESS,
        deviceId: DEVICE_ID as any,
        repository: repo,
        syncEngine: createMockSync(),
      })
      await expect(
        svc.approveDevice(newId() as any, 'user-1' as any)
      ).rejects.toThrow('Device not found')
    })

    it('throws when device already revoked', async () => {
      const svc = new DeviceService({
        businessId: BUSINESS,
        deviceId: DEVICE_ID as any,
        repository: repo,
        syncEngine: createMockSync(),
      })
      const enrolled = await svc.enrollDevice({
        deviceName: 'Revoked', deviceType: 'desktop',
      })
      await repo.revokeDevice(enrolled.id as any, new Date().toISOString() as any)
      await expect(
        svc.approveDevice(enrolled.id as any, 'user-1' as any)
      ).rejects.toThrow('revoked')
    })

    it('enqueues device.approved event', async () => {
      const sync = createSpySync()
      const svc = new DeviceService({
        businessId: BUSINESS,
        deviceId: DEVICE_ID as any,
        repository: repo,
        syncEngine: sync,
      })
      const enrolled = await svc.enrollDevice({
        deviceName: 'Approve Event', deviceType: 'mobile',
      })
      await svc.approveDevice(enrolled.id as any, 'admin-1' as any)

      expect(sync.enqueueSpy).toHaveBeenCalled()
      const ev = sync.enqueueSpy.mock.calls.find(
        ([e]: [SoostoriEvent]) => e.name === DEVICE_APPROVED
      )
      expect(ev).toBeDefined()
    })
  })

  // ── revokeDevice ─────────────────────────────────────────────────────────────

  describe('revokeDevice', () => {
    it('sets device status to revoked', async () => {
      const svc = new DeviceService({
        businessId: BUSINESS,
        deviceId: DEVICE_ID as any,
        repository: repo,
        syncEngine: createMockSync(),
      })
      const enrolled = await svc.enrollDevice({
        deviceName: 'To Revoke', deviceType: 'desktop',
      })
      await svc.revokeDevice(enrolled.id as any, 'admin-1' as any)

      const found = await repo.findDevice(enrolled.id as any)
      expect(found?.status).toBe('revoked')
    })

    it('throws when device not found', async () => {
      const svc = new DeviceService({
        businessId: BUSINESS,
        deviceId: DEVICE_ID as any,
        repository: repo,
        syncEngine: createMockSync(),
      })
      await expect(
        svc.revokeDevice(newId() as any, 'admin-1' as any)
      ).rejects.toThrow('Device not found')
    })

    it('enqueues device.revoked event', async () => {
      const sync = createSpySync()
      const svc = new DeviceService({
        businessId: BUSINESS,
        deviceId: DEVICE_ID as any,
        repository: repo,
        syncEngine: sync,
      })
      const enrolled = await svc.enrollDevice({
        deviceName: 'Revoke Event', deviceType: 'desktop',
      })
      await svc.revokeDevice(enrolled.id as any, 'owner-1' as any)

      expect(sync.enqueueSpy).toHaveBeenCalled()
      const ev = sync.enqueueSpy.mock.calls.find(
        ([e]: [SoostoriEvent]) => e.name === DEVICE_REVOKED
      )
      expect(ev).toBeDefined()
    })
  })

  // ── transferPrimary ─────────────────────────────────────────────────────────

  describe('transferPrimary', () => {
    it('throws when PrimaryDeviceCoordinator not configured', async () => {
      const svc = new DeviceService({
        businessId: BUSINESS,
        deviceId: DEVICE_ID as any,
        repository: repo,
        syncEngine: createMockSync(),
        // no primaryCoordinator
      })
      await expect(
        svc.transferPrimary(newId() as any, 'user-1' as any)
      ).rejects.toThrow('PrimaryDeviceCoordinator not configured')
    })

    it('throws when device is not current primary', async () => {
      primary.ingestHeartbeat({
        deviceId: DEVICE_ID as any,
        shopId: BUSINESS as any,
        timestamp: new Date().toISOString(),
        isPrimary: true,
        reachable: true,
        stockSequence: 1,
      })

      const svc = new DeviceService({
        businessId: BUSINESS,
        deviceId: newId() as any, // different device
        repository: repo,
        syncEngine: createMockSync(),
        primaryCoordinator: primary,
      })

      await expect(
        svc.transferPrimary(newId() as any, 'user-1' as any)
      ).rejects.toThrow('Only the current primary device can initiate a transfer')
    })

    it('throws when target device not found', async () => {
      primary.ingestHeartbeat({
        deviceId: DEVICE_ID as any,
        shopId: BUSINESS as any,
        timestamp: new Date().toISOString(),
        isPrimary: true,
        reachable: true,
        stockSequence: 1,
      })

      const svc = new DeviceService({
        businessId: BUSINESS,
        deviceId: DEVICE_ID as any,
        repository: repo,
        syncEngine: createMockSync(),
        primaryCoordinator: primary,
      })

      await expect(
        svc.transferPrimary(newId() as any, 'user-1' as any)
      ).rejects.toThrow('Target device not found')
    })

    it('emits device.primary_transferred and host_transfer events', async () => {
      primary.ingestHeartbeat({
        deviceId: DEVICE_ID as any,
        shopId: BUSINESS as any,
        timestamp: new Date().toISOString(),
        isPrimary: true,
        reachable: true,
        stockSequence: 1,
      })

      const sync = createSpySync()
      const svc = new DeviceService({
        businessId: BUSINESS,
        deviceId: DEVICE_ID as any,
        repository: repo,
        syncEngine: sync,
        primaryCoordinator: primary,
      })

      // Enroll and approve a target device
      const target = await svc.enrollDevice({
        deviceName: 'Target Device', deviceType: 'desktop',
      })
      await svc.approveDevice(target.id as any, 'admin-1' as any)
      sync.enqueueSpy.mockClear()

      await svc.transferPrimary(target.id as any, 'owner-1' as any)

      // Both device-level and LAN-level events must be emitted
      const eventNames = sync.enqueueSpy.mock.calls.map(([e]: [SoostoriEvent]) => e.name)
      expect(eventNames).toContain(DEVICE_PRIMARY_TRANSFERRED)
      expect(eventNames).toContain(HOST_TRANSFER)
    })
  })

  // ── listDevices / getDevice ─────────────────────────────────────────────────

  describe('listDevices', () => {
    it('returns all enrolled devices', async () => {
      const svc = new DeviceService({
        businessId: BUSINESS,
        deviceId: DEVICE_ID as any,
        repository: repo,
        syncEngine: createMockSync(),
      })
      await svc.enrollDevice({ deviceName: 'D1', deviceType: 'desktop' })
      await svc.enrollDevice({ deviceName: 'D2', deviceType: 'mobile' })

      const all = await svc.listDevices()
      expect(all).toHaveLength(2)
    })
  })

  describe('getDevice', () => {
    it('returns device by id', async () => {
      const svc = new DeviceService({
        businessId: BUSINESS,
        deviceId: DEVICE_ID as any,
        repository: repo,
        syncEngine: createMockSync(),
      })
      const enrolled = await svc.enrollDevice({
        deviceName: 'Find Me', deviceType: 'desktop',
      })

      const found = await svc.getDevice(enrolled.id as any)
      expect(found?.deviceName).toBe('Find Me')
    })

    it('returns null for unknown id', async () => {
      const svc = new DeviceService({
        businessId: BUSINESS,
        deviceId: DEVICE_ID as any,
        repository: repo,
        syncEngine: createMockSync(),
      })
      const found = await svc.getDevice(newId() as any)
      expect(found).toBeNull()
    })
  })
})
