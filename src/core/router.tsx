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

type RouteFactory<TRoutes extends RoutePatternMap = {}> = {
  <TPattern extends string>(
    path: TPattern | RoutePattern<TPattern>,
    handler: RouteHandler<RouteMatch<TPattern>>,
  ): Promiseable<Response | null>
} & {
  [K in keyof TRoutes]: TRoutes[K] extends infer R
    ? R extends RoutePattern<infer P>
      ? RouteHandler<RouteMatch<P>> extends infer H
        ? (handler: H) => Promiseable<Response | null>
        : never
      : R extends RoutePatternMap
        ? RouteFactory<R>
        : never
    : never
}

type RouteHandler<TMatch extends object = {}> = (
  request: Request & TMatch,
) => Promiseable<RouteResult<TMatch>>

type RouteResult<TMatch extends object = {}> =
  | Remix.RemixElement
  | Response
  | null
  | /* Remix component route. */ {
      default: RootComponent<SerializableProps & TMatch>
    }
  | /* Classic API route. Any HTTP method. */ {
      default: {
        fetch: (request: Request & TMatch) => Promiseable<Response | null>
      }
    }
  | /* Method-specific API routes. */ {
      [K in 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH']?: (
        request: Request & TMatch,
      ) => Promiseable<Response | null>
    }

export function createRouter<TRoutes extends RoutePatternMap>(
  routes: TRoutes,
  handler: (
    route: RouteFactory<TRoutes>,
    request: Request,
  ) => AsyncGenerator<Promiseable<Response | null>, void, any>,
) {
  const resolveFrame = async (src: string) => {
    throw new Error('resolveFrame is not implemented')
  }

  return async (request: Request) => {
    for await (const response of handler(
      createRouteFactory(routes, request, resolveFrame),
      request,
    )) {
      if (response) {
        return response
      }
    }
    return new Response(null, { status: 404 })
  }
}

function createRouteFactory<TRoutes extends RoutePatternMap>(
  routes: TRoutes,
  request: Request,
  resolveFrame: (src: string) => Promiseable<Remix.RemixElement>,
) {
  const factory: RouteFactory = async (pattern, handler) => {
    if (typeof pattern === 'string') {
      pattern = new RoutePattern(pattern)
    }
    const match = pattern.match(request.url)
    if (match) {
      const matchRequest = Object.assign(request, match) as Request &
        RouteMatch<string>

      const result = await handler(matchRequest)

      if (result && typeof result === 'object') {
        if (result instanceof Response) {
          return result
        }
        if (request.method in result) {
          const apiRoute = (result as any)[request.method] as (
            request: Request,
          ) => Promiseable<Response>

          return apiRoute(matchRequest)
        }
        let root: Remix.RemixElement | undefined
        if ('default' in result) {
          const { fetch } = result.default as {
            fetch?: (request: Request) => Promiseable<Response>
          }
          if (fetch) {
            return fetch(matchRequest)
          }
          const {
            default: Root,
            $layoutComponent: Layout = DefaultLayout,
            $layoutProps: layoutProps,
          } = result as {
            default: Remix.Component
            $layoutComponent?: Remix.Component
            $layoutProps?: SerializableProps
          }
          root = (
            <Layout {...layoutProps} request={request}>
              <Root {...match} />
            </Layout>
          )
        } else if ('$rmx' in result) {
          root = <DefaultLayout request={matchRequest}>{result}</DefaultLayout>
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

  return new Proxy(factory, {
    get(_, prop) {
      if (prop in routes) {
        const route = routes[prop as never] as RoutePattern | RoutePatternMap
        if (route instanceof RoutePattern) {
          return (handler: RouteHandler) => factory(route, handler)
        }
        return createRouteFactory(route, request, resolveFrame)
      }
      return routes[prop as never]
    },
  }) as RouteFactory<RoutePatternMap<TRoutes>>
}

/**
 * Convenience function to declare a type-safe route function.
 */
export function route<TParams extends object>(
  routeFn: (
    request: Request & { params: TParams; url: URL },
  ) => Promiseable<Response | null>,
): typeof routeFn {
  return routeFn
}

export type LayoutComponent<P = {}> = Remix.Component<
  Remix.NoContext,
  P & DefaultLayoutProps
>

export type DefaultLayoutProps = {
  request: Request & { url: URL }
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

type RouteSourceMap = { [name: string]: string | RouteSourceMap }

type RoutePatternMap<TRoutes extends RouteSourceMap = RouteSourceMap> = {
  [K in keyof TRoutes]: TRoutes[K] extends string
    ? RoutePattern<TRoutes[K]>
    : RoutePatternMap<Extract<TRoutes[K], RouteSourceMap>>
}

type Prefix<TPath extends string, TRoutes extends RouteSourceMap> = {} & {
  [K in keyof TRoutes]: TRoutes[K] extends string
    ? `${TPath}${TRoutes[K]}`
    : Prefix<TPath, Extract<TRoutes[K], RouteSourceMap>>
}

/**
 * Declare a map of named route patterns.
 */
export function routes<const TRoutes extends RouteSourceMap>(
  routeMap: TRoutes,
): RoutePatternMap<TRoutes> {
  return mapValues(routeMap, (routeValue) => {
    if (isString(routeValue)) {
      return new RoutePattern(prefix + routeValue)
    }
    return routes(routeValue)
  }) as any
}

export function prefix<
  TPath extends string,
  const TRoutes extends RouteSourceMap,
>(path: TPath, map: TRoutes): Prefix<TPath, TRoutes> {
  return mapValues(map, (routeValue) => {
    if (isString(routeValue)) {
      return new RoutePattern(path + routeValue)
    }
    return prefix(path, routeValue)
  }) as any
}
