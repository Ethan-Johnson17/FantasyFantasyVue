import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/*
 * Vercel runs the first file it finds at these locations that imports express. If it picks one in
 * src/, it compiles TypeScript its own way and runs the wrong thing, so index.js must be the only one.
 * https://vercel.com/docs/frameworks/backend/express
 */
const CANDIDATES = ['app', 'index', 'server'].flatMap(name =>
  ['', 'src/'].flatMap(dir => ['js', 'cjs', 'mjs', 'ts', 'cts', 'mts'].map(ext => `${dir}${name}.${ext}`))
)
const root = new URL('../', import.meta.url)
const importsExpress = (source: string) => /from ['"]express['"]|import ['"]express['"]|require\(['"]express['"]\)/.test(source)

describe('Vercel entry point', () => {
  it('is index.js, the only candidate file that imports express', () => {
    const entries = CANDIDATES.filter(path => existsSync(new URL(path, root)) && importsExpress(readFileSync(new URL(path, root), 'utf8')))
    expect(entries).toEqual(['index.js'])
  })

  it('loads the compiled serverless app', () => {
    expect(readFileSync(new URL('index.js', root), 'utf8')).toContain("export { default } from './dist/vercel.js'")
  })
})
