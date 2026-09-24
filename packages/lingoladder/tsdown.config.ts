import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
  },
  outDir: 'lib',
  format: 'esm',
  fixedExtension: false,
  dts: false,
  clean: false,
  // Exclude packages that use TC39 decorators from bundling
  deps: {
    neverBundle: (specifier) =>
      specifier.startsWith('@deepseek-ai/dsh-typert-protocol') ||
      specifier.startsWith('@deepseek-ai/dsh-llm') ||
      specifier.startsWith('@deepseek-ai/dsh-session') ||
      specifier.startsWith('@deepseek-ai/dsh-settings') ||
      specifier.startsWith('@deepseek-ai/dsh-agent') ||
      specifier.startsWith('@deepseek-ai/dsh-agent-default-model') ||
      specifier.startsWith('@deepseek-ai/dsh-host-webserver') ||
      specifier.startsWith('@deepseek-ai/dsh-api-') ||
      specifier.startsWith('@deepseek-ai/dsh-workspace') ||
      // unpdf resolves its bundled pdf.js cMap/standard-font assets from its own
      // node_modules paths at runtime; bundling it would break those file lookups.
      specifier === 'unpdf',
  },
  // Transpile TC39 decorators to legacy syntax for Node.js compatibility
  esbuild: {
    target: 'es2024',
    loader: 'ts',
    tsconfigRaw: JSON.stringify({
      compilerOptions: {
        experimentalDecorators: true,
        emitDecoratorMetadata: false,
      },
    }),
  },
})
