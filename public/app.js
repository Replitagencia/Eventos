const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const state = { user: null, events: [], eventId: null, guests: [], view: 'dashboard', live: null, generation: 0 };
const time = value => new Date(value).toLocaleTimeString('es-CL', { timeZone: 'America/Santiago', hour: '2-digit', minute: '2-digit', second: '2-digit' });
const stamp = value => value ? new Date(value).toLocaleString('es-CL', { timeZone: 'America/Santiago', dateStyle: 'short', timeStyle: 'medium' }) : 'Sin fecha histórica';
const categoryLabels = {general:'General',vip:'VIP',prensa:'Prensa',equipo:'Equipo',proveedores:'Proveedores'};
const rsvpLabels = {pending:'Sin respuesta',yes:'Asistirá',no:'No asistirá'};
const categoryOptions = value => Object.entries(categoryLabels).map(([key,label])=>`<option value="${key}" ${key === value ? 'selected' : ''}>${label}</option>`).join('');
const mailStatus = { queued: 'En cola', pending: 'Por enviar', sending: 'En proceso', sent: 'Enviada', failed: 'Por revisar' };
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
  $('#event-summary').innerHTML = [['Confirmados',guests.filter(g=>g.rsvp_status==='yes').length],['No asistirán',guests.filter(g=>g.rsvp_status==='no').length],['Sin respuesta',guests.filter(g=>g.rsvp_status==='pending').length],['Correos por revisar',guests.filter(g=>g.invitation_status==='failed').length]].map(([label,total])=>`<article><span>${label}</span><strong>${total}</strong></article>`).join('') + '<p>La confirmación y el ingreso se registran por separado. Los pendientes de llegada pasan a ser ausentes al finalizar el evento.</p>';
  if (state.view === 'mail') await loadMail();
  $('#send-test').disabled = $('#prepare-batch').disabled = !event || !state.user.mailEnabled;
  ['#add-guest','#import-button','#export','#export-mail','#manage-operators','#preview-design'].forEach(selector => $(selector).disabled = !event);
}
function renderArrivals() {
  const arrivals = state.guests.filter(g => g.checked_at).sort((a,b) => b.checked_at.localeCompare(a.checked_at)).slice(0,5);
  $('#arrivals').innerHTML = arrivals.length ? arrivals.map(g => `<div class="arrival"><div class="avatar">${esc(g.name.split(' ').map(s => s[0]).slice(0,2).join(''))}</div><div><strong>${esc(g.name)}</strong><small>${esc(g.company || 'Invitado')} · ${g.checkin_method === 'qr' ? 'Código QR' : 'Ingreso manual'}</small></div><time>${time(g.checked_at)}</time></div>`).join('') : '<div class="empty"><span>◷</span>Las primeras llegadas aparecerán aquí.<br>Todo está listo para dar la bienvenida.</div>';
}
function matches(guest, query) { return `${guest.name} ${guest.email} ${guest.rut} ${guest.company}`.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(query.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()); }
function renderGuests() {
  const query = $('#search').value.trim(); const filter = $('#status-filter').value; const mailFilter = $('#mail-filter').value;
  const guests = state.guests.filter(g => matches(g,query) && (filter === 'all' || (filter === 'checked' ? g.checked_at : !g.checked_at)) && (state.user.role !== 'admin' || mailFilter === 'all' || g.invitation_status === mailFilter) && ($('#category-filter').value === 'all' || g.category === $('#category-filter').value) && ($('#rsvp-filter').value === 'all' || g.rsvp_status === $('#rsvp-filter').value));
  const statuses = mailStatus;
  $('#mail-summary').innerHTML = [['queued','En cola'],['pending','Por enviar'],['sending','En proceso'],['sent','Enviadas'],['failed','Por revisar']].map(([key,label]) => `<article><span>${label}</span><strong>${state.guests.filter(g => g.invitation_status === key).length}</strong></article>`).join('') + '<p>Enviada significa aceptada por el proveedor de correo. No confirma entrega ni lectura.</p>';
  $('#guest-rows').innerHTML = guests.map(g => `<tr><td><strong>${esc(g.name)}</strong><small>${esc(g.email)}</small>${g.rut ? `<small>${esc(g.rut)}</small>` : ''}</td><td>${esc(g.company || '—')}<small>${esc(categoryLabels[g.category])}</small></td><td><span class="badge">${statuses[g.invitation_status]}</span>${g.sent_at ? `<small>${stamp(g.sent_at)}</small>` : ''}</td><td><small>${esc(rsvpLabels[g.rsvp_status])}</small><span class="badge ${g.checked_at ? 'checked' : ''}">${g.checked_at ? '✓ Acreditado' : 'Pendiente'}</span>${g.checked_at ? `<small>${time(g.checked_at)}</small>` : ''}</td><td>${state.user.role === 'admin' ? `<button class="table-action" data-detail="${g.id}">Ver ficha</button><button class="table-action" data-qr="${g.id}">Ver invitación</button><button class="table-action" data-edit="${g.id}">Editar</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="5"><div class="empty">No hay invitados que coincidan con la búsqueda.</div></td></tr>';
  $('#list-count').textContent = `${guests.length} de ${state.guests.length} invitados`;
}
function setView(view) {
  state.view = view; $('#workspace').dataset.view = view;
  for (const name of ['dashboard','guests','access','design','mail']) $(`#${name}-view`).hidden = view !== name;
  document.querySelectorAll('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.view === view));
  $('#page-title').textContent = { design:'Una invitación con tu identidad.', mail:'Cada invitación, bajo control.', dashboard: 'El encuentro, en tus manos.', guests: 'Cada invitado importa.', access: 'Un acceso separado para tu equipo.' }[view];
  if (view === 'design') loadDesign().catch(error=>toast(error.message));
  if (view === 'mail') loadMail().catch(error=>toast(error.message));
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
  modal(`<p class="eyebrow">LISTA DE INVITADOS</p><h2>${id ? 'Editar invitado' : 'Una nueva invitación.'}</h2><form id="modal-form">${[['name','Nombre completo','text',150],['email','Correo electrónico','email',254],['rut','RUT (opcional)','text',20],['company','Empresa (opcional)','text',150]].map(([key,label,type,max]) => `<label>${label}<input name="${key}" type="${type}" maxlength="${max}" value="${esc(guest[key] || '')}" ${['name','email'].includes(key) ? 'required' : ''}></label>`).join('')}<label>Categoría<select name="category">${categoryOptions(guest.category || 'general')}</select></label><label>Notas internas<textarea name="notes" maxlength="2000" rows="4">${esc(guest.notes || '')}</textarea></label><p id="modal-error" class="form-error" role="alert"></p><button class="primary">Guardar invitado</button></form>`);
  bindForm(async data => { await api(`${eventPath()}/guests${id ? `/${id}` : ''}`, { method: id ? 'PATCH' : 'POST', body: JSON.stringify(data) }); toast('Invitado guardado.'); });
}
async function showGuestDetail(id) {
  try {
    const { guest, deliveries } = await api(`${eventPath()}/guests/${id}/detail`);
    const fields = [['Correo', guest.email], ['RUT', guest.rut || 'No informado'], ['Empresa', guest.company || 'No informada'], ['Categoría', categoryLabels[guest.category]], ['Notas internas',guest.notes || 'Sin notas'], ['Confirmación',rsvpLabels[guest.rsvp_status]], ['Respuesta',guest.rsvp_at ? stamp(guest.rsvp_at) : 'Sin respuesta'], ['Registro', stamp(guest.created_at)], ['Invitación', mailStatus[guest.invitation_status]], ['Envío actual', guest.sent_at ? stamp(guest.sent_at) : 'Sin envío confirmado']];
    modal(`<p class="eyebrow">REGISTRO INTERNO DEL INVITADO</p><h2>${esc(guest.name)}</h2><dl class="guest-detail-fields">${fields.map(([label,value]) => `<dt>${label}</dt><dd>${esc(value)}</dd>`).join('')}</dl><img class="guest-pass" src="${eventPath()}/guests/${guest.id}/qr" width="220" height="220" alt="QR de ${esc(guest.name)}"><section class="checkin-detail"><h3>${guest.checked_at ? '✓ Ingreso registrado' : 'Pendiente de ingreso'}</h3><p>${guest.checked_at ? `${stamp(guest.checked_at)} · ${guest.checkin_method === 'qr' ? 'Escaneo QR' : 'Acreditación manual'}<br>Operador: ${esc(guest.operator || 'No disponible')}` : 'Esta persona todavía no ha sido acreditada.'}</p></section><div class="panel-heading"><h3>Historial de correos</h3><button class="text-button" data-detail="${guest.id}">Actualizar ficha</button></div><div class="mail-history">${deliveries.length ? deliveries.map(d => `<article><div class="mail-history-heading"><strong>${d.kind === 'test' ? 'Prueba · ' : ''}${esc(mailStatus[d.status])}</strong><time>${stamp(d.started_at)}</time></div><p>${esc(d.subject)}</p><dl><dt>Para</dt><dd>${esc(d.recipient_name)} · ${esc(d.recipient)}</dd><dt>Desde</dt><dd>${esc(d.sender)}</dd><dt>Solicitado por</dt><dd>${esc(d.initiated_by_email)}</dd>${d.finished_at ? `<dt>Finalizado</dt><dd>${stamp(d.finished_at)}</dd>` : ''}</dl>${d.failure_note ? `<p class="mail-history-note">${esc(d.failure_note)}</p>` : ''}${d.status === 'sending' ? '<p class="mail-history-note">En proceso. Si el envío se interrumpió, revisar el proveedor antes de repetirlo.</p>' : ''}</article>`).join('') : '<p class="empty">No hay intentos de envío registrados. La vista previa del correo no cuenta como un envío. Los envíos anteriores a esta actualización pueden no tener historial.</p>'}</div><p class="file-note">Fechas en hora de Santiago. “Enviada” indica aceptación del proveedor; no confirma entrega ni lectura.</p><div class="actions"><button class="primary" data-qr="${guest.id}">Ver invitación y QR</button><button class="secondary" data-edit="${guest.id}">Editar datos</button></div>`);
    $('#modal').classList.add('invitation-modal');
  } catch (error) { toast(error.message); }
}

async function showInvitation(id) {
  const guest = state.guests.find(g => g.id === id);
  const path = `${eventPath()}/guests/${id}`;
  const allowed = state.user.mailEnabled && ['pending','failed','sent'].includes(guest.invitation_status);
  try {
    const preview = await api(`${path}/invitation-preview`);
    modal(`<p class="eyebrow">VISTA PREVIA DEL CORREO</p><h2>Una invitación para ${esc(guest.name)}.</h2><dl class="email-summary"><dt>Para</dt><dd>${esc(preview.to)}</dd><dt>Asunto</dt><dd>${esc(preview.subject)}</dd><dt>Vista previa</dt><dd>${esc(preview.preheader)}</dd></dl><iframe id="invitation-preview" title="Correo de invitación" sandbox="" referrerpolicy="no-referrer"></iframe><div class="invitation-actions"><a class="secondary" href="${path}/qr" download="invitacion-qr.png">↓ Descargar QR</a><button id="send-invite" class="primary" ${allowed ? '' : 'disabled'}>${guest.invitation_status === 'sent' ? 'Reenviar invitación' : guest.invitation_status === 'sending' ? 'Enviando…' : 'Enviar invitación'}</button></div><p class="file-note">${state.user.mailEnabled ? 'El primer correo incluye el QR personal. El invitado solo debe mostrarlo al llegar.' : 'Envío de correo pendiente de configuración SMTP.'}</p><p id="modal-error" class="form-error" role="alert"></p>`);
    $('#modal').classList.add('invitation-modal');
    $('#invitation-preview').srcdoc = preview.html;
    $('#send-invite').onclick = () => {
      modal(`<h2>Enviar invitación</h2><p>Se enviará la invitación con el QR personal de <strong>${esc(guest.name)}</strong> a <strong>${esc(guest.email)}</strong>.</p><p class="muted">Recibirá su pase directamente en este correo y podrá confirmar si asistirá. La confirmación no es obligatoria para recibir el QR.</p><form id="modal-form"><p id="modal-error" class="form-error" role="alert"></p><button class="primary">Confirmar envío</button></form>`);
      bindForm(async () => { await api(`${path}/invite`, { method: 'POST', body: JSON.stringify({resend:guest.invitation_status === 'sent'}) }); toast('Invitación aceptada por el proveedor de correo.'); });
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
$('#search').oninput = renderGuests; $('#status-filter').onchange = renderGuests; $('#mail-filter').onchange = renderGuests; $('#category-filter').onchange = renderGuests; $('#rsvp-filter').onchange = renderGuests;
$('#event-select').onchange = event => { state.eventId = Number(event.target.value); if(state.view === 'design') loadDesign().catch(error=>toast(error.message)); refresh().catch(error => toast(error.message)); };
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
  modal('<p class="eyebrow">IMPORTACIÓN DE INVITADOS</p><h2>Tu lista, en un paso.</h2><p class="muted">Carga un archivo CSV o Excel (.xlsx). Los duplicados por correo o RUT se omiten.</p><p class="file-note">Columnas: <strong>nombre, email, rut, empresa, categoria, notas</strong>. Nombre y correo son obligatorios. Máximo 1.000 filas y 2 MB.<br><a href="/plantilla-invitados.csv" download>Descargar plantilla CSV</a></p><form id="modal-form"><label>Archivo de invitados<input id="import-file" type="file" accept=".csv,.xlsx" required></label><p id="modal-error" class="form-error" role="alert"></p><button class="primary">Importar invitados</button></form>');
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

let designImages = {logo:'',hero:''}, designEventId = null;
async function loadDesign() {
  const eventId = state.eventId;
  document.querySelectorAll('#design-form input,#design-form textarea,#design-form button').forEach(element=>element.disabled=!eventId);
  if (!eventId) return;
  const design = await api(`/api/events/${eventId}/design`);
  if (eventId !== state.eventId) return;
  designEventId = eventId;
  for (const key of ['subject','heading','message','closing','color','background']) $(`#design-form [name=${key}]`).value = design[key];
  designImages = {logo:design.logo,hero:design.hero};
  for (const key of ['logo','hero']) { $(`#design-${key}`).value=''; showDesignImage(key); }
  $('#design-error').textContent='';
}
function showDesignImage(key) {
  $(`#${key}-preview`).hidden=!designImages[key];
  if(designImages[key]) $(`#${key}-preview`).src=designImages[key]; else $(`#${key}-preview`).removeAttribute('src');
}
for (const key of ['logo','hero']) {
  $(`#design-${key}`).onchange = async event => {
    const file=event.target.files[0], eventId=state.eventId;
    if (!file) return;
    try {
      if(!['image/png','image/jpeg','image/webp'].includes(file.type) || file.size>350*1024) throw new Error('Usa PNG, JPG o WebP de hasta 350 KB.');
      const data=await new Promise((resolve,reject)=>{ const reader=new FileReader(); reader.onload=()=>resolve(reader.result); reader.onerror=reject; reader.readAsDataURL(file); });
      if(eventId!==state.eventId) return;
      designImages[key]=data; showDesignImage(key); $('#design-error').textContent='';
    } catch(error) { $('#design-error').textContent=error.message; event.target.value=''; }
  };
  $(`#remove-${key}`).onclick=()=>{ designImages[key]=''; $(`#design-${key}`).value=''; showDesignImage(key); };
}
function designBody() {
  if(designEventId!==state.eventId) throw new Error('Espera a que cargue el diseño del evento.');
  return JSON.stringify({...Object.fromEntries(new FormData($('#design-form'))),...designImages});
}
$('#design-form').onsubmit=async event=> {
  event.preventDefault(); const button=event.submitter; button.disabled=true;
  try { await api(`${eventPath()}/design`,{method:'PUT',body:designBody()}); toast('Diseño guardado para este evento.'); $('#design-error').textContent=''; }
  catch(error) { $('#design-error').textContent=error.message; }
  finally { button.disabled=false; }
};
$('#preview-design').onclick=async()=> {
  try {
    const preview=await api(`${eventPath()}/design-preview`,{method:'POST',body:designBody()});
    modal(`<h2>Vista previa del diseño</h2><p>${esc(preview.subject)}</p><iframe id="invitation-preview" title="Correo de invitación" sandbox="" referrerpolicy="no-referrer"></iframe><p class="file-note">Muestra con el primer invitado del evento. Cierra esta ventana y guarda el diseño para aplicarlo a los envíos.</p>`);
    $('#modal').classList.add('invitation-modal'); $('#invitation-preview').srcdoc=preview.html;
  } catch(error) { $('#design-error').textContent=error.message; }
};
let mailGeneration=0;
async function loadMail() {
  const eventId=state.eventId, generation=++mailGeneration;
  $('#mail-config').textContent=state.user.mailEnabled ? 'El envío está habilitado. Revisa una prueba antes del envío masivo.' : 'Envío pendiente de configurar el proveedor de correo. Puedes preparar el diseño y revisar su vista previa.';
  $('#send-test').disabled=$('#prepare-batch').disabled=!eventId || !state.user.mailEnabled;
  if(!eventId) { $('#batch-history').textContent='Crea un evento para comenzar.'; $('#event-mail-history').textContent=''; return; }
  const [batches,history]=await Promise.all([api(`/api/events/${eventId}/batches`),api(`/api/events/${eventId}/mail-history`)]);
  if(eventId!==state.eventId || generation!==mailGeneration) return;
  $('#batch-history').innerHTML=batches.map(batch=>`<div class="batch-row"><strong>Envío #${batch.id} · ${esc(categoryLabels[batch.category] || 'Todas las categorías')}</strong><span>${stamp(batch.created_at)} · ${batch.sent}/${batch.total} aceptados · ${batch.remaining} pendientes · ${batch.failed} por revisar</span></div>`).join('') || '<p class="empty">No hay envíos masivos registrados.</p>';
  $('#event-mail-history').innerHTML=history.map(d=>`<article><div class="mail-history-heading"><strong>${d.kind==='test' ? 'Prueba · ' : ''}${esc(mailStatus[d.status])}</strong><time>${stamp(d.started_at)}</time></div><p>${esc(d.recipient)} · ${esc(d.subject)}</p>${d.failure_note ? `<p>${esc(d.failure_note)}</p>` : ''}</article>`).join('') || '<p class="empty">No hay intentos de envío registrados.</p>';
}
$('#send-test').onclick=()=> {
  const path=eventPath();
  modal('<h2>Enviar correo de prueba</h2><p>Revisa el diseño guardado sin acreditar a nadie. El QR de esta prueba no permite ingresar y no incluye enlaces de confirmación.</p><form id="modal-form"><label>Correo de destino<input name="email" type="email" required maxlength="254"></label><p id="modal-error" class="form-error" role="alert"></p><button class="primary">Confirmar envío de prueba</button></form>');
  bindForm(async data=>{ await api(`${path}/test-email`,{method:'POST',body:JSON.stringify(data)}); toast('Prueba aceptada por el proveedor.'); });
};
$('#prepare-batch').onclick=async()=> {
  const path=eventPath(), category=$('#batch-category').value;
  try {
    const guests=(await api(`${path}/guests`)).filter(g=>g.invitation_status==='pending' && (category==='all' || g.category===category));
    if(!guests.length) { toast('No hay invitaciones por enviar en esta categoría.'); return; }
    modal(`<h2>Revisar envío masivo</h2><p>Enviarás <strong>${guests.length} invitaciones</strong> con QR a ${esc(categoryLabels[category] || 'todas las categorías')}, usando el diseño guardado del evento.</p><ul class="recipient-list">${guests.map(g=>`<li>${esc(g.name)} · ${esc(g.email)}</li>`).join('')}</ul><p class="file-note">Los envíos continuarán aunque cierres esta página. Los fallos no se reintentan automáticamente.</p><form id="modal-form"><p id="modal-error" class="form-error" role="alert"></p><button class="primary">Confirmar envío de ${guests.length} invitaciones</button></form>`);
    bindForm(async()=>{ await api(`${path}/batches`,{method:'POST',body:JSON.stringify({category,guestIds:guests.map(g=>g.id)})}); toast('Envío agregado a la cola. Revisa su avance en Correos.'); });
  } catch(error) { toast(error.message); }
};
