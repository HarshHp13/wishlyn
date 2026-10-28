export function siteUrl(path: string): string {
  return new URL(path, process.env.NEXT_PUBLIC_APP_URL || 'https://wishlyn.com').href;
}
export function escapeXml(value: string): string {
  return value.replace(/[<>&"']/g, character => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[character]!);
}
export function sitemapResponse(xml: string): Response {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>${xml}`, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'no-store' } });
}
