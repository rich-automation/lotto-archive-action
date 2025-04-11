import typescript from '@rollup/plugin-typescript';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import * as path from 'path';
// import terser from '@rollup/plugin-terser';

export default {
  input: 'src/index.ts',
  output: {
    dir: 'dist',
    format: 'cjs',
    chunkFileNames: '[name].js',

    manualChunks: (id: string): string | void => {
      if (id.includes('vm2')) {
        const file = path.basename(id).replace(path.extname(id), '');
        return `vm2/${file}`;
      }
    }
  },
  external: ['puppeteer', 'playwright'],
  plugins: [
    json(),
    commonjs(),
    resolve(),
    typescript({ outDir: 'dist' })
    //terser({ compress: true })
    // ____
  ]
};
