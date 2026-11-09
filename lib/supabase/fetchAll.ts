// Supabase/PostgREST caps every response at 1,000 rows by default.
// Any admin view that needs the *full* table must page through it.
// Usage: const rows = await fetchAll((from, to) => supabase.from('x').select('...').order('id').range(from, to))

const PAGE_SIZE = 1000

type PageResult<T> = PromiseLike<{ data: T[] | null; error: unknown }>

export async function fetchAll<T>(
  buildQuery: (from: number, to: number) => PageResult<T>
): Promise<{ data: T[]; error: unknown }> {
  const all: T[] = []
  let from = 0

  while (true) {
    const { data, error } = await buildQuery(from, from + PAGE_SIZE - 1)
    if (error) return { data: all, error }
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }

  return { data: all, error: null }
}
