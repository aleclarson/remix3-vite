import { Remix, SerializableProps } from '@remix-run/dom'
import { renderToStream } from '@remix-run/dom/server'
import { RouteMatch, RoutePattern } from '@remix-run/route-pattern'
import { isString, mapValues } from 'radashi'
import { DefaultLayout } from '../layouts/default.tsx'

type Promiseable<T> = T | Promise<T>

type RootComponent<
  SetupProps extends SerializableProps = any,
  UpdateProps extends SerializableProps = any,
> = (
  this: Remix.Handle,
  props: SetupProps,
) => Remix.RemixElement | ((props: UpdateProps) => Remix.RemixElement)

type RouteFactory = <TPattern extends string>(
  path: RoutePattern<TPattern>,
  handler: (match: RouteMatch<TPattern>) => Promiseable<
    | Response
    | Remix.RemixElement
    | { default: RootComponent }
    | {
        [K in 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH']?: (
          request: Request,
        ) => Promiseable<Response>
      }
  >,
) => Promiseable<Response | null>

export function createRouter(
  handler: (
    route: RouteFactory,
    request: Request,
  ) => AsyncGenerator<Promiseable<Response | null>, void, any>,
) {
  const resolveFrame = async (src: string) => {
    throw new Error('resolveFrame is not implemented')
  }

  return async (request: Request) => {
    const route: RouteFactory = async (pattern, handler) => {
      const match = pattern.match(request.url)
      if (match) {
        const result = await handler(match)
        if (result && typeof result === 'object') {
          if (result instanceof Response) {
            return result
          }
          if (Object.hasOwn(result, request.method)) {
            const apiRoute: (request: Request) => Promiseable<Response> = (
              result as any
            )[request.method]
            return apiRoute(request)
          }
          let root: Remix.RemixElement | undefined
          if (Object.hasOwn(result, 'default')) {
            const Root: Remix.Component = (result as any).default
            const Layout: Remix.Component =
              (result as any).$layoutComponent ?? DefaultLayout
            root = (
              <Layout {...(result as any).$layoutProps} request={request}>
                <Root />
              </Layout>
            )
          } else if (Object.hasOwn(result, '$rmx')) {
            root = (
              <DefaultLayout request={request}>{result as any}</DefaultLayout>
            )
          }
          if (root) {
            const stream = renderToStream(root, {
              resolveFrame,
            })
            return new Response(stream, {
              headers: {
                'Content-Type': 'text/html',
              },
            })
          }
        }
      }
      return null
    }

    for await (const response of handler(route, request)) {
      if (response) {
        return response
      }
    }
    return new Response(null, { status: 404 })
  }
}

export type LayoutComponent<P = {}> = Remix.Component<
  Remix.NoContext,
  P & DefaultLayoutProps
>

export type DefaultLayoutProps = {
  request: Request
  children: Remix.RemixNode
}

/**
 * Set a custom layout for the imported Remix component.
 */
export async function withLayout<T extends RootComponent, P = {}>(
  promise: Promise<{ default: T }>,
  layoutComponent: LayoutComponent<P>,
  layoutProps: P,
): Promise<{ default: T }>

export async function withLayout<T extends RootComponent>(
  promise: Promise<{ default: T }>,
  layoutComponent: LayoutComponent,
): Promise<{ default: T }>

export async function withLayout<T extends RootComponent>(
  promise: Promise<{ default: T }>,
  layoutComponent: LayoutComponent,
  layoutProps?: any,
) {
  const componentModule = await promise
  return {
    ...componentModule,
    $layoutComponent: layoutComponent,
    $layoutProps: layoutProps,
  }
}

type RouteMap = { [name: string]: string | RouteMap }

type ParsedRouteMap<TRoutes extends RouteMap> = {
  [TPath in keyof TRoutes]: TRoutes[TPath] extends string
    ? RoutePattern<TRoutes[TPath]>
    : ParsedRouteMap<Extract<TRoutes[TPath], RouteMap>>
}

/**
 * Declare a map of named route patterns.
 */
export function routes<const TRoutes extends RouteMap>(
  map: TRoutes,
): ParsedRouteMap<TRoutes> {
  return mapValues(map, (path) => {
    if (isString(path)) {
      return new RoutePattern(path)
    }
    return routes(path)
  }) as any
}
