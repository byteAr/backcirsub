/**
 * Genera una clave para que una app externa mande notificaciones.
 *
 *   npm run clave:notificaciones -- gestion "Sistema de gestión" uno,todos
 *
 * Imprime dos cosas:
 * - la CLAVE, que se le pasa a la app externa y no se vuelve a ver;
 * - la ENTRADA para NOTIF_EXTERNAS_CLAVES, que lleva sólo el hash.
 *
 * Si se pierde la clave no se puede recuperar: se genera otra y se reemplaza
 * la entrada.
 */
const { createHash, randomBytes } = require('crypto');

const [id, nombre, alcances = 'uno'] = process.argv.slice(2);

if (!id || !nombre || !/^[a-z0-9-]+$/.test(id)) {
  console.error('Uso: npm run clave:notificaciones -- <id> "<Nombre visible>" [uno|todos|uno,todos]');
  console.error('  <id>: minúsculas, números y guiones. Ej: gestion, admin');
  process.exit(1);
}

if (!alcances.split(',').every((a) => ['uno', 'todos'].includes(a.trim()))) {
  console.error('Los alcances posibles son "uno", "todos" o "uno,todos"');
  process.exit(1);
}

if (/[|;]/.test(nombre)) {
  console.error('El nombre no puede llevar "|" ni ";"');
  process.exit(1);
}

const clave = `cirsub_${id}_${randomBytes(32).toString('base64url')}`;
const hash = createHash('sha256').update(clave, 'utf8').digest('hex');

console.log('');
console.log('CLAVE para la app externa (guardala ahora, no se vuelve a mostrar):');
console.log(`  ${clave}`);
console.log('');
console.log('ENTRADA para NOTIF_EXTERNAS_CLAVES en el .env (separar de otras con ";"):');
console.log(`  ${id}|${nombre}|${alcances}|${hash}`);
console.log('');
