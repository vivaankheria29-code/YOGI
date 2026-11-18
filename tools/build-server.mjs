import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
await build({absWorkingDir:root,entryPoints:['server.mjs'],outfile:'server.bundle.mjs',bundle:true,mainFields:['module','main'],platform:'node',format:'esm',banner:{js:"import {createRequire as createBundledRequire} from 'node:module';const require=createBundledRequire(import.meta.url);"}});
