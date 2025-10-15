import { createClient } from '@libsql/client'

export const db = createClient({
  url: 'file:local.db',
})

await db.execute(`
  create table if not exists posts (
    id integer primary key autoincrement,
    content text not null,
    created_at datetime not null default current_timestamp
  );
`)
