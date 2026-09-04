/**
 * Event bus — in-process pub/sub for local events.
 *
 * Use this for local-side reactions (UI updates, notifications, audit logging).
 * For cross-device/cross-app sync, use @soostori/sync.
 */

import type { SoostoriEvent } from './envelope'

type EventHandler<T = unknown> = (event: SoostoriEvent<T>) => void | Promise<void>

interface Subscription {
  id: string
  name?: string
  handler: EventHandler
  /** Optional filter — only call handler when match returns true. */
  filter?: (event: SoostoriEvent) => boolean
}

/** Simple in-process event bus. Platform-agnostic — each platform wraps with native pub/sub if needed. */
export class EventBus {
  private subscriptions: Subscription[] = []
  private nextId = 1

  subscribe(args: {
    name?: string
    handler: EventHandler
    filter?: (event: SoostoriEvent) => boolean
  }): () => void {
    const id = `sub_${this.nextId++}`
    const sub: Subscription = { id, name: args.name, handler: args.handler, filter: args.filter }
    this.subscriptions.push(sub)
    return () => {
      this.subscriptions = this.subscriptions.filter(s => s.id !== id)
    }
  }

  async publish(event: SoostoriEvent): Promise<void> {
    const matching = this.subscriptions.filter(s => !s.filter || s.filter(event))
    await Promise.all(matching.map(async s => {
      try { await s.handler(event) }
      catch (err) { console.error('EventBus handler failed:', err) }
    }))
  }

  /** Subscribe to one specific event name. */
  on<T = unknown>(name: string, handler: EventHandler<T>): () => void {
    return this.subscribe({
      handler: handler as EventHandler,
      filter: (e) => e.name === name,
    })
  }

  /** Subscribe to a category prefix (e.g., 'sale.', 'stock.'). */
  onCategory(category: string, handler: EventHandler): () => void {
    return this.subscribe({
      handler,
      filter: (e) => e.name.startsWith(category),
    })
  }

  /** Subscribe to all events. */
  onAll(handler: EventHandler): () => void {
    return this.subscribe({ handler })
  }

  clear(): void {
    this.subscriptions = []
  }
}

/** Singleton — most apps use one bus. */
let _defaultBus: EventBus | null = null
export function getEventBus(): EventBus {
  if (!_defaultBus) _defaultBus = new EventBus()
  return _defaultBus
}
