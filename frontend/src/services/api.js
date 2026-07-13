import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:4000/api'
});

export async function fetchDashboard() {
  const response = await api.get('/dashboard');
  return response.data;
}

export async function fetchPageData(pageKey, params) {
  const response = await api.get(`/${pageKey}`, { params });
  return response.data;
}

export async function fetchDsaOverview(params) {
  const response = await api.get('/all-dsa/overview', { params });
  return response.data;
}

export async function fetchBtJourneys(params) {
  const response = await api.get('/bt-journeys/overview', { params });
  return response.data;
}

export async function verifyDisbursementDocument(id, file) {
  const formData = new FormData();
  formData.append('document', file);

  const response = await api.post(`/disbursements/${id}/verify-document`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });

  return response.data;
}

export function getDisbursementDocumentUrl(id) {
  return `${api.defaults.baseURL}/disbursements/${id}/document`;
}

export async function createDisbursement(payload) {
  const response = await api.post('/disbursements', payload);
  return response.data;
}

export function getApiErrorMessage(error, fallback) {
  if (axios.isAxiosError(error)) {
    return error.response?.data?.message || error.message || fallback;
  }

  return error instanceof Error ? error.message : fallback;
}
