import { dom } from '@remix-run/events'

import routes from '../../routes.ts'
import styles from './PostCreator.module.css'

type Post = {
  id: number
  content: string
  created_at: string
}

type FeedContext = {
  append(post: Post): void
}

export const postFeedContext = Symbol.for('features.feed/PostFeed')

/**
 * Hydrated composer for creating a post via the posts API.
 */
export function PostCreator(this: Remix.Handle) {
  let content = ''
  let submitting = false
  let error = ''

  return (props: { onPostCreated: () => void }) => (
    <form
      class={styles.root}
      on={[
        dom.submit(async (event) => {
          event.preventDefault()

          if (submitting) {
            return
          }

          const trimmed = content.trim()

          if (trimmed.length === 0) {
            if (!error) {
              error = 'Say something before posting.'
              this.update()
            }
            return
          }

          submitting = true
          error = ''
          this.update()

          const response = await fetch(routes.api.posts.href(), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: trimmed }),
          })

          if (!response.ok) {
            error = await response.text()
            submitting = false
            this.update()
            return
          }

          const created: Post = await response.json()

          content = ''
          submitting = false

          const context = this.context.get(postFeedContext) as
            | FeedContext
            | undefined

          this.update(() => {
            context?.append(created)
            props.onPostCreated()
          })
        }),
      ]}
    >
      <textarea
        class={styles.field}
        placeholder="Share something..."
        value={content}
        rows={4}
        disabled={submitting}
        on={[
          dom.input((event) => {
            const nextValue = (event.currentTarget as HTMLTextAreaElement).value

            if (content !== nextValue || error) {
              content = nextValue

              if (error) {
                error = ''
              }

              this.update()
            }
          }),
        ]}
      />
      {error ? <p class={styles.error}>{error}</p> : null}
      <button class={styles.button} type="submit" disabled={submitting}>
        {submitting ? 'Posting…' : 'Post'}
      </button>
    </form>
  )
}
