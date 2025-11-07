import { db } from '../core/db.ts'
import { route } from '../core/router.tsx'

export const GET = route<{ postId: string }>(async (request) => {
  const { postId } = request.params
  const { rows } = await db.execute('select * from posts where id = ?', [
    postId,
  ])
  return Response.json(rows[0])
})
