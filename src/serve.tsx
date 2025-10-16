import { createRouter, withLayout } from './core/router.tsx'
import { HeaderLayout } from './layouts/withHeader.tsx'
import routes from './routes.ts'

export default createRouter(routes, async function* (route, request) {
  if (request.headers.get('accept')?.includes('text/html')) {
    yield route.home(() =>
      withLayout(import('./features/home/page.tsx'), HeaderLayout),
    )
    yield route.feed(() =>
      withLayout(import('./features/feed/page.tsx'), HeaderLayout),
    )
  }
  const url = new URL(request.url)
  if (url.pathname.startsWith('/api/')) {
    yield route.api.posts(() => import('./api/posts.ts'))
    yield route.api.post(() => import('./api/post.ts'))
  }
  yield new Response(null, { status: 404 })
})
