/**
 * Event bus — in-process pub/sub for local events.
 *
 * Use this for local-side reactions (UI updates, notifications, audit logging).
 * For cross-device/cross-app sync, use @soostori/sync.
 */
import type { SoostoriEvent } from './envelope';
type EventHandler<T = unknown> = (event: SoostoriEvent<T>) => void | Promise<void>;
/** Simple in-process event bus. Platform-agnostic — each platform wraps with native pub/sub if needed. */
export declare class EventBus {
    private subscriptions;
    private nextId;
    subscribe(args: {
        name?: string;
        handler: EventHandler;
        filter?: (event: SoostoriEvent) => boolean;
    }): () => void;
    publish(event: SoostoriEvent): Promise<void>;
    /** Subscribe to one specific event name. */
    on<T = unknown>(name: string, handler: EventHandler<T>): () => void;
    /** Subscribe to a category prefix (e.g., 'sale.', 'stock.'). */
    onCategory(category: string, handler: EventHandler): () => void;
    /** Subscribe to all events. */
    onAll(handler: EventHandler): () => void;
    clear(): void;
}
export declare function getEventBus(): EventBus;
export {};
//# sourceMappingURL=bus.d.ts.map