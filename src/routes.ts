import { routes } from './core/router.tsx'

export default routes({
  home: '/',
  feed: '/feed',
  api: {
    posts: '/api/posts',
  },
})
