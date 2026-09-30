export const getApiBaseUrl = () => {
  if (typeof window !== 'undefined' && window.location && window.location.hostname) {
    return window.location.hostname === 'localhost'
      ? 'http://localhost:5000'
      : `http://${window.location.hostname}:5000`;
  }
  return 'http://localhost:5000';
};

export const API_BASE = getApiBaseUrl();
export const API_BASE_URL = API_BASE;
export default API_BASE;
