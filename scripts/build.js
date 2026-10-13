// Empacota o jogo em uma única página HTML, sem módulos externos:
//   dist/nadir.html           abre direto no navegador, inclusive via file://
//   dist/nadir.fragment.html  mesmo conteúdo sem <html>/<head>/<body>, para
//                             hospedagens que fornecem o próprio esqueleto
// Uso: npm run build

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const dist = join(root, 'dist');

const IMPORT_RE = /^import\s*\{([^}]*)\}\s*from\s*'([^']+)';?[ \t]*$/gm;
const EXPORT_DECL_RE = /^export\s+(async\s+)?(function|const|let|class)\s+([A-Za-z_$][\w$]*)/gm;

const idFor = (file) => '__' + relative(root, file).replace(/\W/g, '_');

// Converte cada módulo ES em uma função isolada que devolve suas exportações.
// Suporta apenas o que o projeto usa: imports nomeados e exportações declaradas.
async function bundle(entry) {
  const modules = new Map();
  const order = [];

  async function visit(file) {
    if (modules.has(file)) return;
    modules.set(file, null);
    const deps = [];
    let code = (await readFile(file, 'utf8')).replace(IMPORT_RE, (_, names, spec) => {
      const dep = resolve(dirname(file), spec);
      deps.push(dep);
      const bindings = names
        .split(',')
        .map((n) => n.trim())
        .filter(Boolean)
        .map((n) => n.replace(/\s+as\s+/, ': '))
        .join(', ');
      return `const { ${bindings} } = ${idFor(dep)};`;
    });
    const exports = [];
    code = code.replace(EXPORT_DECL_RE, (_, asyncKw = '', kind, name) => {
      exports.push(name);
      return `${asyncKw || ''}${kind} ${name}`;
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

function replaceOnce(source, pattern, replacement, what) {
  if (!pattern.test(source)) throw new Error(`Não encontrei ${what} no index.html`);
  return source.replace(pattern, () => replacement);
}

const html = await readFile(join(root, 'index.html'), 'utf8');
const css = await readFile(join(root, 'src/style.css'), 'utf8');
const js = await bundle(join(root, 'src/main.js'));
if (js.includes('</script')) throw new Error('O código empacotado contém </script>.');

const style = `<style>\n${css}</style>`;
const script = `<script>\n"use strict";\n${js}\n</script>`;

let page = replaceOnce(html, /<link rel="stylesheet" href="src\/style\.css" \/>/, style, 'o link do CSS');
page = replaceOnce(page, /<script type="module" src="src\/main\.js"><\/script>/, script, 'o script principal');

const title = page.match(/<title>[\s\S]*?<\/title>/)[0];
const fonts = [...page.matchAll(/<link [^>]*fonts\.(?:googleapis|gstatic)\.com[^>]*>/g)].map((m) => m[0]);
const body = page.match(/<body>([\s\S]*)<\/body>/)[1];
const fragment = [title, ...fonts, style, body.trim()].join('\n');

await mkdir(dist, { recursive: true });
await writeFile(join(dist, 'nadir.html'), page);
await writeFile(join(dist, 'nadir.fragment.html'), fragment + '\n');
console.log(`dist/nadir.html (${Math.round(page.length / 1024)} KB) e dist/nadir.fragment.html gerados.`);
