/**
 * The worked examples in `CommissionService`'s doc comment are checked
 * against the code, so the comment can never drift from the formula again.
 *
 * The drift that started this: the comment claimed
 *
 *   amount=2000 → (company:850, salesperson:700, influencer:50)
 *
 * while the code computes 100 + 75% × (2000 − 600) = 1150. A reader of the
 * comment would have believed a salesperson earned KSh 700 on a KSh 2000
 * package when the platform actually paid KSh 1150 — the exact kind of
 * money confusion the SDK's own INVARIANT 4 exists to prevent.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { CommissionService } from '../src/CommissionService.js'

const sourcePath = fileURLToPath(new URL('../src/CommissionService.ts', import.meta.url))
const source = readFileSync(sourcePath, 'utf8')

const EXAMPLE = /amount=(\d+)\s*→\s*\(company:(\d+),\s*salesperson:(\d+),\s*influencer:(\d+)\)/g

interface Example {
  amount: number
  company: number
  salesperson: number
  influencer: number
}

const examples: Example[] = [...source.matchAll(EXAMPLE)].map((m) => ({
  amount: Number(m[1]),
  company: Number(m[2]),
  salesperson: Number(m[3]),
  influencer: Number(m[4]),
}))

// `calculateSplit` is a pure function — it never touches the repository or
// the sync engine, so empty doubles are enough.
const service = new CommissionService(
  {} as never,
  {} as never,
  'business-1' as never,
  'device-1',
)

describe('CommissionService — the doc comment matches the code', () => {
  it('finds the worked examples in the source', () => {
    expect(examples.length).toBeGreaterThanOrEqual(4)
  })

  for (const example of examples) {
    it(`amount=${example.amount} → company ${example.company}, salesperson ${example.salesperson}, influencer ${example.influencer}`, () => {
      const split = service.calculateSplit(example.amount as never)
      expect(split.companyShare).toBe(example.company)
      expect(split.salespersonShare).toBe(example.salesperson)
      expect(split.influencerFlat).toBe(example.influencer)
    })
  }

  it('pins the amount=2000 example to 1150, not 700', () => {
    const twoThousand = examples.find((e) => e.amount === 2000)
    expect(twoThousand).toBeDefined()
    expect(twoThousand!.salesperson).toBe(1150)
    // company + salesperson must account for the whole payment
    expect(twoThousand!.company + twoThousand!.salesperson).toBe(2000)
  })
})
