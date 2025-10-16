import { prefix, routes } from './core/router.tsx'

export default routes({
  home: '/',
  feed: '/feed',
  api: prefix('/api', {
    posts: '/posts',
    post: '/posts/:id',
  }),
})
