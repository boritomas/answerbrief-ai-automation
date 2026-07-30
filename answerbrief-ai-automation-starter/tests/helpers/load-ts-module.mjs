import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const appRoot = process.cwd();
const requireFromApp = createRequire(path.join(appRoot, 'package.json'));
const ts = requireFromApp('typescript');
const moduleCache = new Map();

export function loadTsModule(relativePath) {
  return loadTsFile(path.resolve(appRoot, relativePath));
}

function loadTsFile(filePath) {
  const resolved = filePath.endsWith('.ts') ? filePath : `${filePath}.ts`;
  if (moduleCache.has(resolved)) return moduleCache.get(resolved).exports;
  const source = fs.readFileSync(resolved, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: resolved,
  }).outputText;
  const module = { exports: {} };
  moduleCache.set(resolved, module);
  const localRequire = (specifier) => {
    if (specifier.startsWith('.')) {
      return loadTsFile(path.resolve(path.dirname(resolved), specifier));
    }
    return requireFromApp(specifier);
  };
  const execute = new Function('require', 'module', 'exports', '__filename', '__dirname', compiled);
  execute(localRequire, module, module.exports, resolved, path.dirname(resolved));
  return module.exports;
}
