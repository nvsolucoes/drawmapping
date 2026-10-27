import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const source = new URL('../shared/model.ts', import.meta.url);
const output = new URL('../shared/model.mjs', import.meta.url);
const text = await readFile(source, 'utf8');
const result = ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 }, fileName: fileURLToPath(source) });
await writeFile(output, `// Gerado de shared/model.ts por scripts/build-model.mjs.\n${result.outputText}`);
