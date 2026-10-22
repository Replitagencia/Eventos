import QRCode from 'qrcode';
import { eventDesign } from './design.js';
const esc = value => String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').replace(/[&<>"']/g, char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[char]));
const rgb = color => [1,3,5].map(start=>parseInt(color.slice(start,start+2),16));
export function qrOptions(design, width=400) {
  let dark='#000000';
  if (design.qrTone === 'brand') {
    const channels=rgb(design.color), factor=Math.min(1,90/Math.max(...channels,1));
    dark='#'+channels.map(value=>Math.round(value*factor).toString(16).padStart(2,'0')).join('');
  }
  return {width,margin:4,errorCorrectionLevel:'M',color:{dark,light:'#ffffff'}};
}
function lines(value, length) {
  const words=String(value || '').replace(/\s+/g,' ').trim().match(new RegExp(`.{1,${length}}(?:\\s|$)|.{1,${length}}`,'gu')) || [''];
  return words.map(line=>line.trim());
}
function textLines(value,x,y,size,maxLength,color,weight=400) {
  const rows=lines(value,maxLength),height=Math.ceil(size*1.3);
  return {svg:`<text x="${x}" y="${y}" fill="${esc(color)}" font-size="${size}" font-weight="${weight}">${rows.map((line,i)=>`<tspan x="${x}" dy="${i ? height : 0}">${esc(line)}</tspan>`).join('')}</text>`,height:rows.length*height};
}
// Imagen autónoma sin recursos externos ni HTML: se puede convertir a PNG en el navegador.
export async function renderPass({event,guest,design=eventDesign(event),sample=false}) {
  const width=720,pad=60,body=[];
  const primary=design.color,ink='#172d29',muted='#65766e';
  const light=rgb(primary).reduce((sum,value,i)=>sum+value*[0.299,0.587,0.114][i],0)>150;
  const headerInk=design.passStyle==='minimal' ? ink : light ? ink : '#ffffff';
  let y=60;
  const hasImage=design.passStyle==='image' && design.hero;
  if(hasImage){body.push(`<image href="${esc(design.hero)}" x="24" y="24" width="672" height="224" preserveAspectRatio="xMidYMid slice" clip-path="url(#card)"/>`);y=284;}
  const headerStart=hasImage?248:24;
  if(design.logo){body.push(`<rect x="${pad}" y="${y}" width="176" height="76" rx="12" fill="#fff"/><image href="${esc(design.logo)}" x="${pad+12}" y="${y+10}" width="152" height="56" preserveAspectRatio="xMidYMid meet"/>`);y+=112;}
  body.push(`<text x="${pad}" y="${y+12}" fill="${headerInk}" font-size="14" font-weight="700" letter-spacing="2">${esc(design.passLabel)}</text>`);y+=54;
  const title=textLines(event.name,pad,y,34,29,headerInk,600);body.push(title.svg);y+=title.height+24;
  const headerHeight=y-headerStart;
  body.unshift(`<rect x="24" y="${headerStart}" width="672" height="${headerHeight}" fill="${design.passStyle==='minimal' ? '#ffffff' : esc(primary)}" clip-path="url(#card)"/>`);
  if(design.passStyle==='minimal') body.push(`<rect x="${pad}" y="${y-12}" width="64" height="5" rx="2" fill="${esc(primary)}"/>`);
  y+=48;
  const name=textLines(guest.name,pad,y,29,32,ink,600);body.push(name.svg);y+=name.height+10;
  const category={general:'INVITADO',vip:'VIP',prensa:'PRENSA',equipo:'EQUIPO',proveedores:'PROVEEDORES'}[guest.category] || 'INVITADO';
  body.push(`<text x="${pad}" y="${y}" fill="${muted}" font-size="14" letter-spacing="2">${category}</text>`);y+=30;
  const qr=await QRCode.toDataURL(sample ? 'PRUEBA-SIN-ACCESO' : `EVT:${event.id}:${guest.token}`,qrOptions(design,440));
  body.push(`<rect x="120" y="${y}" width="480" height="480" rx="20" fill="#fff" stroke="#e2e8e2"/><image href="${esc(qr)}" x="140" y="${y+20}" width="440" height="440"/>`);y+=514;
  body.push(`<path d="M60 ${y} H660" stroke="#d6dfd7" stroke-dasharray="5 7"/>`);y+=38;
  const date=new Date(event.date).toLocaleString('es-CL',{timeZone:'America/Santiago',dateStyle:'long',timeStyle:'short'});
  for(const value of [date+' · Santiago de Chile',event.location]){const row=textLines(value,pad,y,19,46,ink);body.push(row.svg);y+=row.height+12;}
  y+=12;
  const footer=textLines(design.passFooter,pad,y,18,48,muted);body.push(footer.svg);y+=footer.height+16;
  body.push(`<text x="${pad}" y="${y}" fill="${muted}" font-size="13">${sample ? 'MUESTRA · SIN ACCESO VÁLIDO' : 'PERSONAL · UN SOLO INGRESO'}</text>`);y+=54;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${y}" viewBox="0 0 ${width} ${y}" role="img" aria-label="Pase de ${esc(guest.name)}"><title>${esc(event.name)} · ${esc(guest.name)}</title><defs><clipPath id="card"><rect x="24" y="24" width="672" height="${y-48}" rx="24"/></clipPath></defs><rect width="720" height="${y}" fill="${esc(design.background)}"/><rect x="24" y="24" width="672" height="${y-48}" rx="24" fill="#fff"/><g font-family="Arial,Helvetica,sans-serif">${body.join('')}</g></svg>`;
}
