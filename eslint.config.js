import js from '@eslint/js';
import ts from 'typescript-eslint';
export default ts.config({ ignores:['.data/**','dist/**','node_modules/**','playwright-report/**','test-results/**'] },js.configs.recommended,...ts.configs.recommended,{
  files:['**/*.{ts,js,mjs}'],languageOptions:{globals:{process:'readonly',console:'readonly',Buffer:'readonly',setTimeout:'readonly',URL:'readonly'}},
  rules:{'@typescript-eslint/no-empty-function':'off','@typescript-eslint/no-non-null-assertion':'off'}
},{files:['src/assets/claude-geometry/**/*.ts'],rules:{'@typescript-eslint/no-unused-vars':['error',{varsIgnorePattern:'^_',argsIgnorePattern:'^_'}]}});
