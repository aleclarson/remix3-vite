import type { Remix } from './component.ts'

/**
 * Serializable primitive types that can be passed as props to hydrated components
 */
export type SerializablePrimitive = string | number | boolean | null | undefined

/**
 * Serializable object types that can be passed as props to hydrated components
 */
export type SerializableObject = {
  [key: string]: SerializableValue
}

/**
 * Serializable array types that can be passed as props to hydrated components
 */
export type SerializableArray = SerializableValue[]

/**
 * All serializable values that can be passed as props to hydrated components.
 * This includes primitives, objects, arrays, and Remix Elements.
 */
export type SerializableValue =
  | SerializablePrimitive
  | SerializableObject
  | SerializableArray
  | Remix.RemixNode

/**
 * Props that can be serialized and sent to hydrated components.
 * All values must be serializable (primitives, objects, arrays, or Remix Elements).
 */
export type SerializableProps = {
  [K in string]: SerializableValue
}

// Whitelist of allowed simple component return types (non-function)
type SimpleRenderable = Element | string | number | bigint | boolean | null | undefined

/**
 * Metadata added to hydrated components
 */
export type HydrationMetadata = {
  $hydrated: true
  $moduleUrl: string
  $exportName: string
}

/**
 * A hydrated component preserves the exact function type with added metadata
 */
export type HydratedComponent<
  H extends (this: Remix.Handle, props: any) => any = (this: Remix.Handle, props: any) => any,
> = H & HydrationMetadata

/**
 * Marks a component for client-side hydration.
 *
 * @param href Module URL with optional export name (format: "/js/module.js#ExportName")
 * @param component Component function that will be hydrated on the client
 * @returns The component augmented with hydration metadata
 *
 * @example
 * ```tsx
 * export const Counter = hydrated(
 *   '/js/counter.js#Counter',
 *   function (this: Handle, { initialCount }: { initialCount: number }) {
 *     let count = initialCount
 *
 *     return ({ label }: { label: string }) => (
 *       <button
 *         type="button"
 *         on={dom.click(() => {
 *           count++
 *           this.render()
 *         })}
 *       >
 *         {label} {count}
 *       </button>
 *     )
 *   }
 * )
 * ```
 */
// Overload for stateful components (setup returns render function)
export function hydrated<
  SetupProps extends SerializableProps = {},
  RenderProps extends SerializableProps = {},
>(
  href: string,
  component: (this: Remix.Handle, props: SetupProps) => (props: RenderProps) => Remix.RemixNode,
): HydratedComponent<
  (this: Remix.Handle, props: SetupProps) => (props: RenderProps) => Remix.RemixNode
>

// Overload for simple components (setup returns JSX directly)
export function hydrated<
  Props extends SerializableProps = {},
  Render extends SimpleRenderable = SimpleRenderable,
>(
  href: string,
  component: (this: Remix.Handle, props: Props) => Render,
): HydratedComponent<(this: Remix.Handle, props: Props) => Render>

// Implementation
export function hydrated(href: string, component: any): any {
  // Parse module URL and export name
  let [moduleUrl, exportName] = href.split('#')

  if (!moduleUrl) {
    throw new Error('hydrated() requires a module URL')
  }

  // Use component name as fallback if no export name provided
  let finalExportName = exportName || component.name

  if (!finalExportName) {
    throw new Error(
      'hydrated() requires either an export name in the href (e.g., "/js/module.js#ComponentName") or a named component function',
    )
  }

  // Augment the component with hydration metadata
  component.$hydrated = true
  component.$moduleUrl = moduleUrl
  component.$exportName = finalExportName

  return component
}

/**
 * Type guard to check if a component is hydrated
 */
export function isHydratedComponent<H extends (this: Remix.Handle, props: any) => any>(
  component: any,
): component is HydratedComponent<H> {
  return Boolean(component && typeof component === 'function' && component.$hydrated === true)
}
