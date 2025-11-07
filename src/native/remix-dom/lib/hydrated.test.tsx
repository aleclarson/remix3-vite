import { describe, it, expect } from 'vitest'
import type { Remix } from './component.ts'
import { hydrated, isHydratedComponent } from './hydrated.ts'

describe('hydrated', () => {
  describe('types', () => {
    it('keeps original types', () => {
      function Input(this: Remix.Handle, props: { defaultValue?: string }) {
        let value = props.defaultValue ?? ''
        return ({ label }: { label: string }) => (
          <label>
            {label}: <input type="text" value={value} />
          </label>
        )
      }

      let HydratedInput = hydrated('/js/test.js#Input', Input)

      // @ts-expect-error - should require default render prop
      let el = <Input />
      // @ts-expect-error - should require default render prop
      let el2 = <HydratedInput />

      expect(true).toBe(true)
    })

    it('only allows serializable props', () => {
      function Input(this: Remix.Handle, props: { defaultValue?: string; func: () => void }) {
        let value = props.defaultValue ?? ''
        return ({ label }: { label: string }) => (
          <label>
            {label}: <input type="text" value={value} />
          </label>
        )
      }

      // @ts-expect-error - should disallow non-serializable function prop
      let HydratedInput = hydrated('/js/test.js#Input', Input)

      function Input2(this: Remix.Handle, props: { defaultValue?: string }) {
        let value = props.defaultValue ?? ''
        return ({ label }: { label: string; func: () => void }) => (
          <label>
            {label}: <input type="text" value={value} />
          </label>
        )
      }

      // @ts-expect-error - should disallow non-serializable function prop
      let HydratedInput2 = hydrated('/js/test.js#Input', Input2)

      expect(true).toBe(true)
    })
  })

  describe('basic functionality', () => {
    it('marks a component as hydrated', () => {
      function TestComponent(this: Remix.Handle, props: { count: number }) {
        return () => <div>Count: {props.count}</div>
      }

      let HydratedComponent = hydrated('/js/test.js#TestComponent', TestComponent)

      expect(HydratedComponent.$hydrated).toBe(true)
      expect(HydratedComponent.$moduleUrl).toBe('/js/test.js')
      expect(HydratedComponent.$exportName).toBe('TestComponent')
    })

    it('parses module URL and export name from href', () => {
      function MyComponent() {
        return <div>Hello</div>
      }

      let HydratedComponent = hydrated('/js/components.js#MyComponent', MyComponent)

      expect(HydratedComponent.$moduleUrl).toBe('/js/components.js')
      expect(HydratedComponent.$exportName).toBe('MyComponent')
    })

    it('uses component name as fallback when no export name provided', () => {
      function NamedComponent() {
        return <div>Hello</div>
      }

      let HydratedComponent = hydrated('/js/components.js', NamedComponent)

      expect(HydratedComponent.$moduleUrl).toBe('/js/components.js')
      expect(HydratedComponent.$exportName).toBe('NamedComponent')
    })

    it('preserves the original component functionality', () => {
      function TestComponent(this: Remix.Handle, props: { initialCount: number }) {
        let count = props.initialCount

        return (props: { label: string }) => (
          <button>
            {props.label}: {count}
          </button>
        )
      }

      let HydratedComponent = hydrated('/js/test.js#TestComponent', TestComponent)

      // The hydrated component should still be callable
      expect(typeof HydratedComponent).toBe('function')

      // Mock Handle for testing - we'll just test that the function can be called
      // and returns the expected structure without actually invoking it with a real Handle
      let mockHandle = {} as Remix.Handle

      // Should work the same as the original component
      let renderFn = HydratedComponent.call(mockHandle, { initialCount: 5 })
      expect(typeof renderFn).toBe('function')

      if (typeof renderFn === 'function') {
        let element = renderFn({ label: 'Count' })
        expect(element).toEqual({
          $rmx: true,
          type: 'button',
          props: {
            children: ['Count', ': ', 5],
          },
          key: undefined,
          ref: undefined,
        })
      }
    })
  })

  describe('error handling', () => {
    it('throws error when no module URL provided', () => {
      function TestComponent() {
        return <div>Test</div>
      }

      expect(() => {
        hydrated('', TestComponent)
      }).toThrow('hydrated() requires a module URL')
    })

    it('throws error when no export name and component is anonymous', () => {
      let anonymousComponent = function () {
        return <div>Test</div>
      }

      // Force the function name to be empty to simulate truly anonymous function
      Object.defineProperty(anonymousComponent, 'name', { value: '' })

      expect(() => {
        hydrated('/js/test.js', anonymousComponent)
      }).toThrow('hydrated() requires either an export name in the href')
    })

    it('throws error when no export name and component name is empty', () => {
      function TestComponent() {
        return <div>Test</div>
      }

      // Simulate unnamed function
      Object.defineProperty(TestComponent, 'name', { value: '' })

      expect(() => {
        hydrated('/js/test.js', TestComponent)
      }).toThrow('hydrated() requires either an export name in the href')
    })
  })

  describe('type constraints', () => {
    it('accepts components with serializable props', () => {
      // This should compile without errors
      function ValidComponent(
        this: Remix.Handle,
        props: {
          str: string
          num: number
          bool: boolean
          obj: { nested: string }
          arr: number[]
          element: JSX.Element
        },
      ) {
        return () => <div>Valid</div>
      }

      let HydratedComponent = hydrated('/js/valid.js#ValidComponent', ValidComponent)
      expect(HydratedComponent.$hydrated).toBe(true)
    })

    // Type-level rejection: non-serializable props should be disallowed
    it('rejects components with non-serializable props', () => {
      function InvalidComponent(this: Remix.Handle, props: { func: () => void }) {
        return () => <div>Invalid</div>
      }

      // @ts-expect-error - non-serializable function prop should be rejected
      let HydratedInvalid = hydrated('/js/invalid.js#InvalidComponent', InvalidComponent)
      expect(true).toBe(true)
    })
  })

  describe('isHydratedComponent type guard', () => {
    it('returns true for hydrated components', () => {
      function TestComponent() {
        return <div>Test</div>
      }

      let HydratedComponent = hydrated('/js/test.js#TestComponent', TestComponent)
      expect(isHydratedComponent(HydratedComponent)).toBe(true)
    })

    it('returns false for regular components', () => {
      function RegularComponent() {
        return <div>Regular</div>
      }

      expect(isHydratedComponent(RegularComponent)).toBe(false)
    })

    it('returns false for non-function values', () => {
      expect(isHydratedComponent(null)).toBe(false)
      expect(isHydratedComponent(undefined)).toBe(false)
      expect(isHydratedComponent('string')).toBe(false)
      expect(isHydratedComponent(123)).toBe(false)
      expect(isHydratedComponent({})).toBe(false)
    })

    it('returns false for functions without hydration metadata', () => {
      function normalFunction() {}
      expect(isHydratedComponent(normalFunction)).toBe(false)
    })
  })

  describe('complex components', () => {
    it('handles stateful components with setup and render phases', () => {
      function Counter(this: Remix.Handle, setupProps: { initialCount: number }) {
        let count = setupProps.initialCount

        return (renderProps: { label: string }) => (
          <button type="button">
            {renderProps.label} {count}
          </button>
        )
      }

      let HydratedCounter = hydrated('/js/counter.js#Counter', Counter)

      expect(HydratedCounter.$hydrated).toBe(true)
      expect(HydratedCounter.$moduleUrl).toBe('/js/counter.js')
      expect(HydratedCounter.$exportName).toBe('Counter')
    })

    it('handles simple components that return JSX directly', () => {
      function SimpleComponent(this: Remix.Handle, props: { message: string }) {
        return <div>{props.message}</div>
      }

      let HydratedSimple = hydrated('/js/simple.js#SimpleComponent', SimpleComponent)

      expect(HydratedSimple.$hydrated).toBe(true)
      expect(HydratedSimple.$moduleUrl).toBe('/js/simple.js')
      expect(HydratedSimple.$exportName).toBe('SimpleComponent')
    })
  })
})
