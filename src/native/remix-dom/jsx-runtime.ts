import type { Remix } from './lib/component.ts'
import type { EventDescriptor } from '@remix-run/events'

import type { HTMLElements } from './lib/html-types.ts'

import { createElement } from './lib/component.ts'
export { Fragment } from './lib/component.ts'

// Only export the JSX runtime functions required by TypeScript
export function jsx(type: string, props: Remix.ElementProps, key?: Remix.Key): Remix.RemixElement
export function jsx<T extends (props: unknown) => unknown>(
  type: T,
  props: Remix.ComponentProps<T>,
  key?: Remix.Key,
): Remix.RemixElement
export function jsx(type: any, props: any, key?: any): Remix.RemixElement {
  return jsxAdapter(type, props, key)
}

export function jsxs(type: string, props: Remix.ElementProps, key?: Remix.Key): Remix.RemixElement
export function jsxs<T extends (props: unknown) => unknown>(
  type: T,
  props: Remix.ComponentProps<T>,
  key?: Remix.Key,
): Remix.RemixElement
export function jsxs(type: any, props: any, key?: any): Remix.RemixElement {
  return jsxAdapter(type, props, key)
}

export function jsxDEV(type: string, props: Remix.ElementProps, key?: Remix.Key): Remix.RemixElement
export function jsxDEV<T extends (props: unknown) => unknown>(
  type: T,
  props: Remix.ComponentProps<T>,
  key?: Remix.Key,
): Remix.RemixElement
export function jsxDEV(type: any, props: any, key?: any): Remix.RemixElement {
  return jsxAdapter(type, props, key)
}

function jsxAdapter(type: any, props: any, key: any): Remix.RemixElement {
  if (key !== undefined) {
    props = { ...props, key }
  }
  return createElement(type, props)
}

declare global {
  namespace JSX {
    /**
     * Attributes that are allowed on all JSX elements, including custom components.
     */
    interface IntrinsicAttributes {
      key?: Remix.Key
    }

    /**
     * The type that may be returned from a JSX component.
     */
    type Element = ReturnType<Remix.Component> | any

    /**
     * The types of props that are available to various JSX components.
     */
    interface IntrinsicElements extends Remix.BuiltinElements, HTMLElements {
      // Allow any unlisted elements as fallback
      [elemName: string]: any
    }

    /**
     * Normalizes the `on` prop so that JSX allows both an individual event
     * binding or an array of event bindings
     */
    type LibraryManagedAttributes<C, P> = C extends (...args: any[]) => any
      ? Remix.ComponentProps<C> extends { on?: EventDescriptor[] | undefined }
        ? Omit<Remix.ComponentProps<C>, 'on'> &
            (P extends { style?: any } ? Partial<Pick<P, 'style'>> : {}) &
            (P extends { css?: any } ? Partial<Pick<P, 'css'>> : {}) & {
              on?: EventDescriptor | EventDescriptor[] | undefined
            }
        : Remix.ComponentProps<C> &
            (P extends { style?: any } ? Partial<Pick<P, 'style'>> : {}) &
            (P extends { css?: any } ? Partial<Pick<P, 'css'>> : {})
      : P
  }
}
