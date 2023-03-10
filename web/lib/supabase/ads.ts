import { run, selectJson, selectFrom } from 'common/supabase/utils'
import { db } from './db'

export async function getAllAds() {
  const query = selectJson(db, 'posts')
    .eq('data->>type', 'ad')
    .gt('data->>funds', 0)
    .order('data->>createTime', { ascending: false } as any)

  const { data } = await run(query)
  return data.map((r) => r.data)
}

export async function getWatchedAdIds(userId: string) {
  const query = selectFrom(db, 'txns', 'fromId')
    .eq('data->>category', 'AD_REDEEM')
    .eq('data->>toId', userId)
  const { data } = await run(query)
  return data.map(({ fromId }) => fromId)
}

export async function getSkippedAdIds(userId: string) {
  const query = selectJson(db, 'user_events')
    .eq('user_id', userId)
    .eq('data->>name', 'Skip ad')

  const { data } = await run(query)
  return data.map((r) => (r.data as any).adId)
}
