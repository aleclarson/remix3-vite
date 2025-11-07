const responseType = Symbol('responseType')

class RemixFetch<T> {
  constructor(
    private readonly ctrl: AbortController,
    public readonly refresh: () => Promise<void>,
  ) {}

  isLoading = false
  isError = false
  isSuccess = false

  data: T | undefined
  error: Error | undefined;

  [responseType]: 'json' | 'text' | 'arrayBuffer' | 'blob' | null = null

  json<T>(): RemixFetch<T> {
    this[responseType] = 'json'
    return this as any
  }
  text(): RemixFetch<string> {
    this[responseType] = 'text'
    return this as any
  }
  arrayBuffer(): RemixFetch<ArrayBuffer> {
    this[responseType] = 'arrayBuffer'
    return this as any
  }
  blob(): RemixFetch<Blob> {
    this[responseType] = 'blob'
    return this as any
  }

  [Symbol.dispose]() {
    this.ctrl.abort()
  }
}

type TaggedRemixFetch<T> = RemixFetch<T> &
  (
    | { isLoading: true }
    | { isError: true; error: Error }
    | { isSuccess: true; data: T }
  )
