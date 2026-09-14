import { build } from 'esbuild';
import { createRequire } from 'node:module';
import vm from 'node:vm';
const require = createRequire(new URL('../package.json', import.meta.url));
export async function loadModule(path, mocks = {}) {
  const result = await build({ entryPoints: [new URL('../src/' + path, import.meta.url).pathname], bundle: true,
    platform: 'node', format: 'cjs', write: false, packages: 'external',
    plugins: [{ name: 'test-boundaries', setup(build) {
      build.onResolve({filter: /.*/}, args => args.path in mocks ? {path: args.path, namespace: 'test'} : undefined);
      build.onLoad({filter: /.*/,namespace:'test'}, args => ({contents:mocks[args.path],loader:'js'}));
    }}] });
  const module = {exports:{}};
  const fn = vm.runInThisContext('(function(require,module,exports){' + result.outputFiles[0].text + '\n})');
  fn(require,module,module.exports);
  return module.exports;
}
