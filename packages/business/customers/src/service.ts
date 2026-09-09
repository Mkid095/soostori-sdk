import type { Customer } from './types.js'
import type { CustomersRepository } from './repository.js'
import type { UUID } from '@soostori/core'
import { asShopId, asDeviceId, asUserId } from '@soostori/core'
import { createEvent, CUSTOMER_CREATED, CUSTOMER_UPDATED, CUSTOMER_FLAGGED } from '@soostori/events'
import { getEventBus } from '@soostori/events'

export class CustomersService {
  constructor(
    private readonly repo: CustomersRepository,
    private readonly shopId: UUID,
    private readonly deviceId: UUID,
    private readonly userId?: UUID,
  ) {}

  async create(data: Parameters<CustomersRepository['create']>[0]): Promise<Customer> {
    const customer = await this.repo.create(data)
    await getEventBus().publish(createEvent({
      name: CUSTOMER_CREATED,
      shopId: asShopId(this.shopId), deviceId: asDeviceId(this.deviceId), userId: this.userId ? asUserId(this.userId) : undefined,
      entityId: customer.id, entity: 'customer',
      payload: { customerId: customer.id, name: customer.name },
    }))
    return customer
  }

  async update(id: UUID, changes: Parameters<CustomersRepository['update']>[1]): Promise<Customer> {
    const customer = await this.repo.update(id, changes)
    await getEventBus().publish(createEvent({
      name: CUSTOMER_UPDATED,
      shopId: asShopId(this.shopId), deviceId: asDeviceId(this.deviceId), userId: this.userId ? asUserId(this.userId) : undefined,
      entityId: customer.id, entity: 'customer',
      payload: { customerId: customer.id },
    }))
    return customer
  }

  async flag(customerId: UUID, reason: string): Promise<void> {
    const flaggedBy = this.userId ?? this.deviceId
    await this.repo.createFlag({
      customerId,
      reason,
      flaggedBy: String(flaggedBy),
    })
    await getEventBus().publish(createEvent({
      name: CUSTOMER_FLAGGED,
      shopId: asShopId(this.shopId), deviceId: asDeviceId(this.deviceId), userId: this.userId ? asUserId(this.userId) : undefined,
      entityId: customerId, entity: 'customer',
      payload: { customerId, reason },
    }))
  }
}
