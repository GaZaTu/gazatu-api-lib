import { PubSubEngine, PubSub as PubSubImpl } from "npm:graphql-subscriptions@^3.0.0"
import type { PubSubAsyncIterableIterator } from "npm:graphql-subscriptions@^3.0.0/dist/pubsub-async-iterable-iterator"

declare class PubSubImplType<Events extends { [event: string]: unknown } = Record<string, never>> extends PubSubEngine {
  constructor()
  publish<K extends keyof Events>(triggerName: K, payload: Events[K] extends never ? any : Events[K]): Promise<void>
  subscribe<K extends keyof Events>(triggerName: K, onMessage: (payload: Events[K] extends never ? any : Events[K]) => void): Promise<number>
  unsubscribe(subId: number): void
  asyncIterableIterator<K extends keyof Events>(triggers: K): PubSubAsyncIterableIterator<Events[K]>
  asyncIterableIterator<K extends readonly (keyof Events)[]>(triggers: K): PubSubAsyncIterableIterator<Events[K[number]]>
}

type PubSubConstructor = new <Events extends { [event: string]: unknown } = Record<string, never>>() => PubSubImplType<Events>

export const PubSub = PubSubImpl as any as PubSubConstructor
