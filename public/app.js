const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const state = { user: null, events: [], eventId: null, guests: [], view: 'dashboard', live: null, scanner: null, scanning: false, checking: false, generation: 0 };
const time = value => new Date(value).toLocaleTimeString('es-CL', { timeZone: 'America/Santiago', hour: '2-digit', minute: '2-digit', second: '2-digit' });
const eventPath = () => `/api/events/${state.eventId}`;
let toastTimer;
function toast(message) { $('#toast').textContent = message; $('#toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').hidden = true, 6000); }
async function api(path, options = {}) {
  const headers = { 'X-Requested-With': 'eventos', ...options.headers };
  if (options.body && typeof options.body === 'string') headers['Content-Type'] = 'application/json';
  const response = await fetch(path, { ...options, headers });
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401 && state.user) showLogin();
    throw Object.assign(new Error(data.error || 'No se pudo completar la operación.'), { data, status: response.status });
  }
  return data;
}
function showLogin() {
  stopCamera(); state.live?.close(); state.user = null;
  $('#modal').close(); $('#workspace').hidden = true; $('#login-view').hidden = false;
}
async function enterWorkspace() {
  state.user = await api('/api/me');
  $('#login-view').hidden = true; $('#workspace').hidden = false;
  document.querySelectorAll('.admin-only').forEach(element => element.hidden = state.user.role !== 'admin');
  $('#account-role').textContent = state.user.role === 'admin' ? 'Administrador' : 'Operador';
  await refresh();
  setView(state.user.role === 'admin' ? 'dashboard' : 'scanner');
  state.live?.close(); state.live = new EventSource('/api/live');
  state.live.onopen = () => { $('#connection').textContent = 'Sincronizado en vivo'; $('#connection').classList.remove('offline'); };
  state.live.onerror = () => { $('#connection').textContent = 'Reconectando · revisa la conexión'; $('#connection').classList.add('offline'); };
  state.live.onmessage = () => refresh().catch(error => toast(error.message));
}
async function refresh() {
  const generation = ++state.generation;
  const events = await api('/api/events');
  if (generation !== state.generation) return;
  state.events = events;
  if (!events.some(event => event.id === state.eventId)) state.eventId = events[0]?.id ?? null;
  $('#event-select').innerHTML = events.map(event => `<option value="${event.id}">${esc(event.name)}</option>`).join('');
  $('#event-select').value = state.eventId;
  $('#event-select').hidden = events.length < 2;
  const event = events.find(event => event.id === state.eventId);
  $('#event-name').textContent = event?.name || 'Crea tu primer evento';
  $('#event-details').textContent = event ? `${new Date(event.date).toLocaleString('es-CL', { timeZone: 'America/Santiago', dateStyle: 'long', timeStyle: 'short' })} · ${event.location}` : 'Comienza agregando los detalles del encuentro.';
  $('#stat-total').textContent = event?.total || 0;
  $('#stat-checked').textContent = event?.checked || 0;
  $('#stat-pending').textContent = event ? event.total - event.checked : 0;
  const percent = event?.total ? Math.round(event.checked / event.total * 100) : 0;
  $('#stat-percent').innerHTML = `${percent}<em>%</em>`;
  $('#attendance-progress').style.width = `${percent}%`;
  const guests = event ? await api(`${eventPath()}/guests`) : [];
  if (generation !== state.generation) return;
  state.guests = guests;
  renderGuests(); renderArrivals(); renderManual();
  ['#add-guest','#import-button','#export','#start-camera'].forEach(selector => $(selector).disabled = !event);
}
function renderArrivals() {
  const arrivals = state.guests.filter(g => g.checked_at).sort((a,b) => b.checked_at.localeCompare(a.checked_at)).slice(0,5);
  $('#arrivals').innerHTML = arrivals.length ? arrivals.map(g => `<div class="arrival"><div class="avatar">${esc(g.name.split(' ').map(s => s[0]).slice(0,2).join(''))}</div><div><strong>${esc(g.name)}</strong><small>${esc(g.company || 'Invitado')} · ${g.checkin_method === 'qr' ? 'Código QR' : 'Ingreso manual'}</small></div><time>${time(g.checked_at)}</time></div>`).join('') : '<div class="empty"><span>◷</span>Las primeras llegadas aparecerán aquí.<br>Todo está listo para dar la bienvenida.</div>';
}
function matches(guest, query) { return `${guest.name} ${guest.email} ${guest.rut} ${guest.company}`.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(query.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()); }
function renderGuests() {
  const query = $('#search').value.trim(); const filter = $('#status-filter').value;
  const guests = state.guests.filter(g => matches(g,query) && (filter === 'all' || (filter === 'checked' ? g.checked_at : !g.checked_at)));
  const statuses = { pending: 'Pendiente', sending: 'Enviando', sent: 'Enviada', failed: 'Fallida' };
  $('#guest-rows').innerHTML = guests.map(g => `<tr><td><strong>${esc(g.name)}</strong><small>${esc(g.email)}</small>${g.rut ? `<small>${esc(g.rut)}</small>` : ''}</td><td>${esc(g.company || '—')}</td><td><span class="badge">${statuses[g.invitation_status]}</span></td><td><span class="badge ${g.checked_at ? 'checked' : ''}">${g.checked_at ? '✓ Acreditado' : 'Pendiente'}</span>${g.checked_at ? `<small>${time(g.checked_at)}</small>` : ''}</td><td>${state.user.role === 'admin' ? `<button class="table-action" data-qr="${g.id}">Ver QR</button><button class="table-action" data-edit="${g.id}">Editar</button>` : ''}${!g.checked_at ? `<button class="table-action" data-manual="${g.id}">Acreditar</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="5"><div class="empty">No hay invitados que coincidan con la búsqueda.</div></td></tr>';
  $('#list-count').textContent = `${guests.length} de ${state.guests.length} invitados`;
}
function renderManual() {
  const query = $('#manual-search').value.trim();
  const guests = query.length >= 2 ? state.guests.filter(g => matches(g, query)).slice(0,20) : [];
  $('#manual-results').innerHTML = guests.map(g => `<div class="manual-row"><div><strong>${esc(g.name)}</strong><small>${esc(g.email)}</small></div>${g.checked_at ? '<span class="badge checked">Ya ingresó</span>' : `<button class="table-action" data-manual="${g.id}">Acreditar</button>`}</div>`).join('') || `<p class="empty">${query.length < 2 ? 'Escribe al menos 2 caracteres para buscar.' : 'No encontramos invitados.'}</p>`;
}
function setView(view) {
  if (view !== 'scanner') stopCamera();
  state.view = view; $('#workspace').dataset.view = view;
  for (const name of ['dashboard','guests','scanner']) $(`#${name}-view`).hidden = view !== name;
  document.querySelectorAll('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.view === view));
  $('#page-title').textContent = { dashboard: 'El encuentro, en tus manos.', guests: 'Cada invitado importa.', scanner: 'Una gran bienvenida.' }[view];
}
function modal(html) { $('#modal-content').innerHTML = html; $('#modal').showModal(); }
function bindForm(handler) {
  $('#modal-form').onsubmit = async event => {
    event.preventDefault(); const button = event.submitter; button.disabled = true;
    try { await handler(Object.fromEntries(new FormData(event.currentTarget))); $('#modal').close(); await refresh(); }
    catch (error) { $('#modal-error').textContent = error.message; }
    finally { button.disabled = false; }
  };
}
function guestModal(id) {
  const guest = state.guests.find(g => g.id === id) || {};
  modal(`<p class="eyebrow">LISTA DE INVITADOS</p><h2>${id ? 'Editar invitado' : 'Una nueva invitación.'}</h2><form id="modal-form">${[['name','Nombre completo','text',150],['email','Correo electrónico','email',254],['rut','RUT (opcional)','text',20],['company','Empresa (opcional)','text',150]].map(([key,label,type,max]) => `<label>${label}<input name="${key}" type="${type}" maxlength="${max}" value="${esc(guest[key] || '')}" ${['name','email'].includes(key) ? 'required' : ''}></label>`).join('')}<p id="modal-error" class="form-error" role="alert"></p><button class="primary">Guardar invitado</button></form>`);
  bindForm(async data => { await api(`${eventPath()}/guests${id ? `/${id}` : ''}`, { method: id ? 'PATCH' : 'POST', body: JSON.stringify(data) }); toast('Invitado guardado.'); });
}
function showQR(id) {
  const guest = state.guests.find(g => g.id === id); const event = state.events.find(e => e.id === state.eventId);
  const url = `${eventPath()}/guests/${id}/qr`;
  modal(`<div class="modal-qr"><p class="eyebrow">TU INVITACIÓN PERSONAL</p><h2>${esc(guest.name)}</h2><p class="muted">${esc(event.name)}</p><img src="${url}" alt="QR de ingreso de ${esc(guest.name)}"><p class="muted">Presenta este código al llegar.<br>Válido para un único ingreso.</p><div class="actions"><a class="secondary" href="${url}" download="invitacion-qr.png">↓ Descargar QR</a>${state.user.mailEnabled && ['pending','failed'].includes(guest.invitation_status) ? `<button id="send-invite" class="primary">Enviar invitación</button>` : ''}</div><p class="file-note">${state.user.mailEnabled ? guest.invitation_status === 'sent' ? 'Invitación enviada al proveedor de correo.' : 'El correo incluye este QR como adjunto.' : 'Envío de correo pendiente de configuración SMTP.'}</p><p id="modal-error" class="form-error" role="alert"></p></div>`);
  if ($('#send-invite')) $('#send-invite').onclick = () => {
    modal(`<h2>Enviar invitación</h2><p>Se enviará el QR de <strong>${esc(guest.name)}</strong> a <strong>${esc(guest.email)}</strong>.</p><form id="modal-form"><p id="modal-error" class="form-error" role="alert"></p><button class="primary">Confirmar envío</button></form>`);
    bindForm(async () => { await api(`${eventPath()}/guests/${id}/invite`, { method: 'POST' }); toast('Invitación aceptada por el proveedor de correo.'); });
  };
}
async function checkin(body) {
  if (state.checking) return;
  state.checking = true;
  const result = $('#checkin-result');
  try {
    const data = await api(`${eventPath()}/checkin`, { method: 'POST', body: JSON.stringify(body) });
    result.className = ''; result.innerHTML = `<strong>✓ ACREDITADO</strong>${esc(data.name)} · ${time(data.checked_at)}`;
    await refresh();
  } catch (error) {
    result.className = 'error'; result.innerHTML = `<strong>${esc(error.message)}</strong>${esc(error.data?.name || '')}${error.data?.checked_at ? ` · ${time(error.data.checked_at)}` : ''}`;
    toast(error.message);
  } finally { result.hidden = false; state.checking = false; if (state.view === 'scanner') result.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
}
async function stopCamera() {
  if (state.scanner?.isScanning) { try { await state.scanner.stop(); } catch {} }
  state.scanning = false;
  $('#start-camera').hidden = false; $('#stop-camera').hidden = true;
}
$('#start-camera').onclick = async () => {
  if (!window.isSecureContext) return toast('Abre la aplicación con HTTPS para usar la cámara del celular.');
  if (!state.eventId) return toast('Selecciona un evento.');
  $('#start-camera').disabled = true;
  try {
    state.scanner ||= new Html5Qrcode('reader');
    await state.scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 230, height: 230 } }, async decoded => {
      if (state.scanning && !state.checking) { state.scanning = false; await stopCamera(); await checkin({ qr: decoded }); }
    });
    state.scanning = true; $('#start-camera').hidden = true; $('#stop-camera').hidden = false;
  } catch { toast('No se pudo abrir la cámara. Revisa el permiso del navegador o usa búsqueda manual.'); }
  finally { $('#start-camera').disabled = false; }
};
$('#stop-camera').onclick = stopCamera;
$('#qr-form').onsubmit = async event => { event.preventDefault(); const button = event.submitter; button.disabled = true; await checkin({ qr: event.currentTarget.elements.qr.value.trim() }); button.disabled = false; };
document.addEventListener('click', event => {
  const button = event.target.closest('button'); if (!button) return;
  if (button.dataset.view) setView(button.dataset.view);
  if (button.dataset.qr) showQR(Number(button.dataset.qr));
  if (button.dataset.edit) guestModal(Number(button.dataset.edit));
  if (button.dataset.manual) {
    const guest = state.guests.find(g => g.id === Number(button.dataset.manual));
    modal(`<h2>Confirmar ingreso</h2><p>Vas a acreditar a <strong>${esc(guest.name)}</strong>.</p><p class="muted">${esc(guest.email)}</p><button id="confirm-checkin" class="primary">Confirmar acreditación</button>`);
    $('#confirm-checkin').onclick = async () => { $('#modal').close(); setView('scanner'); await checkin({ guestId: guest.id }); };
  }
});
$('#close-modal').onclick = () => $('#modal').close();
$('#search').oninput = renderGuests; $('#status-filter').onchange = renderGuests; $('#manual-search').oninput = renderManual;
$('#event-select').onchange = async event => { await stopCamera(); state.eventId = Number(event.target.value); $('#checkin-result').hidden = true; refresh().catch(error => toast(error.message)); };
$('#add-guest').onclick = () => guestModal();
$('#new-event').onclick = () => {
  modal('<p class="eyebrow">UN NUEVO ENCUENTRO</p><h2>Crea tu evento.</h2><form id="modal-form"><label>Nombre del evento<input name="name" maxlength="150" required placeholder="Encuentro de…"></label><label>Fecha y hora (hora de este dispositivo)<input name="date" type="datetime-local" required></label><label>Lugar<input name="location" maxlength="200" required placeholder="Espacio, ciudad"></label><p id="modal-error" class="form-error" role="alert"></p><button class="primary">Crear evento</button></form>');
  bindForm(async data => { const result = await api('/api/events', { method: 'POST', body: JSON.stringify({ ...data, date: new Date(data.date).toISOString() }) }); state.eventId = result.id; toast('Evento creado.'); });
};
$('#import-button').onclick = () => {
  modal('<p class="eyebrow">IMPORTACIÓN DE INVITADOS</p><h2>Tu lista, en un paso.</h2><p class="muted">Carga un archivo CSV o Excel (.xlsx). Los duplicados por correo o RUT se omiten.</p><p class="file-note">Columnas: <strong>nombre, email, rut, empresa</strong>. Nombre y correo son obligatorios. Máximo 1.000 filas y 2 MB.<br><a href="/plantilla-invitados.csv" download>Descargar plantilla CSV</a></p><form id="modal-form"><label>Archivo de invitados<input id="import-file" type="file" accept=".csv,.xlsx" required></label><p id="modal-error" class="form-error" role="alert"></p><button class="primary">Importar invitados</button></form>');
  bindForm(async () => { const file = $('#import-file').files[0]; if (file.size > 2 * 1024 * 1024) throw new Error('El archivo supera 2 MB.'); const result = await api(`${eventPath()}/import`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'X-Filename': file.name.toLowerCase().endsWith('.xlsx') ? 'invitados.xlsx' : 'invitados.csv' }, body: file }); toast(`${result.imported} invitados importados · ${result.duplicates} duplicados omitidos.`); });
};
$('#export').onclick = () => { window.location.href = `${eventPath()}/report.csv`; };
$('#logout').onclick = async () => { try { await api('/api/logout', { method: 'POST' }); showLogin(); } catch (error) { toast(error.message); } };
$('#logout-mobile').onclick = () => $('#logout').click();
$('#login-form').onsubmit = async event => {
  event.preventDefault(); const button = event.submitter; button.disabled = true; $('#login-error').textContent = '';
  try { await api('/api/login', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))) }); event.target.reset(); await enterWorkspace(); }
  catch (error) { $('#login-error').textContent = error.message; }
  finally { button.disabled = false; }
};
enterWorkspace().catch(showLogin);
