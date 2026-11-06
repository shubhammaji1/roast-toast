/** Canonical public API names. Legacy requests are rewritten without changing
 * their HTTP method, request body, cookies, or privacy checks. */
export const API_BASE_PATH='/api/v1';
const aliases:Record<string,string>={
  '/me':'/visitor-session',
  '/config':'/community-settings',
  '/admin/config':'/admin/community-settings',
  '/profile':'/profiles/me',
  '/account/export':'/my-data',
  '/account':'/my-data',
};
export function canonicalApiPath(path:string){
  if(path!=='/api'&&!path.startsWith('/api/'))return path;
  const versioned=path.startsWith(API_BASE_PATH+'/')||path===API_BASE_PATH?path:path.replace(/^\/api(?=\/|$)/,API_BASE_PATH);
  const suffix=versioned.slice(API_BASE_PATH.length);
  return API_BASE_PATH+(aliases[suffix]||suffix);
}
