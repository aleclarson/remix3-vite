import { db } from '../core/db.ts'
import { route } from '../core/router.tsx'

export const GET = route<{ id: string }>(async (request) => {
  const { id } = request.params
  const { rows } = await db.execute('select * from posts where id = ?', [id])
  return Response.json(rows[0])
})
