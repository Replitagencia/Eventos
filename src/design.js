export const categories = ['general', 'vip', 'prensa', 'equipo', 'proveedores'];
export const designDefaults = { subject: '', heading: 'Nos encontramos muy pronto.', message: 'Queremos contar contigo en este encuentro. Guarda esta invitación y presenta tu código QR al llegar.', closing: '¡Te esperamos!', color: '#23483d', background: '#f1f3eb', logo: '', hero: '', passStyle: 'brand', passLabel: 'PASE DE ACCESO', passFooter: 'Presenta este pase al llegar.', qrTone: 'black' };
const invalid = message => { throw Object.assign(new Error(message), { status: 400 }); };
export function validateDesign(input) {
  const result = {};
  for (const [key, limit] of Object.entries({ subject: 150, heading: 150, message: 3000, closing: 150 })) {
    if (typeof input[key] !== 'string' || input[key].length > limit || (key === 'subject' && /[\r\n]/.test(input[key]))) invalid(`Revisa el campo ${key}: máximo ${limit} caracteres.`);
    result[key] = input[key].trim();
  }
  for (const key of ['color', 'background']) {
    if (!/^#[0-9a-f]{6}$/i.test(input[key])) invalid('Selecciona un color válido.');
    result[key] = input[key];
  }
  for (const key of ['logo', 'hero']) {
    const value = input[key];
    if (value === '') { result[key] = ''; continue; }
    const match = typeof value === 'string' && /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
    if (!match || value.length > 480000) invalid('Usa imágenes PNG, JPG o WebP de hasta 350 KB.');
    const bytes = Buffer.from(match[2], 'base64');
    const valid = match[1] === 'png' ? bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')) : match[1] === 'jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 : bytes.toString('ascii',0,4) === 'RIFF' && bytes.toString('ascii',8,12) === 'WEBP';
    if (!valid || bytes.length > 350 * 1024) invalid('El archivo no es una imagen válida o supera 350 KB.');
    result[key] = value;
  }
  for (const [key, allowed] of Object.entries({passStyle:['brand','minimal','image'],qrTone:['black','brand']})) {
    const value = input[key] ?? designDefaults[key];
    if (!allowed.includes(value)) invalid('Selecciona un estilo de pase y color de QR válidos.');
    result[key] = value;
  }
  for (const [key, limit] of Object.entries({passLabel:40,passFooter:120})) {
    const value = input[key] ?? designDefaults[key];
    if (typeof value !== 'string' || value.length > limit) invalid(`El texto del pase supera el máximo de ${limit} caracteres.`);
    result[key] = value.trim();
  }
  return result;
}
export function eventDesign(event) { return { ...designDefaults, ...JSON.parse(event.invitation || '{}') }; }
