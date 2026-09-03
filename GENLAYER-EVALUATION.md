# GenLayer consensus — evaluation

Real reviews against `OccestraQualityAdjudicator` at
[`0xd3baaBD39F6d83949803de0a62B84a04285Ef3d9`](https://explorer-bradbury.genlayer.com/) on GenLayer Bradbury (chain 4221).
Generated from the `consensus_reviews` table by `scripts/genlayer-evaluate.mjs`, so every
number here traces to a transaction.

**12 reviews submitted. 6 produced a ruling. 6 failed to reach consensus at all.**

## The honest headline

GenLayer **agreed with the Tribunal every time it managed to rule** — 100% (6/6) upheld,
0 overturned. That is corroboration, not error-catching. On this corpus the
consensus layer did not find a single verdict Occestra had got wrong, and it would be
dishonest to present these results as though it had.

The more useful finding is about reliability. **6 of 12 reviews never produced a
ruling**, breaking down as 3× LEADER_TIMEOUT, 1× VALIDATORS_TIMEOUT, 2× UNDETERMINED.
On Bradbury today, an independent review is roughly a coin flip to complete. That is why the
product treats a failed review as *unavailable* and makes no claim about the artifact — a
consensus layer that silently degraded to "looks fine" would be worse than none.

## Numbers

| Metric | Value |
| --- | --- |
| Reviews submitted | 12 |
| Produced a ruling | 6 |
| Failed to reach consensus | 6 |
| Agreement with the Tribunal | 100% (6/6) |
| Overturn rate | 0% (0/6) |
| Validator-ruled UNDETERMINED | 0 |
| Local verdicts corrected | 0 |

With 6 rulings this is an indication and nothing more. It is far too small to
quote as a rate, and no significance should be read into it.

## Every review

| Case | Built to be | Tribunal | GenLayer | Band | Codes | Status | Transaction |
| --- | --- | --- | --- | --- | --- | --- | --- |
| w01 | clean | PASS | UPHELD | 85-100 | — | FINALIZED | `0x6c71cfe9…` |
| w02 | fail (FACTUAL_SUPPORT) | FAIL | UPHELD | 0-49 | FACTUAL_SUPPORT, SPECIFICITY, STRUCTURE, VOICE | FINALIZED | `0x03f9d58a…` |
| w03 | fail (BRIEF_MISMATCH) | FAIL | UPHELD | 0-49 | — | FINALIZED | `0x4e6dacb0…` |
| w04 | fail (STYLE_DRIFT) | FAIL | — | — | — | unavailable · LEADER_TIMEOUT | `0xb4f5664d…` |
| w05 | fail (BRIEF_MISMATCH) | FAIL | — | — | — | unavailable · LEADER_TIMEOUT | `0x8981020f…` |
| w06 | clean | FAIL | — | — | — | unavailable · VALIDATORS_TIMEOUT | `0x7cba7290…` |
| w07 | ambiguous | FAIL | UPHELD | 70-84 | — | ACCEPTED | `0x6b063650…` |
| w08 | fail (SOURCE_COVERAGE) | FAIL | — | — | — | unavailable · UNDETERMINED | `0xa2c1366d…` |
| strong_copy | smoke | PASS | — | — | — | unavailable · UNDETERMINED | `0x7523122b…` |
| strong_copy | smoke | PASS | UPHELD | 70-84 | — | FINALIZED | `0xdaf50476…` |
| weak_copy | smoke | PASS | — | — | — | unavailable · LEADER_TIMEOUT | `0x79cf2d1d…` |
| weak_copy | smoke | FAIL | UPHELD | 0-49 | FACTUAL_SUPPORT, PLATFORM_FIT, SPECIFICITY, STRUCTURE, VOICE | FINALIZED | `0xe557d828…` |

## What this does not cover

- **Visual artifacts: none.** The corpus defines ten, but no bytes were rendered for them in
  this pass, so the vision path has been exercised only in direct tests with a mocked
  screenshot. No claim is made about visual adjudication in production.
- **Plan artifacts: none.** The plan profile returned uniform 70s — exactly the pass
  threshold — for every case regardless of content, so those cases were withdrawn rather than
  reported. That is a separate issue in local grading and is being tracked on its own.
- **No overturn has been observed in production.** The repair path that an overturn triggers
  is covered by unit tests, not by a live example, and this document should not be read as
  evidence that it has run end to end.

## Findings worth keeping

**Evidence quality decides whether consensus is even reachable.** The first two reviews were
built while the model critic was down, so the snapshot carried no axis scores. Both failed —
one UNDETERMINED, one leader timeout. The next two, carrying real critic scores, both reached
agreement. Thin evidence makes independent validators diverge, which is an argument for
sending validators more, not less.

**Validators speak the rubric's language.** Asked to prefer codes present in the evidence, they
returned `FACTUAL_SUPPORT`, `PLATFORM_FIT`, `SPECIFICITY`, `STRUCTURE`, `VOICE` —
OQS axis names. An earlier, narrower code list recognised one of those and discarded four.

**The local critic is not stable at the threshold.** The same story page scored
`platform_fit` 70 on one grading run and 62 on the next — passing, then failing, on identical
text. An appellate layer is most valuable exactly there, on the artifacts whose verdict is one
point of model variance away from flipping.

## Reproducing this

```bash
node genlayer/smoke/stage-corpus.mjs      # grade the corpus with the live Tribunal
node scripts/genlayer-benchmark.mjs --run # submit each case for review
node scripts/genlayer-evaluate.mjs        # regenerate this document from the results
```
