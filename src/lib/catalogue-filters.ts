export interface CatalogueFilters { search: string; category: string; sort: 'newest' | 'price-low' | 'price-high'; maxPrice?: number; page: number }
export type QueryValues = Record<string, string | string[] | undefined>;
export function parseCatalogueFilters(query: QueryValues): CatalogueFilters {
  const first = (key: string) => typeof query[key] === 'string' ? query[key] as string : '';
  const price = first('maxPrice');
  const page = Number(first('page'));
  const sort = first('sort');
  return {
    search: first('search').trim().slice(0, 160),
    category: /^[a-zA-Z0-9_-]{1,100}$/.test(first('category')) ? first('category') : '',
    sort: sort === 'price-low' || sort === 'price-high' ? sort : 'newest',
    maxPrice: price !== '' && Number.isFinite(Number(price)) && Number(price) >= 0 ? Math.min(10000000, Number(price)) : undefined,
    page: Number.isSafeInteger(page) && page > 0 ? Math.min(10000, page) : 1,
  };
}
export function catalogueUrl(filters: CatalogueFilters, patch: Partial<CatalogueFilters> = {}): string {
  const next = { ...filters, ...patch };
  const params = new URLSearchParams();
  if (next.search) params.set('search', next.search);
  if (next.category) params.set('category', next.category);
  if (next.sort !== 'newest') params.set('sort', next.sort);
  if (next.maxPrice !== undefined) params.set('maxPrice', String(next.maxPrice));
  if (next.page > 1) params.set('page', String(next.page));
  return `/${params.size ? `?${params}` : ''}#shop`;
}
