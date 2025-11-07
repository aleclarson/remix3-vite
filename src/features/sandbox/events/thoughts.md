I'll add to this document as questions arise.

### What's wrong with `createEventType`?

To me, it feels like an unnecessary abstraction. I've found an approach that provides the same type safety without it. Just use `Event` and `EventTarget` subclasses.

### What about this approach?

#### Alternative 1

**Why not do it like this? ↓**

```ts
events(foo, {
  foo(event) {
    event satisfies FooEvent
  },
})
```

If you do it that way, you can't listen to bubbling events (at least, not with type safety).
