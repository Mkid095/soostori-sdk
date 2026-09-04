import type { Debt, DebtPayment } from './types'
import type { DebtsRepository } from './repository'
import type { UUID, Money } from '@soostori/core'
import {
  createEvent, DEBT_CREATED, DEBT_PAYMENT_RECORDED, DEBT_WRITTEN_OFF,
} from '@soostori/events'
import { getEventBus } from '@soostori/events'

export class DebtsService {
  constructor(
    private readonly repo: DebtsRepository,
    private readonly shopId: UUID,
    private readonly deviceId: UUID,
    private readonly userId?: UUID,
  ) {}

  async create(data: Parameters<DebtsRepository['create']>[0]): Promise<Debt> {
    const debt = await this.repo.create(data)
    await getEventBus().publish(createEvent({
      name: DEBT_CREATED,
      shopId: this.shopId, deviceId: this.deviceId, userId: this.userId,
      entityId: debt.id, entity: 'debt',
      payload: { debtId: debt.id, customerId: debt.customerId, amount: debt.amount },
    }))
    return debt
  }

  async recordPayment(debtId: UUID, amount: Money, paymentMethod: DebtPayment['paymentMethod'], reference?: string): Promise<{ debt: Debt; payment: DebtPayment }> {
    const payment = await this.repo.createPayment({
      debtId,
      amount,
      paymentMethod,
      reference: reference ?? null,
      notes: null,
      userId: this.userId ?? this.deviceId,
    })
    // Update debt: amountPaid += amount, status
    const debt = await this.repo.findById(debtId)
    if (!debt) throw new Error(`Debt ${debtId} not found`)
    const newPaid = debt.amountPaid + amount
    const status = newPaid >= debt.amount ? 'paid' : 'partial'
    const updated = await this.repo.update(debtId, { amountPaid: newPaid, status })

    await getEventBus().publish(createEvent({
      name: DEBT_PAYMENT_RECORDED,
      shopId: this.shopId, deviceId: this.deviceId, userId: this.userId,
      entityId: debtId, entity: 'debt',
      payload: { debtId, paymentId: payment.id, amount },
    }))
    return { debt: updated, payment }
  }

  async writeOff(debtId: UUID, reason: string): Promise<Debt> {
    const updated = await this.repo.update(debtId, { status: 'written_off' })
    await getEventBus().publish(createEvent({
      name: DEBT_WRITTEN_OFF,
      shopId: this.shopId, deviceId: this.deviceId, userId: this.userId,
      entityId: debtId, entity: 'debt',
      payload: { debtId, reason },
    }))
    return updated
  }
}
