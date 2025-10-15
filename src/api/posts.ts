import { db } from '../core/db.ts'

export async function GET(request: Request) {
  const { rows } = await db.execute(
    'select * from posts order by created_at desc, id desc',
  )
  return Response.json(rows)
}

export async function POST(request: Request) {
  const { content } = await request.json()

  if (typeof content !== 'string' || content.trim().length === 0) {
    return new Response('content is required', { status: 400 })
  }

  await db.execute({
    sql: 'insert into posts (content) values (?)',
    args: [content.trim()],
  })

  const { rows } = await db.execute(
    'select * from posts where id = last_insert_rowid()',
  )

  if (rows.length === 0) {
    return new Response(null, { status: 500 })
  }

  return Response.json(rows[0], { status: 201 })
}


