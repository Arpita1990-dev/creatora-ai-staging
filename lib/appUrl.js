import 'server-only';

const LOCAL_APP_URL = 'http://localhost:3000';

export function getAppUrl() {
  const configuredUrl = process.env.APP_URL;
  if (!configuredUrl) {
    if (process.env.NODE_ENV === 'production') throw new Error('APP_URL must be configured in production.');
    return LOCAL_APP_URL;
  }

  let url;
  try { url = new URL(configuredUrl); }
  catch { throw new Error('APP_URL must be an absolute HTTP(S) URL.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('APP_URL must be an absolute HTTP(S) URL.');
  }
  if (process.env.NODE_ENV === 'production' && (url.protocol !== 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) {
    throw new Error('APP_URL must be a public HTTPS application URL in production.');
  }
  return url.origin;
}