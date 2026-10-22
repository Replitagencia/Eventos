import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';
import { designDefaults } from '../src/design.js';
const decode=buffer=>{const png=PNG.sync.read(buffer);return jsQR(new Uint8ClampedArray(png.data),png.width,png.height)?.data;};
test('pases de marca: PNG descargable y escaneable en los tres estilos',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('/');
 await page.getByLabel('Correo electrónico',{exact:true}).fill('admin@test.local');
 await page.getByLabel('Contraseña',{exact:true}).fill('admin-ui-test-password');
 await page.getByRole('button',{name:'Ingresar al espacio'}).click();
 await expect(page.locator('#workspace')).toBeVisible();
 const headers={'X-Requested-With':'eventos'};
 const event=await(await page.request.post('/api/events',{headers,data:{name:'Encuentro de marca 2026',date:'2026-10-22T21:00:00Z',location:'Santiago · Salón principal'}})).json();
 const guest=await(await page.request.post(`/api/events/${event.id}/guests`,{headers,data:{name:'Valentina Ejemplo',email:'pase@example.com',category:'vip'}})).json();
 const qr=decode(await(await page.request.get(`/api/events/${event.id}/guests/${guest.id}/qr`)).body());
 const hero=new PNG({width:600,height:220});
 for(let y=0;y<220;y++)for(let x=0;x<600;x++){const i=(y*600+x)*4;hero.data[i]=30+Math.floor(x/6);hero.data[i+1]=55+Math.floor(y/3);hero.data[i+2]=100;hero.data[i+3]=255;}
 const logo=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=300;c.height=100;const ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,300,100);ctx.fillStyle='#233d45';ctx.font='bold 35px Arial';ctx.fillText('MARCA',55,62);return c.toDataURL();});
 await page.request.put(`/api/events/${event.id}/design`,{headers,data:{...designDefaults,color:'#233d45',qrTone:'brand',logo,hero:`data:image/png;base64,${PNG.sync.write(hero).toString('base64')}`}});
 await expect(page.locator('#event-select option',{hasText:'Encuentro de marca 2026'})).toHaveCount(1);
 await page.locator('#event-select').selectOption(String(event.id));
 await page.getByRole('button',{name:'Diseño de invitación',exact:true}).click();
 await expect(page.getByLabel('Color del QR',{exact:true})).toHaveValue('brand');
 for(const style of ['brand','minimal','image']){
  await page.getByLabel('Estilo del pase',{exact:true}).selectOption(style);
  await page.getByRole('button',{name:'Vista previa del pase QR',exact:true}).click();
  await expect(page.locator('#pass-preview')).toBeVisible();
  const downloadPromise=page.waitForEvent('download');
  await page.getByRole('link',{name:'Descargar pase PNG'}).click();
  const download=await downloadPromise;const path=`test-results/pase-${style}.png`;await download.saveAs(path);
  expect(decode(await readFile(path))).toBe(qr);
  const mobile=await page.locator('#pass-preview').evaluate(async image=>{await image.decode();const c=document.createElement('canvas');c.width=360;c.height=Math.round(image.naturalHeight*360/image.naturalWidth);c.getContext('2d').drawImage(image,0,0,c.width,c.height);return c.toDataURL().split(',')[1];});
  expect(decode(Buffer.from(mobile,'base64'))).toBe(qr);
  await page.getByRole('button',{name:'Cerrar',exact:true}).click();
 }
 await page.getByRole('button',{name:'Guardar diseño',exact:true}).click();
 await expect(page.locator('#toast')).toContainText('Diseño guardado');
 await page.getByRole('button',{name:'Invitados',exact:true}).click();
 await page.getByRole('button',{name:'Ver ficha',exact:true}).click();
 await page.getByRole('button',{name:'Ver pase con diseño',exact:true}).click();
 await expect(page.locator('#pass-preview')).toBeVisible();
 const detail=await(await page.request.get(`/api/events/${event.id}/guests/${guest.id}/detail`)).json();expect(detail.guest.checked_at).toBeNull();expect(errors).toEqual([]);
});
