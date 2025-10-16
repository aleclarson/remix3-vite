import { JsonValue } from 'type-fest'

export function queryCache(component: Remix.Handle) {
  const queryCache = new Map<string, RemixQuery>()
  const cacheKeys = new Set<string>()

  let flushScheduled = false
  const trackQueryAccess = (cacheKey: string) => {
    cacheKeys.add(cacheKey)

    // Once the component update is complete, clear the cache of unused queries.
    if (!flushScheduled) {
      flushScheduled = true
      component.queueTask(() => {
        for (const query of queryCache.values()) {
          const cacheKey = query['cacheKey']
          if (!cacheKeys.has(cacheKey)) {
            query[Symbol.dispose]()
            queryCache.delete(cacheKey)
          }
        }
        cacheKeys.clear()
        flushScheduled = false
      })
    }
  }

  function query<T>({
    queryKey,
    queryFn,
  }: {
    queryKey: JsonValue[]
    queryFn: (signal: AbortSignal) => PromiseLike<T>
  }) {
    const cacheKey = JSON.stringify(queryKey)
    trackQueryAccess(cacheKey)

    const cachedQuery = queryCache.get(cacheKey)
    if (cachedQuery) {
      return cachedQuery as TaggedRemixQuery<T>
    }

    const ctrl = new AbortController()
    const query = new RemixQuery<T>(cacheKey, ctrl, async () => {
      if (query.isLoading) return
      query.isLoading = true
      try {
        const data = await queryFn(
          AbortSignal.any([component.signal, ctrl.signal]),
        )
        query.isSuccess = true
        query.data = data
      } catch (error) {
        if (!isAbortError(error)) {
          query.isError = true
          query.error = error
        }
      }
      query.isLoading = false
      component.update()
    })

    queryCache.set(cacheKey, query)
    return query as TaggedRemixQuery<T>
  }

  return query
}

export class RemixQuery<T = any> {
  constructor(
    protected readonly cacheKey: string,
    protected readonly ctrl: AbortController,
    public readonly refresh: () => Promise<void>,
  ) {}

  isLoading = false
  isError = false
  isSuccess = false

  data: T | undefined
  error: unknown;

  [Symbol.dispose]() {
    this.ctrl.abort()
  }
}

export type TaggedRemixQuery<T> = RemixQuery<T> &
  (LoadingQuery | ErrorQuery | SuccessQuery<T>)

type LoadingQuery = {
  isLoading: true
  isError: false
  isSuccess: false
  data: undefined
  error: undefined
}

type ErrorQuery = {
  isError: true
  isLoading: false
  isSuccess: false
  data: undefined
  error: unknown
}

type SuccessQuery<T> = {
  isSuccess: true
  isLoading: false
  isError: false
  data: T
  error: undefined
}

function isAbortError(error: unknown): error is Error & { name: 'AbortError' } {
  return error instanceof Error && error.name === 'AbortError'
}
