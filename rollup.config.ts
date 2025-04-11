import typescript from '@rollup/plugin-typescript';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import copy from 'rollup-plugin-copy';
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
  plugins: [
    json(),
    commonjs(),
    resolve(),
    typescript({ outDir: 'dist' }),
    copy({
      targets: [{ src: 'node_modules/vm2/lib/setup-sandbox.js', dest: 'dist/vm2' }]
    })
    //terser({ compress: true })
    // ____
  ]
};
