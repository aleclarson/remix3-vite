import { Event, events, EventTarget, on } from './framework.ts'

// Extending a built-in class with type-safe events
declare global {
  interface Worker {
    // Does not exist at runtime. No createEventType wrapper needed.
    $rmxEvents: {
      message: MessageEvent
    }
  }
}

declare const worker: Worker

// 2nd argument to `events()` can be an array or a function.
events(worker, (on) => [
  // Same signature as standalone `on()` function. Good for bubbling events.
  on(Worker, 'message', (event) => {
    event satisfies MessageEvent
    event.target satisfies Worker
  }),
  // Lightweight signature for direct, non-bubbling event handling.
  on('message', (event) => {
    event satisfies MessageEvent
    event.target satisfies Worker
  }),
])

//
// CUSTOM EVENTS
//

// Declare a custom event type if you need custom properties.
class FooEvent extends Event<'foo'> {
  constructor(public readonly foo: string) {
    super('foo')
  }
}

// Custom event target
class Foo extends EventTarget<FooEvent | 'bar'> {}

// String literal types are coerced to `Event<string>` internally.
Foo.prototype.$rmxEvents satisfies {
  foo: FooEvent
  bar: Event<'bar'>
}

const foo = new Foo()

// Listening from a Remix component
events(foo, [
  on(Foo, 'foo', (event) => {
    event satisfies FooEvent
    event.target satisfies Foo
  }),
])
// ...or with a function
events(foo, (on) => [
  on('foo', (event) => {
    event satisfies FooEvent
    event.target satisfies Foo
  }),
])

// Dispatching an event
foo.dispatchEvent(new FooEvent('some value'))
foo.dispatchEvent(new Event('bar'))

// Invalid event types are rejected at compile time
foo.dispatchEvent(new Event('baz'))
//                ^ Argument of type 'Event<"baz">' is not assignable to parameter of type 'InferEvent<EventTarget<FooEvent | "bar">, "foo" | "bar">'.