// Vercel's entry point for this project: the compiled serverless app (see src/vercel.ts).
// `npm run build` produces dist/ before Vercel bundles this file.
//
// Vercel picks as the entry the first file at a standard location (app, index, or server, at the
// root or in src/) that imports express, so this file imports it explicitly and no file in src/
// uses those names. test/vercelEntry.test.ts guards both.
import 'express'

export { default } from './dist/vercel.js'
