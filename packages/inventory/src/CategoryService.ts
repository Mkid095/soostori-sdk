/**
 * CategoryService — category CRUD with SyncEvent emission.
 *
 * Emits: category.created | category.updated
 */

import type { Category, SyncEvent, SyncEngine } from '@soostori/contracts'
import type { BusinessId, CategoryId, EmployeeId, DeviceId } from '@soostori/core'
import { newId, asCategoryId, asSyncEventId, asIdempotencyKey } from '@soostori/core'

export interface CreateCategoryInput {
  businessId: BusinessId
  name: string
  description?: string
  parentId?: CategoryId
}

export interface CategoryStore {
  getCategory(id: CategoryId): Promise<Category | null>
  upsertCategory(category: Category): Promise<void>
  listCategories(businessId: BusinessId): Promise<Category[]>
}

export class CategoryService {
  constructor(
    private readonly store: CategoryStore,
    private readonly syncEngine: SyncEngine,
    private readonly businessId: BusinessId,
    private readonly deviceId: DeviceId,
    private readonly employeeId: EmployeeId,
  ) {}

  async createCategory(input: CreateCategoryInput): Promise<Category> {
    const now = new Date().toISOString()
    const id = asCategoryId(newId())

    const category: Category = {
      id,
      businessId: input.businessId,
      name: input.name,
      color: '#6366f1',
      description: input.description ?? null,
      isActive: true,
      createdAt: now,
      updatedAt: now,
      version: 1,
    }

    await this.store.upsertCategory(category)
    await this.emit('category.created', category, 'create')

    return category
  }

  async listCategories(businessId: BusinessId): Promise<Category[]> {
    if (businessId !== this.businessId) return []
    return this.store.listCategories(businessId)
  }

  private async emit(operation: 'category.created' | 'category.updated', entity: Category, syncOp: SyncEvent['operation']): Promise<void> {
    const event: SyncEvent = {
      id: asSyncEventId(newId()),
      idempotencyKey: asIdempotencyKey(newId()),
      businessId: this.businessId,
      entityKind: 'category',
      entityId: entity.id,
      operation: syncOp,
      originatingDeviceId: this.deviceId,
      originatingEmployeeId: this.employeeId,
      clientSequence: Date.now(),
      clientCreatedAt: new Date().toISOString(),
      entityVersion: entity.version,
      payload: entity as unknown as Record<string, unknown>,
      state: 'pending',
    }
    await this.syncEngine.enqueue(event)
  }
}
