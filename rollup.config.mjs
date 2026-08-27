import commonjs from "@rollup/plugin-commonjs";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";

const sdPlugin = "com.solartesla.energy.sdPlugin";

/** @type {import('rollup').RollupOptions} */
const config = {
  input: "src/plugin.ts",
  output: {
    file: `${sdPlugin}/bin/plugin.js`,
    sourcemap: true,
    sourcemapPathTransform: (relativeSourcePath, sourcemapPath) => {
      return relativeSourcePath.replace(/^\.\.\//, `${sdPlugin}/`);
    },
  },
  plugins: [
    { name: "watch-externals", buildStart: function () { this.addWatchFile(`${sdPlugin}/manifest.json`); } },
    typescript({ tsconfig: "./tsconfig.json", exclude: ["test/**/*"] }),
    nodeResolve({ browser: false, exportConditions: ["node"], preferBuiltins: true }),
    commonjs(),
  ],
  external: [],
};

export default config;
