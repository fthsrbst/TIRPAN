/* saas-api.js — Pure data layer, no DOM */

const API = (() => {
  async function req(method, path, body) {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const r = await fetch('/api/v1' + path, opts);
    if (!r.ok) {
      const err = await r.json().catch(() => ({ detail: r.statusText }));
      throw new Error(err.detail || r.statusText);
    }
    return r.json().catch(() => null);
  }

  return {
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
    getSessionReport:  (id)     => fetch(`/api/v1/sessions/${id}/report/html`).then(r => r.text()),
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
    getSettings:       ()       => req('GET',  '/settings'),
    setSetting:        (k, v)   => req('PUT',  `/settings/${k}`, { value: v }),
    getOllamaStatus:   (url)    => req('GET',  `/ollama/status?base_url=${encodeURIComponent(url)}`),
    getOpenRouterModels: ()     => req('GET',  '/openrouter/models'),

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
