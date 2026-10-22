import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PNG } from 'pngjs';
import jsQR from 'jsqr';
import { openDatabase, bootstrap, token } from '../src/db.js';
import { createApp } from '../src/app.js';
import { designDefaults } from '../src/design.js';
import { createMailer } from '../src/mailer.js';
async function fixture(t, sendMail) {
  const db=openDatabase(':memory:');
  const config={publicUrl:'http://localhost:3000',adminEmail:'admin@test.local',adminPassword:'admin-test-password-long',operatorEmail:'operator@test.local',operatorPassword:'operator-test-password-long',seedDemo:true,mailEnabled:true,smtp:{host:'unused.test'},mailFrom:'eventos@example.com'};
  bootstrap(db,config);
  const messages=[];
  const app=createApp(db,config,{sendMail:async message=>{ messages.push(message); return sendMail ? sendMail(message) : {accepted:[message.to],messageId:'test-message'}; }});
  const server=app.listen(0,'127.0.0.1'); await new Promise(resolve=>server.once('listening',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  let cookie='';
  async function request(path,method='GET',body,overrides={}) {
    const response=await fetch(base+path,{method,headers:{'X-Requested-With':'eventos','Content-Type':'application/json',Cookie:cookie,...overrides},body:body ? JSON.stringify(body):undefined});
    const data=response.headers.get('content-type')?.includes('json') ? await response.json() : await response.text();
    return {status:response.status,data,response};
  }
  const login=await request('/api/login','POST',{email:config.adminEmail,password:config.adminPassword});
  cookie=login.response.headers.get('set-cookie').split(';')[0];
  t.after(async()=>{app.locals.closeStreams();await app.locals.mailer.idle();await new Promise(resolve=>server.close(resolve));db.close();});
  return {db,app,config,request,messages};
}
async function until(condition) { for(let i=0;i<100;i++){if(condition()) return; await new Promise(resolve=>setTimeout(resolve,20));} assert.fail('No terminó la cola'); }

test('diseño aislado por evento, imágenes válidas, escape HTML y QR estable',async t=>{
 const {request,db,messages}=await fixture(t);
 const guest=db.prepare('SELECT * FROM guests WHERE id=1').get();
 const png=new PNG({width:2,height:2});png.data.fill(255);
 const design={...designDefaults,heading:'<script>alert(1)</script>',message:'Línea uno\nLínea dos',color:'#112233',logo:`data:image/png;base64,${PNG.sync.write(png).toString('base64')}`};
 assert.equal((await request('/api/events/1/design','PUT',design)).status,200);
 assert.equal((await request('/api/events/1/design','GET',null,{Cookie:''})).status,401);
 assert.equal((await request('/api/events/1/design','PUT',{...design,color:'red;display:none'})).status,400);
 assert.equal((await request('/api/events/1/design','PUT',{...design,hero:'data:image/svg+xml;base64,PHN2Zz4='})).status,400);
 assert.equal((await request('/api/events/1/design','PUT',{...design,logo:'data:image/png;base64,aW52YWxpZA=='})).status,400);
 const preview=(await request('/api/events/1/guests/1/invitation-preview')).data;
 assert.match(preview.html,/&lt;script&gt;/);assert.doesNotMatch(preview.html,/<script>/);assert.match(preview.html,/Línea uno<br>Línea dos/);
 assert.match(preview.html,/Asistiré/);assert.match(preview.html,/No podré asistir/);
 const created=await request('/api/events','POST',{name:'Segundo',date:'2026-10-22T20:00:00Z',location:'Santiago'});
 assert.equal((await request(`/api/events/${created.data.id}/design`)).data.heading,designDefaults.heading);
 await request('/api/events/1/guests/1/invite','POST');
 assert.match(messages[0].html,/cid:logo@eventos/);
 const qr=PNG.sync.read(messages[0].attachments.find(a=>a.cid==='invitacion-qr@eventos').content);
 assert.equal(jsQR(new Uint8ClampedArray(qr.data),qr.width,qr.height).data,`EVT:1:${guest.token}`);
});

test('RSVP requiere acción explícita, no filtra datos ni acredita; editar correo revoca enlace',async t=>{
 const {request,db}=await fixture(t); const guest=db.prepare('SELECT * FROM guests WHERE id=1').get();
 const path=`/api/rsvp/${guest.rsvp_token}`;
 const info=await request(path,'GET',null,{Cookie:''});assert.equal(info.status,200);
 assert.deepEqual(Object.keys(info.data).sort(),['name','rsvp_status','event_name','date','location'].sort());
 assert.equal(db.prepare('SELECT rsvp_status FROM guests WHERE id=1').get().rsvp_status,'pending');
 assert.equal((await request(path,'POST',{response:'yes'},{Origin:'https://otro.example'})).status,403);
 assert.equal((await request(path,'POST',{response:'maybe'})).status,400);
 assert.equal((await request(path,'POST',{response:'yes'},{Cookie:''})).status,200);
 assert.equal(db.prepare('SELECT checked_at FROM guests WHERE id=1').get().checked_at,null);
 assert.equal((await request(path,'POST',{response:'no'},{Cookie:''})).status,200);
 assert.equal((await request(`/api/rsvp/${guest.token}`)).status,404);
 await request('/api/events/1/guests/1','PATCH',{name:guest.name,email:'changed@example.com',category:'vip',notes:'Nota interna'});
 assert.equal((await request(path)).status,404);
 const edited=db.prepare('SELECT * FROM guests WHERE id=1').get();
 assert.equal(edited.token,guest.token);assert.equal(edited.rsvp_status,'pending');assert.equal(edited.category,'vip');assert.equal(edited.notes,'Nota interna');
 const report=(await request('/api/events/1/report.csv')).data;assert.match(report,/Categoría/);assert.match(report,/Nota interna/);
});

test('prueba no cambia invitación, RSVP ni ingreso; reenvío explícito conserva historial',async t=>{
 const {request,db,messages}=await fixture(t);
 const before={...db.prepare('SELECT * FROM guests WHERE id=1').get()};
 assert.equal((await request('/api/events/1/test-email','POST',{email:'revision@example.com'})).status,200);
 assert.deepEqual({...db.prepare('SELECT * FROM guests WHERE id=1').get()},before);
 assert.equal(messages[0].to,'revision@example.com');assert.match(messages[0].subject,/PRUEBA/);assert.doesNotMatch(messages[0].html,/confirmacion\/\?token=/);
 const png=PNG.sync.read(messages[0].attachments[0].content);assert.equal(jsQR(new Uint8ClampedArray(png.data),png.width,png.height).data,'PRUEBA-SIN-ACCESO');
 const path='/api/events/1/guests/1/invite';
 assert.equal((await request(path,'POST')).status,200);
 assert.equal((await request(path,'POST')).status,409);
 assert.equal((await request(path,'POST',{resend:true})).status,200);
 const history=(await request('/api/events/1/guests/1/detail')).data.deliveries;
 assert.deepEqual(history.map(d=>d.kind),['invitation','invitation','test']);
});

test('cola por categoría reserva invitados, rechaza duplicados y no repite fallos',async t=>{
 let release;const gate=new Promise(resolve=>release=resolve);
 const {request,db,messages}=await fixture(t,async message=>{await gate;if(message.to==='invitado2@example.com')throw Error('fallo simulado');return {accepted:[message.to]};});
 t.after(()=>release());
 db.prepare("UPDATE guests SET category='vip' WHERE id IN (1,2)").run();
 assert.equal((await request('/api/events/1/batches','POST',{category:'vip',guestIds:[1,3]})).status,409);
 const created=await request('/api/events/1/batches','POST',{category:'vip',guestIds:[1,2]});assert.equal(created.status,202);
 assert.equal((await request('/api/events/1/batches','POST',{category:'vip',guestIds:[1,2]})).status,409);
 assert.equal((await request('/api/events/1/guests/2','PATCH',{name:'Editado',email:'changed@example.com'})).status,409);
 assert.equal((await request('/api/events/1/design','PUT',designDefaults)).status,409);
 await until(()=>messages.length===1); release();
 await until(()=>db.prepare('SELECT status FROM email_batches WHERE id=?').get(created.data.id).status==='review');
 assert.equal(messages.length,2);
 const batch=(await request('/api/events/1/batches')).data[0];assert.equal(batch.sent,1);assert.equal(batch.failed,1);assert.equal(batch.remaining,0);
 assert.equal(db.prepare('SELECT invitation_status FROM guests WHERE id=3').get().invitation_status,'pending');
 assert.equal((await request('/api/events/1/batches','POST',{guestIds:[2]})).status,409);
});

test('reinicio reanuda solo cola pendiente y mantiene envíos inciertos para revisión',async t=>{
 const {db,app,config}=await fixture(t); app.locals.mailer.stop(); await app.locals.mailer.idle();
 db.exec(`INSERT INTO email_batches(id,event_id,initiated_by,created_at,category,status) VALUES(1,1,1,'2026-10-22T00:00:00Z','all','sending');
 INSERT INTO email_batch_items VALUES(1,1,'sending'),(1,2,'queued');
 UPDATE guests SET invitation_status='sending' WHERE id=1;
 UPDATE guests SET invitation_status='queued' WHERE id=2;`);
 const sent=[];const worker=createMailer(db,config,async message=>{sent.push(message.to);return {accepted:[message.to]};},()=>{});
 t.after(async()=>{worker.stop();await worker.idle();});
 await until(()=>db.prepare('SELECT status FROM email_batches WHERE id=1').get().status==='review');
 assert.deepEqual(sent,['invitado2@example.com']);assert.equal(db.prepare('SELECT invitation_status FROM guests WHERE id=1').get().invitation_status,'sending');
});

test('importación valida categorías de forma atómica y el operario no obtiene funciones administrativas',async t=>{
 const {request,db,config}=await fixture(t);
 const {parseImport}=await import('../src/import.js');
 const guests=await parseImport(Buffer.from('nombre,email,categoria,notas\nNueva,nueva@example.com,VIP,Nota privada'), 'invitados.csv');
 assert.equal(guests[0].category,'vip');assert.equal(guests[0].notes,'Nota privada');
 await assert.rejects(parseImport(Buffer.from('nombre,email,categoria\nUna,una@example.com,general\nOtra,otra@example.com,desconocida'),'invitados.csv'),/Fila 3.*Categoría/);
 assert.equal((await request('/api/events/1/guests','POST',{name:'Mal',email:'mal@example.com',category:'desconocida'})).status,400);
 const login=await request('/api/operator/login','POST',{email:config.operatorEmail,password:config.operatorPassword});
 const cookie=login.response.headers.get('set-cookie').split(';')[0];
 for(const path of ['design','mail-history','batches','guests/1/detail']) assert.equal((await request(`/api/events/1/${path}`,'GET',null,{Cookie:cookie})).status,401);
 for(const path of ['test-email','batches']) assert.equal((await request(`/api/events/1/${path}`,'POST',{}, {Cookie:cookie})).status,401);
 const result=await request('/api/operator/events/1/search?q=Sofía','GET',null,{Cookie:cookie});
 assert.equal(result.status,200);assert.equal(result.data[0].notes,undefined);assert.equal(result.data[0].rsvp_token,undefined);
 assert.equal(db.prepare('SELECT count(*) n FROM email_deliveries').get().n,0);
});
