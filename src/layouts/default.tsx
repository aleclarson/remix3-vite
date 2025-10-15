import { DefaultLayoutProps } from '../core/router.tsx'
import globalStylesheet from '../global.css?url'

export function DefaultLayout(props: DefaultLayoutProps) {
  return (
    <html>
      <head>
        <title>Remix 3</title>
        <script src="/@remix/main.ts" type="module" />
        <link rel="stylesheet" href={globalStylesheet} />
      </head>
      <body>{props.children}</body>
    </html>
  )
}
