// Empacota o jogo em uma única página HTML, com o three.js embutido:
//   dist/nadir.html           abre direto no navegador, inclusive via file://
//   dist/nadir.fragment.html  mesmo conteúdo sem <html>/<head>/<body>, para
//                             hospedagens que fornecem o próprio esqueleto
// Uso: npm run build

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const dist = join(root, 'dist');
const THREE_FILE = join(root, 'node_modules/three/build/three.module.min.js');

const IMPORT_NAMED = /^import\s*\{([^}]*)\}\s*from\s*'([^']+)';?[ \t]*$/gm;
const IMPORT_NS = /^import\s*\*\s*as\s+([A-Za-z_$][\w$]*)\s+from\s*'([^']+)';?[ \t]*$/gm;
const EXPORT_DECL = /^export\s+(async\s+)?(function|const|let|class)\s+([A-Za-z_$][\w$]*)/gm;
const EXPORT_LIST = /^export\s*\{([^}]*)\};?[ \t]*$/gm;

const idFor = (file) => '__' + relative(root, file).replace(/\W/g, '_');

function moduleRef(spec, from) {
  if (spec === 'three') return { id: '__three', file: null };
  const file = resolve(dirname(from), spec);
  return { id: idFor(file), file };
}

// Converte cada módulo ES numa função isolada que devolve suas exportações.
async function bundle(entry) {
  const modules = new Map();
  const order = [];

  async function visit(file) {
    if (modules.has(file)) return;
    modules.set(file, null);
    const deps = [];
    let code = await readFile(file, 'utf8');
    code = code.replace(IMPORT_NAMED, (_, names, spec) => {
      const ref = moduleRef(spec, file);
      if (ref.file) deps.push(ref.file);
      const bindings = names
        .split(',')
        .map((n) => n.trim())
        .filter(Boolean)
        .map((n) => n.replace(/\s+as\s+/, ': '))
        .join(', ');
      return `const { ${bindings} } = ${ref.id};`;
    });
    code = code.replace(IMPORT_NS, (_, name, spec) => {
      const ref = moduleRef(spec, file);
      if (ref.file) deps.push(ref.file);
      return `const ${name} = ${ref.id};`;
    });
    const exports = [];
    code = code.replace(EXPORT_DECL, (_, asyncKw = '', kind, name) => {
      exports.push(name);
      return `${asyncKw || ''}${kind} ${name}`;
    });
    code = code.replace(EXPORT_LIST, (_, names) => {
      for (const n of names.split(',').map((x) => x.trim()).filter(Boolean)) exports.push(n);
      return '';
    });
    if (/^(export|import)\s/m.test(code)) throw new Error(`Sintaxe de módulo não suportada em ${relative(root, file)}`);
    for (const dep of deps) await visit(dep);
    modules.set(file, { code, exports });
    order.push(file);
  }

  await visit(entry);
  return order
    .map((file) => {
      const { code, exports } = modules.get(file);
      return `// ${relative(root, file)}\nconst ${idFor(file)} = (() => {\n${code}\nreturn { ${exports.join(', ')} };\n})();`;
    })
    .join('\n\n');
}

// three.module.min.js termina com "export{a as B,...}". Vira um objeto.
async function threeNamespace() {
  const src = await readFile(THREE_FILE, 'utf8');
  const match = src.match(/export\s*\{([^}]*)\}\s*;?\s*$/);
  if (!match) throw new Error('Formato inesperado do three.module.min.js');
  const body = src.slice(0, match.index);
  const entries = match[1]
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const [local, , exported] = s.split(/\s+/);
      return exported ? `${exported}: ${local}` : `${local}: ${local}`;
    });
  return `const __three = (() => {\n${body}\nreturn { ${entries.join(', ')} };\n})();`;
}

function replaceOnce(source, pattern, replacement, what) {
  if (!pattern.test(source)) throw new Error(`Não encontrei ${what} no index.html`);
  return source.replace(pattern, () => replacement);
}

const html = await readFile(join(root, 'index.html'), 'utf8');
const css = await readFile(join(root, 'src/styles.css'), 'utf8');
const js = (await threeNamespace()) + '\n\n' + (await bundle(join(root, 'src/main.js')));
if (/<\/script/i.test(js)) throw new Error('O código empacotado contém </script>.');

const style = `<style>\n${css}</style>`;
const script = `<script type="module">\n${js}\n</script>`;

let page = replaceOnce(html, /<link rel="stylesheet" href="src\/styles\.css" \/>/, style, 'o link do CSS');
page = replaceOnce(page, /\s*<script type="importmap">[\s\S]*?<\/script>/, '', 'o mapa de importação');
page = replaceOnce(page, /<script type="module" src="src\/main\.js"><\/script>/, script, 'o script principal');

const title = page.match(/<title>[\s\S]*?<\/title>/)[0];
const fonts = [...page.matchAll(/<link [^>]*fonts\.(?:googleapis|gstatic)\.com[^>]*>/g)].map((m) => m[0]);
const body = page.match(/<body>([\s\S]*)<\/body>/)[1];
const fragment = [title, ...fonts, style, body.trim()].join('\n');

await mkdir(dist, { recursive: true });
await writeFile(join(dist, 'nadir.html'), page);
await writeFile(join(dist, 'nadir.fragment.html'), fragment + '\n');
console.log(`dist/nadir.html (${Math.round(page.length / 1024)} KB) e dist/nadir.fragment.html gerados.`);
