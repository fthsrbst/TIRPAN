/* saas-ws.js — WebSocket manager */

class SaasWebSocket {
  constructor() {
    this._ws = null;
    this._handlers = {};
    this._reconnectTimer = null;
    this._reconnectDelay = 2000;
    this._subscribedSession = null;
    this._pingTimer = null;
    this.connected = false;
  }

  on(type, fn) {
    this._handlers[type] = fn;
    return this;
  }

  connect() {
    if (this._ws && this._ws.readyState <= 1) return;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    this._ws = new WebSocket(`${proto}://${location.host}/ws`);

    this._ws.onopen = () => {
      this.connected = true;
      clearTimeout(this._reconnectTimer);
      this._reconnectDelay = 2000;
      this._dispatch('_connected', {});
      this._startPing();
      if (this._subscribedSession) {
        this._send({ type: 'subscribe_session', session_id: this._subscribedSession });
      }
    };

    this._ws.onmessage = (e) => {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      this._dispatch(msg.type, msg);
    };

    this._ws.onclose = () => {
      this.connected = false;
      this._stopPing();
      this._dispatch('_disconnected', {});
      this._reconnectTimer = setTimeout(() => {
        this._reconnectDelay = Math.min(this._reconnectDelay * 1.5, 30000);
        this.connect();
      }, this._reconnectDelay);
    };

    this._ws.onerror = () => { this._ws.close(); };
  }

  subscribe(sessionId) {
    this._subscribedSession = sessionId;
    if (this.connected) {
      this._send({ type: 'subscribe_session', session_id: sessionId });
    }
  }

  unsubscribe() {
    this._subscribedSession = null;
  }

  sendChat(content, provider, model, conversationId) {
    this._send({ type: 'chat', content, provider, model, conversation_id: conversationId });
  }

  openTerminal(sessionId, rows, cols) {
    this._send({ type: 'terminal_open', session_id: sessionId, rows, cols, shell: 'bash' });
  }

  sendTerminalInput(terminalId, data) {
    this._send({ type: 'terminal_input', terminal_id: terminalId, data });
  }

  resizeTerminal(terminalId, rows, cols) {
    this._send({ type: 'terminal_resize', terminal_id: terminalId, rows, cols });
  }

  closeTerminal(terminalId) {
    this._send({ type: 'terminal_close', terminal_id: terminalId });
  }

  approvalResponse(approvalId, approved) {
    this._send({ type: 'approval_response', approval_id: approvalId, approved });
  }

  _send(obj) {
    if (this._ws && this._ws.readyState === 1) {
      this._ws.send(JSON.stringify(obj));
    }
  }

  _dispatch(type, msg) {
    if (this._handlers[type]) this._handlers[type](msg);
    if (this._handlers['*']) this._handlers['*'](msg);
  }

  _startPing() {
    this._pingTimer = setInterval(() => {
      this._send({ type: 'ping' });
    }, 25000);
  }

  _stopPing() {
    clearInterval(this._pingTimer);
  }
}

const saasWs = new SaasWebSocket();
