import { createRouter, withLayout } from './core/router.tsx'
import { HeaderLayout } from './layouts/withHeader.tsx'
import routes from './routes.ts'

export default createRouter(async function* (route, request) {
  if (request.headers.get('accept')?.includes('text/html')) {
    yield route(routes.home, () =>
      withLayout(import('./features/home/page.tsx'), HeaderLayout),
    )
    yield route(routes.feed, () =>
      withLayout(import('./features/feed/page.tsx'), HeaderLayout),
    )
  }
  const url = new URL(request.url)
  if (url.pathname.startsWith('/api/')) {
    yield route(routes.api.posts, () => import('./api/posts.ts'))
  }
  yield new Response(null, { status: 404 })
})
