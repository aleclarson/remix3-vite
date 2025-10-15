import { hydrated } from '@remix-run/dom'

import routes from '../../routes.ts'
import { PostCreator, postFeedContext } from './PostCreator.tsx'
import styles from './PostFeed.module.css'

type Post = {
  id: number
  content: string
  created_at: string
}

function FeedPage(this: Remix.Handle) {
  return (
    <main class={styles.page}>
      <h1 class={styles.heading}>Feed</h1>
      <PostFeed />
    </main>
  )
}

export default FeedPage

export const PostFeed = hydrated(
  '/src/features/feed/page.tsx#PostFeed',
  function PostFeed() {
    let posts: Post[] = []
    let loading = true
    let error = ''

    this.context.set({
      [postFeedContext]: {
        append: (post: Post) => {
          posts = [post, ...posts.filter((existing) => existing.id !== post.id)]
          this.update()
        },
      },
    })

    const loadPosts = async () => {
      console.log('Loading posts...')
      try {
        loading = true
        error = ''
        this.update()

        const response = await fetch(routes.api.posts.href(), {
          headers: {
            accept: 'application/json',
          },
        })

        if (!response.ok) {
          const message = await response.text()
          error = message || 'Unable to load posts.'
          loading = false
          this.update()
          return
        }

        posts = (await response.json()) as Post[]
        loading = false
        this.update()
      } catch (reason) {
        error = reason instanceof Error ? reason.message : String(reason)
        loading = false
        this.update()
      }
    }

    if (!import.meta.env.SSR) {
      this.queueTask(loadPosts)
    }

    return () => {
      console.log('[PostFeed] render', { posts, loading, error })
      return (
        <section class={styles.feed}>
          <PostCreator
            onPostCreated={() => {
              this.queueTask(loadPosts)
            }}
          />
          {loading ? <p class={styles.status}>Loading...</p> : null}
          {error ? <p class={styles.error}>{error}</p> : null}
          <ul class={styles.list}>
            {posts.map((post) => (
              <li key={post.id} class={styles.post}>
                <img
                  class={styles.avatar}
                  src={`https://api.dicebear.com/9.x/bottts-neutral/svg?seed=${post.id}`}
                  alt={`Avatar for post ${post.id}`}
                  width="56"
                  height="56"
                  loading="lazy"
                  decoding="async"
                />
                <div class={styles.postBody}>
                  <p class={styles.postContent}>{post.content}</p>
                  <time class={styles.timestamp} dateTime={post.created_at}>
                    {new Date(post.created_at).toLocaleString()}
                  </time>
                </div>
              </li>
            ))}
          </ul>
          {!loading && !error && posts.length === 0 ? (
            <p class={styles.empty}>No posts yet. Start the conversation.</p>
          ) : (
            ''
          )}
        </section>
      )
    }
  },
)
