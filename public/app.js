const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const state = { user: null, events: [], eventId: null, guests: [], view: 'dashboard', live: null, generation: 0 };
const time = value => new Date(value).toLocaleTimeString('es-CL', { timeZone: 'America/Santiago', hour: '2-digit', minute: '2-digit', second: '2-digit' });
const stamp = value => value ? new Date(value).toLocaleString('es-CL', { timeZone: 'America/Santiago', dateStyle: 'short', timeStyle: 'medium' }) : 'Sin fecha histórica';
const mailStatus = { pending: 'Por enviar', sending: 'En proceso', sent: 'Enviada', failed: 'Por revisar' };
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
  state.live?.close(); state.user = null;
  $('#modal').close(); $('#workspace').hidden = true; $('#login-view').hidden = false;
}
async function enterWorkspace() {
  state.user = await api('/api/me');
  $('#login-view').hidden = true; $('#workspace').hidden = false;
  document.querySelectorAll('.admin-only').forEach(element => element.hidden = state.user.role !== 'admin');
  $('#account-role').textContent = state.user.role === 'admin' ? 'Administrador' : 'Operador';
  await refresh();
  setView('dashboard');
  $('#operator-url').value = `${location.origin}/acreditacion/`;
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
  renderGuests(); renderArrivals();
  ['#add-guest','#import-button','#export','#export-mail','#manage-operators'].forEach(selector => $(selector).disabled = !event);
}
function renderArrivals() {
  const arrivals = state.guests.filter(g => g.checked_at).sort((a,b) => b.checked_at.localeCompare(a.checked_at)).slice(0,5);
  $('#arrivals').innerHTML = arrivals.length ? arrivals.map(g => `<div class="arrival"><div class="avatar">${esc(g.name.split(' ').map(s => s[0]).slice(0,2).join(''))}</div><div><strong>${esc(g.name)}</strong><small>${esc(g.company || 'Invitado')} · ${g.checkin_method === 'qr' ? 'Código QR' : 'Ingreso manual'}</small></div><time>${time(g.checked_at)}</time></div>`).join('') : '<div class="empty"><span>◷</span>Las primeras llegadas aparecerán aquí.<br>Todo está listo para dar la bienvenida.</div>';
}
function matches(guest, query) { return `${guest.name} ${guest.email} ${guest.rut} ${guest.company}`.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(query.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()); }
function renderGuests() {
  const query = $('#search').value.trim(); const filter = $('#status-filter').value; const mailFilter = $('#mail-filter').value;
  const guests = state.guests.filter(g => matches(g,query) && (filter === 'all' || (filter === 'checked' ? g.checked_at : !g.checked_at)) && (state.user.role !== 'admin' || mailFilter === 'all' || g.invitation_status === mailFilter));
  const statuses = mailStatus;
  $('#mail-summary').innerHTML = [['pending','Por enviar'],['sending','En proceso'],['sent','Enviadas'],['failed','Por revisar']].map(([key,label]) => `<article><span>${label}</span><strong>${state.guests.filter(g => g.invitation_status === key).length}</strong></article>`).join('') + '<p>Enviada significa aceptada por el proveedor de correo. No confirma entrega ni lectura.</p>';
  $('#guest-rows').innerHTML = guests.map(g => `<tr><td><strong>${esc(g.name)}</strong><small>${esc(g.email)}</small>${g.rut ? `<small>${esc(g.rut)}</small>` : ''}</td><td>${esc(g.company || '—')}</td><td><span class="badge">${statuses[g.invitation_status]}</span>${g.sent_at ? `<small>${stamp(g.sent_at)}</small>` : ''}</td><td><span class="badge ${g.checked_at ? 'checked' : ''}">${g.checked_at ? '✓ Acreditado' : 'Pendiente'}</span>${g.checked_at ? `<small>${time(g.checked_at)}</small>` : ''}</td><td>${state.user.role === 'admin' ? `<button class="table-action" data-detail="${g.id}">Ver ficha</button><button class="table-action" data-qr="${g.id}">Ver invitación</button><button class="table-action" data-edit="${g.id}">Editar</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="5"><div class="empty">No hay invitados que coincidan con la búsqueda.</div></td></tr>';
  $('#list-count').textContent = `${guests.length} de ${state.guests.length} invitados`;
}
function setView(view) {
  state.view = view; $('#workspace').dataset.view = view;
  for (const name of ['dashboard','guests','access']) $(`#${name}-view`).hidden = view !== name;
  document.querySelectorAll('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.view === view));
  $('#page-title').textContent = { dashboard: 'El encuentro, en tus manos.', guests: 'Cada invitado importa.', access: 'Un acceso separado para tu equipo.' }[view];
}
function modal(html) { $('#modal').classList.remove('invitation-modal'); $('#modal-content').innerHTML = html; $('#modal').showModal(); }
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
async function showGuestDetail(id) {
  try {
    const { guest, deliveries } = await api(`${eventPath()}/guests/${id}/detail`);
    const fields = [['Correo', guest.email], ['RUT', guest.rut || 'No informado'], ['Empresa', guest.company || 'No informada'], ['Registro', stamp(guest.created_at)], ['Invitación', mailStatus[guest.invitation_status]], ['Envío actual', guest.sent_at ? stamp(guest.sent_at) : 'Sin envío confirmado']];
    modal(`<p class="eyebrow">REGISTRO INTERNO DEL INVITADO</p><h2>${esc(guest.name)}</h2><dl class="guest-detail-fields">${fields.map(([label,value]) => `<dt>${label}</dt><dd>${esc(value)}</dd>`).join('')}</dl><section class="checkin-detail"><h3>${guest.checked_at ? '✓ Ingreso registrado' : 'Pendiente de ingreso'}</h3><p>${guest.checked_at ? `${stamp(guest.checked_at)} · ${guest.checkin_method === 'qr' ? 'Escaneo QR' : 'Acreditación manual'}<br>Operador: ${esc(guest.operator || 'No disponible')}` : 'Esta persona todavía no ha sido acreditada.'}</p></section><div class="panel-heading"><h3>Historial de correos</h3><button class="text-button" data-detail="${guest.id}">Actualizar ficha</button></div><div class="mail-history">${deliveries.length ? deliveries.map(d => `<article><div class="mail-history-heading"><strong>${esc(mailStatus[d.status])}</strong><time>${stamp(d.started_at)}</time></div><p>${esc(d.subject)}</p><dl><dt>Para</dt><dd>${esc(d.recipient_name)} · ${esc(d.recipient)}</dd><dt>Desde</dt><dd>${esc(d.sender)}</dd><dt>Solicitado por</dt><dd>${esc(d.initiated_by_email)}</dd>${d.finished_at ? `<dt>Finalizado</dt><dd>${stamp(d.finished_at)}</dd>` : ''}</dl>${d.failure_note ? `<p class="mail-history-note">${esc(d.failure_note)}</p>` : ''}${d.status === 'sending' ? '<p class="mail-history-note">En proceso. Si el envío se interrumpió, revisar el proveedor antes de repetirlo.</p>' : ''}</article>`).join('') : '<p class="empty">No hay intentos de envío registrados. La vista previa del correo no cuenta como un envío. Los envíos anteriores a esta actualización pueden no tener historial.</p>'}</div><p class="file-note">Fechas en hora de Santiago. “Enviada” indica aceptación del proveedor; no confirma entrega ni lectura.</p><div class="actions"><button class="primary" data-qr="${guest.id}">Ver invitación y QR</button><button class="secondary" data-edit="${guest.id}">Editar datos</button></div>`);
    $('#modal').classList.add('invitation-modal');
  } catch (error) { toast(error.message); }
}

async function showInvitation(id) {
  const guest = state.guests.find(g => g.id === id);
  const path = `${eventPath()}/guests/${id}`;
  const allowed = state.user.mailEnabled && ['pending','failed'].includes(guest.invitation_status);
  try {
    const preview = await api(`${path}/invitation-preview`);
    modal(`<p class="eyebrow">VISTA PREVIA DEL CORREO</p><h2>Una invitación para ${esc(guest.name)}.</h2><dl class="email-summary"><dt>Para</dt><dd>${esc(preview.to)}</dd><dt>Asunto</dt><dd>${esc(preview.subject)}</dd><dt>Vista previa</dt><dd>${esc(preview.preheader)}</dd></dl><iframe id="invitation-preview" title="Correo de invitación" sandbox="" referrerpolicy="no-referrer"></iframe><div class="invitation-actions"><a class="secondary" href="${path}/qr" download="invitacion-qr.png">↓ Descargar QR</a><button id="send-invite" class="primary" ${allowed ? '' : 'disabled'}>${guest.invitation_status === 'sent' ? 'Invitación enviada' : guest.invitation_status === 'sending' ? 'Enviando…' : 'Enviar invitación'}</button></div><p class="file-note">${state.user.mailEnabled ? 'El primer correo incluye el QR personal. El invitado solo debe mostrarlo al llegar.' : 'Envío de correo pendiente de configuración SMTP.'}</p><p id="modal-error" class="form-error" role="alert"></p>`);
    $('#modal').classList.add('invitation-modal');
    $('#invitation-preview').srcdoc = preview.html;
    $('#send-invite').onclick = () => {
      modal(`<h2>Enviar invitación</h2><p>Se enviará la invitación con el QR personal de <strong>${esc(guest.name)}</strong> a <strong>${esc(guest.email)}</strong>.</p><p class="muted">La persona no necesita registrarse ni confirmar asistencia: recibirá su pase directamente en este correo.</p><form id="modal-form"><p id="modal-error" class="form-error" role="alert"></p><button class="primary">Confirmar envío</button></form>`);
      bindForm(async () => { await api(`${path}/invite`, { method: 'POST' }); toast('Invitación aceptada por el proveedor de correo.'); });
    };
  } catch (error) { toast(error.message); }
}
document.addEventListener('click', event => {
  const button = event.target.closest('button'); if (!button) return;
  if (button.dataset.view) setView(button.dataset.view);
  if (button.dataset.detail) showGuestDetail(Number(button.dataset.detail));
  if (button.dataset.qr) showInvitation(Number(button.dataset.qr));
  if (button.dataset.edit) guestModal(Number(button.dataset.edit));

});
$('#close-modal').onclick = () => $('#modal').close();
$('#search').oninput = renderGuests; $('#status-filter').onchange = renderGuests; $('#mail-filter').onchange = renderGuests;
$('#event-select').onchange = event => { state.eventId = Number(event.target.value); refresh().catch(error => toast(error.message)); };
$('#manage-operators').onclick = async () => {
  try {
    const operators = await api(`${eventPath()}/operators`);
    const path = eventPath();
    modal(`<p class="eyebrow">ACCESO SOLO A ESTE EVENTO</p><h2>Asignar operarios</h2><p class="muted">Estas cuentas podrán escanear y acreditar desde la aplicación móvil. No tendrán acceso a la planificación.</p><form id="modal-form"><div class="operator-list">${operators.map(operator => `<label><input type="checkbox" value="${operator.id}" ${operator.assigned ? 'checked' : ''}>${esc(operator.email)}</label>`).join('') || '<p class="muted">No hay cuentas de operario configuradas.</p>'}</div><p id="modal-error" class="form-error" role="alert"></p><button class="primary">Guardar accesos</button></form>`);
    bindForm(async () => { const userIds = [...document.querySelectorAll('.operator-list input:checked')].map(input => Number(input.value)); await api(`${path}/operators`, { method: 'PUT', body: JSON.stringify({ userIds }) }); toast('Accesos actualizados.'); });
  } catch (error) { toast(error.message); }
};
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
$('#export-mail').onclick = () => { window.location.href = `${eventPath()}/email-report.csv`; };
$('#logout').onclick = async () => { try { await api('/api/logout', { method: 'POST' }); showLogin(); } catch (error) { toast(error.message); } };
$('#logout-mobile').onclick = () => $('#logout').click();
$('#login-form').onsubmit = async event => {
  event.preventDefault(); const button = event.submitter; button.disabled = true; $('#login-error').textContent = '';
  try { await api('/api/login', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))) }); event.target.reset(); await enterWorkspace(); }
  catch (error) { $('#login-error').textContent = error.message; }
  finally { button.disabled = false; }
};
enterWorkspace().catch(showLogin);
