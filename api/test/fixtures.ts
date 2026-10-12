import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { parse } from 'csv-parse/sync'
import type { CsvLoader } from '../src/modules/stats/importer.js'
import type { CsvRow } from '../src/modules/stats/nflverse.js'

const FIXTURES = path.join(import.meta.dirname, 'fixtures')

/** Real nflverse rows (2023 season subset) chosen to cover scoring edge cases. */
export async function readFixture(fileName: string): Promise<CsvRow[]> {
  return parse<CsvRow>(await readFile(path.join(FIXTURES, fileName), 'utf8'), { columns: true })
}

/** Serves fixtures in place of nflverse downloads, matching on the URL's file name. */
export const fixtureLoader: CsvLoader = url => readFixture(path.basename(new URL(url).pathname))
