const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const state = { user: null, events: [], eventId: null, results: [], busy: false, scanner: null, cameraStarting: false, cameraActive: false, cameraStopping: null, cameraGeneration: 0, lastQr: null, lastQrSeenAt: 0, readyAt: 0, resultTimer: null, searchGeneration: 0, timer: null };
const RESULT_DELAY = 1400;
const SAME_QR_ABSENCE = 1800;
let debounce;
function notice(message) { $('#notice').textContent = message; $('#notice').hidden = !message; }
function connection(online) { $('#connection').textContent = online ? 'Conectado' : 'Sin conexión'; $('#connection').classList.toggle('offline', !online); }
async function api(path, options = {}) {
  let response;
  try {
    response = await fetch(`/api/operator${path}`, { ...options, headers: { 'X-Requested-With': 'eventos', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers }, signal: AbortSignal.timeout(15000) });
  } catch {
    connection(false);
    throw new Error('No se pudo confirmar la operación. Revisa la conexión y vuelve a intentar.');
  }
  const data = await response.json();
  connection(true);
  if (!response.ok) {
    if (response.status === 401 && state.user) showLogin();
    throw Object.assign(new Error(data.error), { status: response.status, data });
  }
  return data;
}
function showLogin() {
  state.user = null; state.eventId = null; state.searchGeneration++; clearInterval(state.timer);
  stopCamera(); $('#confirmation').close(); $('#access-view').hidden = true; $('#login-view').hidden = false; $('#logout').hidden = true;
  $('#manual-search').value = ''; state.results = []; $('#manual-results').textContent = '';
}
async function enter() {
  state.user = await api('/me');
  $('#login-view').hidden = true; $('#access-view').hidden = false; $('#logout').hidden = false;
  $('#operator-name').textContent = state.user.email;
  await loadEvents();
  clearInterval(state.timer);
  state.timer = setInterval(async () => {
    if (document.hidden || state.busy) return;
    try { await loadEvents(); if ($('#manual-search').value.trim().length >= 2) await search(); }
    catch (error) { notice(error.message); }
  }, 15000);
}
async function loadEvents() {
  const events = await api('/events');
  if (!state.user || state.busy) return;
  state.events = events;
  const current = state.eventId;
  if (!events.some(event => event.id === current)) state.eventId = events[0]?.id ?? null;
  if (current !== state.eventId) {
    await stopCamera(); state.searchGeneration++; state.results = [];
    $('#confirmation').close(); $('#manual-search').value = ''; $('#manual-results').textContent = ''; $('#checkin-result').hidden = true;
  }
  $('#event-select').innerHTML = events.map(event => `<option value="${event.id}">${esc(event.name)}</option>`).join('');
  $('#event-select').value = state.eventId;
  $('#event-picker').hidden = events.length < 2;
  const event = events.find(event => event.id === state.eventId);
  $('#event-name').textContent = event?.name || 'Sin evento asignado';
  $('#event-info').textContent = event ? `${new Date(event.date).toLocaleString('es-CL', { timeZone: 'America/Santiago', dateStyle: 'short', timeStyle: 'short' })} · ${event.location}` : '';
  $('#tools').hidden = !event; $('#no-events').hidden = Boolean(event);
}
async function search() {
  const generation = ++state.searchGeneration;
  const query = $('#manual-search').value.trim();
  state.results = [];
  if (!state.eventId || query.length < 2) { $('#manual-results').innerHTML = '<p class="empty">Escribe al menos 2 caracteres. Máximo 20 coincidencias.</p>'; return; }
  $('#manual-results').innerHTML = '<p class="empty">Buscando…</p>';
  try {
    const results = await api(`/events/${state.eventId}/search?q=${encodeURIComponent(query)}`);
    if (generation !== state.searchGeneration || !state.user) return;
    state.results = results;
    $('#manual-results').innerHTML = results.map(guest => `<article class="search-row"><strong>${esc(guest.name)}</strong><small>${esc(guest.company || '')}</small><small>${esc(guest.email_hint)} ${guest.rut_hint ? `· RUT ${esc(guest.rut_hint)}` : ''}</small>${guest.checked_at ? '<span class="checked">✓ Ya ingresó</span>' : `<button data-guest="${guest.id}" ${state.busy ? 'disabled' : ''}>Acreditar</button>`}</article>`).join('') || '<p class="empty">No encontramos coincidencias. Revisa los datos de búsqueda.</p>';
  } catch (error) { if (generation === state.searchGeneration) $('#manual-results').innerHTML = `<p class="error-text">${esc(error.message)}</p>`; }
}
function setBusy(value) {
  state.busy = value;
  document.querySelectorAll('#tools button,#event-select,#logout').forEach(button => button.disabled = value);
  // Siempre se puede apagar la cámara, incluso esperando al servidor.
  $('#stop-camera').disabled = false;
}
async function checkin(body, { fromCamera = false } = {}) {
  if (state.busy || !state.eventId) return;
  const eventId = state.eventId, user = state.user;
  setBusy(true); notice('');
  if (!fromCamera) await stopCamera();
  clearTimeout(state.resultTimer);
  $('#scan-status').textContent = 'Validando ingreso…';
  const result = $('#checkin-result'); result.hidden = false; result.className = 'pending'; result.innerHTML = '<strong>Validando…</strong><p>Espera la confirmación de ingreso.</p>';
  try {
    const data = await api(`/events/${eventId}/checkin`, { method: 'POST', body: JSON.stringify(body) });
    if (state.user !== user || state.eventId !== eventId) return;
    result.className = ''; result.innerHTML = `<strong>✓ ACREDITADO</strong><p>${esc(data.name)}</p><small>${new Date(data.checked_at).toLocaleTimeString('es-CL', { timeZone: 'America/Santiago' })} · Ingreso registrado</small>`;
    if ($('#manual-search').value.trim().length >= 2) await search();
  } catch (error) {
    if (state.user !== user || state.eventId !== eventId) return;
    result.className = 'error'; result.innerHTML = `<strong>${error.status === 409 ? 'YA INGRESÓ' : error.status === 400 ? 'QR INVÁLIDO' : 'INGRESO NO CONFIRMADO'}</strong><p>${esc(error.data?.name || error.message)}</p>${error.data?.checked_at ? `<small>Ingreso anterior: ${new Date(error.data.checked_at).toLocaleTimeString('es-CL', { timeZone: 'America/Santiago' })}</small>` : ''}`;
    if (error.status === 403) { state.searchGeneration++; state.results = []; $('#manual-results').textContent = ''; }
    // Un error de red o permisos exige resolver la incidencia antes de continuar.
    if (![400, 409].includes(error.status)) {
      await stopCamera();
      notice('Escaneo detenido. Revisa el resultado y la conexión antes de activar la cámara nuevamente.');
    }
  } finally {
    setBusy(false);
    if (fromCamera && state.cameraActive) {
      state.readyAt = performance.now() + RESULT_DELAY;
      $('#scan-status').textContent = 'Retira este QR. El siguiente se leerá automáticamente.';
      const generation = state.cameraGeneration;
      state.resultTimer = setTimeout(() => {
        if (generation !== state.cameraGeneration || !state.cameraActive) return;
        result.hidden = true;
        $('#scan-status').textContent = 'Escaneo automático activo. Presenta el siguiente QR.';
      }, RESULT_DELAY);
    } else if (!fromCamera && state.user) result.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}
async function stopCamera() {
  state.cameraGeneration++;
  state.cameraActive = false;
  clearTimeout(state.resultTimer);
  $('#scan-status').hidden = true;
  if (!state.cameraStopping && state.scanner?.isScanning) {
    state.cameraStopping = state.scanner.stop().catch(() => {}).finally(() => { state.cameraStopping = null; });
  }
  if (state.cameraStopping) await state.cameraStopping;
  $('#start-camera').hidden = false; $('#stop-camera').hidden = true; $('#camera-placeholder').hidden = false;
}
async function startCamera() {
  if (state.busy || state.cameraStarting || state.cameraStopping || state.cameraActive || !state.eventId) return;
  if (!window.isSecureContext) return notice('Necesitas abrir esta aplicación con HTTPS para usar la cámara del celular.');
  notice(''); state.cameraStarting = true; $('#start-camera').disabled = true;
  const generation = ++state.cameraGeneration;
  state.lastQr = null; state.lastQrSeenAt = 0; state.readyAt = 0;
  $('#checkin-result').hidden = true;
  try {
    state.scanner ||= new Html5Qrcode('reader');
    await state.scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 230, height: 230 } }, async qr => {
      if (!state.cameraActive || generation !== state.cameraGeneration) return;
      const now = performance.now();
      const sameQr = qr === state.lastQr;
      const repeated = sameQr && now - state.lastQrSeenAt < SAME_QR_ABSENCE;
      // Actualizar incluso durante la validación: un QR sostenido frente a la
      // cámara no debe convertirse en una nueva solicitud al terminar la espera.
      if (sameQr) state.lastQrSeenAt = now;
      if (repeated || state.busy || now < state.readyAt) return;
      state.lastQr = qr; state.lastQrSeenAt = now;
      await checkin({ qr }, { fromCamera: true });
    });
    if (generation !== state.cameraGeneration || !state.user || document.hidden) { await stopCamera(); return; }
    state.cameraActive = true;
    $('#camera-placeholder').hidden = true; $('#start-camera').hidden = true; $('#stop-camera').hidden = false;
    $('#scan-status').hidden = false; $('#scan-status').textContent = 'Escaneo automático activo. Presenta un QR.';
  } catch { notice('No se pudo abrir la cámara. Revisa el permiso o usa Buscar persona.'); }
  finally { state.cameraStarting = false; $('#start-camera').disabled = state.busy; }
}
async function changeTab(name) {
  if (state.busy) return;
  if (name === 'search') await stopCamera();
  for (const tab of ['scan','search']) { $(`#${tab}-panel`).hidden = tab !== name; $(`#${tab}-tab`).setAttribute('aria-selected', String(tab === name)); }
  if (name === 'search') $('#manual-search').focus();
}
$('#start-camera').onclick = startCamera; $('#stop-camera').onclick = stopCamera;
$('#scan-tab').onclick = () => changeTab('scan'); $('#search-tab').onclick = () => changeTab('search');
$('#manual-search').oninput = () => { state.searchGeneration++; state.results = []; $('#manual-results').textContent = ''; clearTimeout(debounce); debounce = setTimeout(search,250); };
$('#event-select').onchange = async event => { await stopCamera(); state.eventId = Number(event.target.value); state.searchGeneration++; state.results = []; $('#manual-search').value = ''; $('#manual-results').textContent = ''; $('#checkin-result').hidden = true; try { await loadEvents(); } catch (error) { notice(error.message); } };
$('#manual-results').onclick = event => {
  const button = event.target.closest('[data-guest]'); if (!button || state.busy) return;
  const guest = state.results.find(guest => guest.id === Number(button.dataset.guest)); if (!guest) return;
  $('#confirm-name').textContent = guest.name; $('#confirm-hint').textContent = `${guest.email_hint}${guest.rut_hint ? ` · ${guest.rut_hint}` : ''}`;
  $('#confirmation').showModal();
  const eventId = state.eventId;
  $('#confirm-checkin').onclick = async () => { $('#confirmation').close(); if (eventId === state.eventId) await checkin({ guestId: guest.id }); };
};
$('#cancel-checkin').onclick = () => $('#confirmation').close();
$('#qr-form').onsubmit = async event => { event.preventDefault(); await checkin({ qr: event.currentTarget.elements.qr.value.trim() }); };
$('#logout').onclick = async () => { try { await api('/logout', { method: 'POST' }); showLogin(); } catch (error) { notice(error.message); } };
$('#login-form').onsubmit = async event => {
  event.preventDefault(); const button = event.submitter; button.disabled = true; $('#login-error').textContent = ''; notice('');
  try { await api('/login', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))) }); event.target.reset(); await enter(); }
  catch (error) { $('#login-error').textContent = error.message; }
  finally { button.disabled = false; }
};
document.addEventListener('visibilitychange', () => { if (document.hidden) stopCamera(); });
window.addEventListener('offline', () => { connection(false); stopCamera(); notice('Sin conexión. No confirmes un ingreso hasta recibir la respuesta del servidor.'); });
window.addEventListener('online', () => { if (state.user) loadEvents().then(() => notice('')).catch(error => notice(error.message)); });
enter().catch(showLogin);
