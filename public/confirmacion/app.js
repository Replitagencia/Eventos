const params = new URLSearchParams(location.search);
const token = params.get('token');
const $ = selector => document.querySelector(selector);
const labels = { pending:'Aún no has confirmado.', yes:'Tu respuesta: asistiré.', no:'Tu respuesta: no podré asistir.' };
const path = `/api/rsvp/${encodeURIComponent(token || '')}`;
async function request(options) {
  const response = await fetch(path,options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'No se pudo guardar tu respuesta.');
  return data;
}
(async()=> {
  try {
    const info = await request();
    $('#event-title').textContent = info.event_name;
    $('#details').textContent = `${new Date(info.date).toLocaleString('es-CL',{timeZone:'America/Santiago'})} · ${info.location}`;
    $('#greeting').textContent = `Hola, ${info.name}. ¿Nos acompañas?`;
    $('#current').textContent = labels[info.rsvp_status];
    $('#rsvp-form').hidden = false;
    $('[name=response]').value = ['yes','no'].includes(params.get('respuesta')) ? params.get('respuesta') : info.rsvp_status === 'no' ? 'no' : 'yes';
  } catch(error) { $('#error').textContent = error.message; }
})();
$('#rsvp-form').onsubmit = async event => {
  event.preventDefault(); const button=event.submitter; button.disabled=true; $('#error').textContent='';
  try {
    const result = await request({method:'POST',headers:{'Content-Type':'application/json','X-Requested-With':'eventos'},body:JSON.stringify({response:$('[name=response]').value})});
    $('#current').textContent = `Respuesta guardada. ${labels[result.response]}`;
  } catch(error) { $('#error').textContent=error.message; }
  finally { button.disabled=false; }
};
