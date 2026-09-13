// Use the same-origin API by default in deployed builds.
// A local override can be supplied from the browser query string for development.
const localApi = new URLSearchParams(location.search).get('api');
export const API_BASE_URL = localApi || (location.hostname === '127.0.0.1' || location.hostname === 'localhost'
  ? 'http://127.0.0.1:8000/api'
  : `${location.origin}/api`);
export const USE_LOCAL_API = false;
