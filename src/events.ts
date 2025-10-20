import { getOrInsertComputed } from 'radashi'

type EventListenerCache = Map<
  EventListenerOrEventListenerObject,
  EventListenerOptions
>

const wm = new WeakMap<EventTarget, Map<string, EventListenerCache>>()

export function getEventListeners(
  target: EventTarget,
): Map<string, EventListenerCache> | undefined
export function getEventListeners(
  target: EventTarget,
  type: string,
): EventListenerCache | undefined
export function getEventListeners(target: EventTarget, type?: string) {
  const listeners = wm.get(target)
  return type ? listeners?.get(type) : listeners
}

export function injectEventSupport({
  EventTarget,
}: {
  EventTarget: typeof globalThis.EventTarget
}) {
  const { addEventListener, removeEventListener } = EventTarget.prototype

  EventTarget.prototype.addEventListener = function (type, listener, options) {
    if (listener) {
      const listenersByType = getOrInsertComputed(wm, this, () => new Map())
      const listeners = getOrInsertComputed(
        listenersByType,
        type,
        () => new Map(),
      )
      listeners.set(
        listener,
        typeof options === 'boolean' ? { capture: options } : options || {},
      )
      console.log('Adding "%s" listener to', type, (this as Element).outerHTML)
    }

    return addEventListener.call(this, type, listener, options)
  }

  EventTarget.prototype.removeEventListener = function (
    type,
    listener,
    options,
  ) {
    if (listener) {
      const listenersByType = wm.get(this)
      const listeners = listenersByType?.get(type)
      if (listeners?.delete(listener) && listeners.size === 0) {
        wm.delete(this)
      }
    }
    return removeEventListener.call(this, type, listener, options)
  }
}
