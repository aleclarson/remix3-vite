/// <reference lib="dom" />

type PropertiesOf<T> = { [K in keyof T]: T[K] }

export const Event = globalThis.Event as PropertiesOf<globalThis.Event> & {
  new <T extends string>(type: T): Event<T>
}
export type Event<T extends string = string> = globalThis.Event & {
  type: T
}

const RemixEventTarget = globalThis.EventTarget as {
  new <T extends string | Event<string>>(): EventTarget<T>
}
interface RemixEventTarget<T extends string | Event<string> = string>
  extends Omit<globalThis.EventTarget, 'dispatchEvent'> {
  $rmxEvents: [T] extends [Any]
    ? any
    : {
        [K in T extends string ? T : Extract<T, Event>['type']]: K extends T
          ? Event<K>
          : Extract<T, { type: K }>
      }

  dispatchEvent(event: InferEvent<EventTarget<T>>): boolean
}

export const EventTarget = RemixEventTarget
export type EventTarget<T extends string | Event<string> = string> =
  RemixEventTarget<T>

declare class Any {
  private __any: true
}

export type InferEventType<T extends EventTarget<any>> = T extends Any
  ? any
  : keyof T['$rmxEvents']

export type InferEvent<
  T extends EventTarget<any>,
  E extends InferEventType<T> = InferEventType<T>,
> = T['$rmxEvents'][E]

export type InferEventHandler<
  T extends EventTarget<any>,
  E extends InferEventType<T> = InferEventType<T>,
> = (event: InferEvent<T, E> & { target: T }) => void

export type EventDescriptor = {
  type: string
  handler: (event: Event) => void
  options: AddEventListenerOptions | undefined
}

export declare function on<
  T extends EventTarget<any>,
  E extends InferEventType<T>,
>(
  targetType: new (...args: any[]) => T,
  type: E,
  handler: InferEventHandler<T, E>,
  options?: AddEventListenerOptions,
): EventDescriptor

export declare function on(
  targetType: new (...args: any[]) => EventTarget<any>,
  type: string,
  handler: (event: Event) => void,
  options?: AddEventListenerOptions,
): EventDescriptor

type OnFunction = typeof on

export declare function events<T extends EventTarget<any>>(
  target: T,
  handlers: (on: {
    /* Lightweight signature for direct event handling */
    <E extends InferEventType<T>>(
      type: E,
      handler: InferEventHandler<T, E>,
      options?: AddEventListenerOptions,
    ): EventDescriptor

    /* Same signature as standalone `on()` function. Good for bubbling events. */
    <T extends EventTarget<any>, E extends InferEventType<T>>(
      targetType: new (...args: any[]) => T,
      type: E,
      handler: InferEventHandler<T, E>,
      options?: AddEventListenerOptions,
    ): EventDescriptor
  }) => EventDescriptor[],
): void

export declare function events(
  target: EventTarget<any>,
  handlers: EventDescriptor[] | ((on: OnFunction) => EventDescriptor[]),
): void
