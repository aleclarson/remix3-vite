import { DefaultLayoutProps } from '../core/router.tsx'
import { DefaultLayout } from './default.tsx'

export function HeaderLayout(props: DefaultLayoutProps) {
  const currentPathname = () =>
    import.meta.env.SSR
      ? new URL(props.request.url).pathname
      : location.pathname

  const Link = (props: { href: string; children: Remix.RemixNode }) => (
    <a href={props.href} data-active={props.href === currentPathname()}>
      {props.children}
    </a>
  )

  return () => (
    <DefaultLayout {...props}>
      <header>
        <div
          style={{
            display: 'flex',
            flex: 1,
            justifyContent: 'flex-end',
            gap: '1rem',
          }}
        >
          <Link href="/">Home</Link>
          <Link href="/feed">Feed</Link>
        </div>
      </header>
      {props.children}
    </DefaultLayout>
  )
}
