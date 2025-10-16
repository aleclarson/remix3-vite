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

type RouteFactory<TRoutes extends ParsedRouteMap = {}> = {
  <TPattern extends string>(
    path: RoutePattern<TPattern>,
    handler: RouteHandler<TPattern>,
  ): Promiseable<Response | null>

  <TPattern extends string>(
    pattern: TPattern,
    handler: RouteHandler<TPattern>,
  ): Promiseable<Response | null>
} & {
  [K in keyof TRoutes]: TRoutes[K] extends infer R
    ? R extends ParsedRouteMap
      ? RouteFactory<R>
      : R extends RoutePattern<infer TPattern>
        ? (handler: RouteHandler<TPattern>) => Promiseable<Response | null>
        : never
    : never
}

type RouteHandler<TPattern extends string = string> = (
  request: Request & RouteMatch<TPattern>,
) => Promiseable<RouteResult<TPattern>>

type RouteResult<TPattern extends string = string> =
  | Response
  | Remix.RemixElement
  | null
  | {
      default:
        | RootComponent<SerializableProps & RouteMatch<TPattern>>
        | {
            fetch: (
              request: Request & RouteMatch<TPattern>,
            ) => Promiseable<Response | null>
          }
    }
  | {
      [K in 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH']?: (
        request: Request & RouteMatch<TPattern>,
      ) => Promiseable<Response | null>
    }

export function createRouter<TRoutes extends ParsedRouteMap>(
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

function createRouteFactory<TRoutes extends ParsedRouteMap>(
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
        const route = routes[prop as never] as RoutePattern | ParsedRouteMap
        if (route instanceof RoutePattern) {
          return (handler: RouteHandler) => factory(route, handler)
        }
        return createRouteFactory(route, request, resolveFrame)
      }
      return routes[prop as never]
    },
  }) as RouteFactory<ParsedRouteMap<TRoutes>>
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

type RouteMap = { [name: string]: string | RouteMap }

type ParsedRouteMap<TRoutes extends RouteMap = RouteMap> = {
  [K in keyof TRoutes]: TRoutes[K] extends string
    ? RoutePattern<TRoutes[K]>
    : ParsedRouteMap<Extract<TRoutes[K], RouteMap>>
}

type PrependRoutePattern<TPath extends string, TRoutes extends RouteMap> = {
  [K in keyof TRoutes]: TRoutes[K] extends string
    ? `${TPath}${TRoutes[K]}`
    : PrependRoutePattern<TPath, Extract<TRoutes[K], RouteMap>>
}

/**
 * Declare a map of named route patterns.
 */
export function routes<const TRoutes extends RouteMap>(
  routeMap: TRoutes,
): ParsedRouteMap<TRoutes> {
  return mapValues(routeMap, (routeValue) => {
    if (isString(routeValue)) {
      return new RoutePattern(prefix + routeValue)
    }
    return routes(routeValue)
  }) as any
}

export function prefix<TPath extends string, const TRoutes extends RouteMap>(
  path: TPath,
  map: TRoutes,
): PrependRoutePattern<TPath, TRoutes> {
  return mapValues(map, (routeValue) => {
    if (isString(routeValue)) {
      return new RoutePattern(path + routeValue)
    }
    return prefix(path, routeValue)
  }) as any
}
