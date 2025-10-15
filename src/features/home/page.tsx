import { Counter } from './Counter.tsx'

function HomePage(this: Remix.Handle) {
  return (
    <main>
      <h1>
        Hello <RemixLogo /> 3.
      </h1>
      <Counter />
      <span
        style={{
          textAlign: 'center',
          maxWidth: '48ch',
          marginTop: '1.5rem',
          lineHeight: 1.4,
          // color: 'turquoise',
        }}
      >
        Only the counter above is hydrated. You can edit any component and the
        page will update without a full reload.
      </span>
    </main>
  )
}

function RemixLogo() {
  return (
    <img
      src="/remix-dark.svg"
      alt="Remix"
      style="display: inline; height: 0.75em; margin: 0 0.3rem"
    />
  )
}

export default HomePage
