/**
 * Event bus — in-process pub/sub for local events.
 *
 * Use this for local-side reactions (UI updates, notifications, audit logging).
 * For cross-device/cross-app sync, use @soostori/sync.
 */
/** Simple in-process event bus. Platform-agnostic — each platform wraps with native pub/sub if needed. */
export class EventBus {
    subscriptions = [];
    nextId = 1;
    subscribe(args) {
        const id = `sub_${this.nextId++}`;
        const sub = { id, name: args.name, handler: args.handler, filter: args.filter };
        this.subscriptions.push(sub);
        return () => {
            this.subscriptions = this.subscriptions.filter(s => s.id !== id);
        };
    }
    async publish(event) {
        const matching = this.subscriptions.filter(s => !s.filter || s.filter(event));
        await Promise.all(matching.map(async (s) => {
            try {
                await s.handler(event);
            }
            catch (err) {
                console.error('EventBus handler failed:', err);
            }
        }));
    }
    /** Subscribe to one specific event name. */
    on(name, handler) {
        return this.subscribe({
            handler: handler,
            filter: (e) => e.name === name,
        });
    }
    /** Subscribe to a category prefix (e.g., 'sale.', 'stock.'). */
    onCategory(category, handler) {
        return this.subscribe({
            handler,
            filter: (e) => e.name.startsWith(category),
        });
    }
    /** Subscribe to all events. */
    onAll(handler) {
        return this.subscribe({ handler });
    }
    clear() {
        this.subscriptions = [];
    }
}
/** Singleton — most apps use one bus. */
let _defaultBus = null;
export function getEventBus() {
    if (!_defaultBus)
        _defaultBus = new EventBus();
    return _defaultBus;
}
//# sourceMappingURL=bus.js.map