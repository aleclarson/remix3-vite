import { RoutePattern } from '@remix-run/route-pattern'
import { queryCache } from '../../core/query.ts'

const userProfileRoute = new RoutePattern('/users/:id')

type UserProfile = {
  name?: string
  email?: number
  biography?: string
  avatar?: string
}

export function UserProfile(this: Remix.Handle) {
  const query = queryCache(this)

  return (props: { id: string; columns?: string[] }) => {
    const selectedColumns = props.columns?.join(',') ?? ''
    const { isLoading, isError, data, error } = query({
      queryKey: [userProfileRoute.source, props.id, selectedColumns],
      queryFn: (signal) =>
        // In a serious project, this would be type-safe.
        fetch(
          userProfileRoute.href({ id: props.id }, { columns: selectedColumns }),
          { signal },
        ).then((res) => res.json()) as Promise<UserProfile>,
    })

    if (isLoading) {
      data satisfies undefined
      error satisfies undefined

      return <div>Loading...</div>
    }

    if (isError) {
      return (
        <div>
          Error: {error instanceof Error ? error.message : String(error)}
        </div>
      )
    }

    data satisfies UserProfile
    error satisfies undefined

    return <div>User profile: {JSON.stringify(data)}</div>
  }
}
