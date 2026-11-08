/* Versiones de caché (?v=) de index.html. Cada archivo propio que index.html carga lleva ./archivo?v=<huella>, donde la huella son los 8
   primeros caracteres del md5 de su contenido: al cambiar el archivo cambia la URL y ningún navegador mezcla un archivo nuevo con uno
   viejo guardado en caché.
     node scripts/versiones.js          recalcula las huellas y reescribe index.html (ejecútalo siempre antes de publicar)
     node scripts/versiones.js --check  solo comprueba; termina con error si alguna está desactualizada (lo usan las pruebas) */
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const RAIZ = path.join(__dirname, '..'), HTML = path.join(RAIZ, 'index.html');
const huella = (archivo) => crypto.createHash('md5').update(fs.readFileSync(path.join(RAIZ, archivo))).digest('hex').slice(0, 8);

// Devuelve [{archivo, puesta, actual, existe}] para cada ./archivo?v=xxxxxxxx de index.html.
function revisar(texto) {
  texto = texto == null ? fs.readFileSync(HTML, 'utf8') : texto;
  const out = [], re = /\.\/([A-Za-z0-9_.\-\/]+)\?v=([0-9a-f]{8})/g; let m;
  while ((m = re.exec(texto))) {
    const existe = fs.existsSync(path.join(RAIZ, m[1]));
    out.push({ archivo: m[1], puesta: m[2], actual: existe ? huella(m[1]) : null, existe });
  }
  return out;
}
function actualizar() {
  let texto = fs.readFileSync(HTML, 'utf8'), cambios = [];
  revisar(texto).forEach((r) => {
    if (!r.existe || r.puesta === r.actual) return;
    texto = texto.split('./' + r.archivo + '?v=' + r.puesta).join('./' + r.archivo + '?v=' + r.actual); cambios.push(r);
  });
  if (cambios.length) fs.writeFileSync(HTML, texto);
  return cambios;
}
module.exports = { revisar, actualizar, huella };

if (require.main === module) {
  if (process.argv.includes('--check')) {
    const mal = revisar().filter((r) => !r.existe || r.puesta !== r.actual);
    mal.forEach((r) => console.log('DESACTUALIZADA: ' + r.archivo + ' (index.html: ' + r.puesta + ', real: ' + (r.actual || 'no existe') + ')'));
    console.log(mal.length ? 'Ejecuta: node scripts/versiones.js' : 'Versiones al día (' + revisar().length + ' archivos)');
    process.exit(mal.length ? 1 : 0);
  } else {
    const c = actualizar(); console.log(c.length ? c.map((r) => r.archivo + ': ' + r.puesta + ' → ' + r.actual).join('\n') : 'Nada que actualizar');
  }
}
