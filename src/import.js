import { parse } from 'csv-parse/sync';
import ExcelJS from 'exceljs';

export function validateGuest(input) {
  const guest = Object.fromEntries(['name', 'email', 'rut', 'company', 'category', 'notes'].map(key => [key, String(input[key] ?? '').trim()]));
  guest.email = guest.email.toLowerCase();
  guest.rut = guest.rut.replace(/[.\s-]/g, '').toUpperCase();
  if (!guest.name || guest.name.length > 150) throw new Error('Nombre obligatorio (máximo 150 caracteres).');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guest.email) || guest.email.length > 254) throw new Error('Correo electrónico inválido.');
  if (guest.rut.length > 20 || guest.company.length > 150) throw new Error('RUT o empresa demasiado largo.');
  guest.category = (guest.category || 'general').toLowerCase();
  if (!['general','vip','prensa','equipo','proveedores'].includes(guest.category)) throw Object.assign(new Error('Categoría inválida: usa general, vip, prensa, equipo o proveedores.'), { status: 400 });
  if (guest.notes.length > 2000) throw Object.assign(new Error('Notas internas: máximo 2.000 caracteres.'), { status: 400 });
  return guest;
}
export async function parseImport(buffer, filename) {
  let rows;
  if (filename.toLowerCase().endsWith('.csv')) {
    const content = buffer.toString('utf8');
    const first = content.split('\n')[0];
    rows = parse(content, { columns: true, bom: true, skip_empty_lines: true, trim: true, delimiter: first.includes(';') ? ';' : ',' });
  } else if (filename.toLowerCase().endsWith('.xlsx')) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.worksheets[0];
    if (!sheet || sheet.rowCount > 1001 || sheet.columnCount > 20) throw new Error('Usa la primera hoja, máximo 1.000 filas y 20 columnas.');
    const headers = sheet.getRow(1).values.slice(1).map(value => String(value).trim());
    rows = [];
    sheet.eachRow((row, index) => {
      if (index > 1) rows.push(Object.fromEntries(headers.map((header, i) => [header, row.getCell(i + 1).text])));
    });
  } else throw new Error('Formato permitido: .csv o .xlsx.');
  if (!rows.length || rows.length > 1000) throw new Error('Importa entre 1 y 1.000 invitados por archivo.');
  const aliases = { categoria: 'category', categoría: 'category', notas: 'notes', nombre: 'name', email: 'email', correo: 'email', rut: 'rut', empresa: 'company', name: 'name', company: 'company' };
  return rows.map((row, index) => {
    try {
      const normalized = Object.fromEntries(Object.entries(row).map(([key, value]) => [aliases[key.trim().toLowerCase()] || key, value]));
      return validateGuest(normalized);
    } catch (error) { throw new Error(`Fila ${index + 2}: ${error.message}`); }
  });
}
export function csvCell(value) {
  let text = String(value ?? '');
  if (/^[\s]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
