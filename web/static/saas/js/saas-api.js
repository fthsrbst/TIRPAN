/* saas-api.js — Pure data layer, no DOM */

const API = (() => {
  async function req(method, path, body) {
    const headers = { 'Content-Type': 'application/json' };
    const token = localStorage.getItem('tirpan-jwt');
    if (token) headers['Authorization'] = 'Bearer ' + token;

    const opts = { method, headers };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const r = await fetch('/api/v1' + path, opts);

    if (r.status === 401) {
      localStorage.removeItem('tirpan-jwt');
      localStorage.removeItem('tirpan-user');
      if (typeof showAuthScreen === 'function') showAuthScreen();
      throw new Error('Session expired. Please log in again.');
    }

    if (!r.ok) {
      const err = await r.json().catch(() => ({ detail: r.statusText }));
      throw new Error(err.detail || r.statusText);
    }
    return r.json().catch(() => null);
  }

  return {
    /* Auth */
    login:          (body)       => req('POST', '/auth/login', body),
    register:       (body)       => req('POST', '/auth/register', body),
    getMe:          ()           => req('GET',  '/auth/me'),
    getUsers:       ()           => req('GET',  '/auth/users'),
    updateUserRole: (id, role)   => req('PATCH', `/auth/users/${id}/role`, { role }),
    setUserActive:  (id, active) => req('PATCH', `/auth/users/${id}/active?is_active=${active}`),

    /* Sessions */
    getSessions:       ()       => req('GET',  '/sessions'),
    getSession:        (id)     => req('GET',  `/sessions/${id}`),
    startSession:      (body)   => req('POST', '/sessions', body),
    killSession:       (id)     => req('POST', `/sessions/${id}/kill`),
    pauseSession:      (id)     => req('POST', `/sessions/${id}/pause`),
    resumeSession:     (id)     => req('POST', `/sessions/${id}/resume`),
    deleteSession:     (id)     => req('DELETE',`/sessions/${id}`),
    renameSession:     (id, n)  => req('PATCH', `/sessions/${id}/name`, { name: n }),
    getSessionEvents:  (id)     => req('GET',  `/sessions/${id}/events`),
    getSessionReport:  (id)     => {
      const token = localStorage.getItem('tirpan-jwt');
      return fetch(`/api/v1/sessions/${id}/report/html`, {
        headers: token ? { 'Authorization': 'Bearer ' + token } : {}
      }).then(r => r.text());
    },
    getArtifacts:      (id)     => req('GET',  `/sessions/${id}/artifacts`),

    /* System */
    getSystemStats:    ()       => req('GET',  '/system/stats'),
    getScanProfiles:   ()       => req('GET',  '/scan-profiles'),

    /* Audit */
    getAuditLog: (params = {}) => {
      const qs = new URLSearchParams(params).toString();
      return req('GET', '/audit' + (qs ? '?' + qs : ''));
    },

    /* Config */
    getSettings:         ()       => req('GET',  '/settings'),
    setSetting:          (k, v)   => req('PUT',  `/settings/${k}`, { value: v }),
    getOllamaStatus:     (url)    => req('GET',  `/ollama/status?base_url=${encodeURIComponent(url)}`),
    getOpenRouterModels: ()       => req('GET',  '/openrouter/models'),

    /* Reports */
    downloadPdf: (id) => `/api/v1/sessions/${id}/report/pdf`,

    /* Approval */
    respondApproval: (id, approved) => req('POST', `/defense/approval/${id}/respond`, { approved }),

    /* WebSocket token injection */
    wsApprovalResponse: (ws, approvalId, approved) => {
      ws.send(JSON.stringify({ type: 'approval_response', approval_id: approvalId, approved }));
    },
  };
})();
