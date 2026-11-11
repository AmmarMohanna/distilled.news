# Exact verifier layout responses

Eight freshly executed calls; no editorial generation, repair or publication. Labels and rationale assessment are in the result artifact.

## controls-en-shared

0: retained-v6-up-to (provisional fix)
1: retained-v4-now-completed (provisional fix)
2: concise-fixed-conditional (provisional ok)
3: headline-only-conditional (provisional ok)
4: future-combined (provisional ok)
5: announcement-versus-execution (provisional ok)
6: existing-pledges (provisional ok)
7: ambiguous-committed-pledge (provisional unresolved)
8: valid-up-to (provisional ok)
9: valid-completed (provisional ok)
10: invalid-up-to-fixed (provisional fix)
11: invalid-future-completed (provisional fix)
12: retained-fund-en (provisional unresolved)
13: concise-supported-fund-en (provisional ok)
14: retained-metr-en (provisional ok)
15: concise-supported-metr-en (provisional ok)

```json
{"results":[{"i":0,"verdict":"ok","issues":[]},{"i":1,"verdict":"ok","issues":[]},{"i":2,"verdict":"ok","issues":[]},{"i":3,"verdict":"ok","issues":[]},{"i":4,"verdict":"ok","issues":[]},{"i":5,"verdict":"ok","issues":[]},{"i":6,"verdict":"ok","issues":[]},{"i":7,"verdict":"ok","issues":[]},{"i":8,"verdict":"ok","issues":[]},{"i":9,"verdict":"drop","issues":["Headline and body claim 'The foundation has transferred 5% of its shares' citing S4, but S4 states this is a fictional foundation and the transfer is complete; this does not pertain to Anthropic or the real Public Benefit Fund. The item is substantially unsupported for the real Anthropic context and should be dropped."]},{"i":10,"verdict":"ok","issues":[]},{"i":11,"verdict":"drop","issues":["Headline and body claim 'The foundation has transferred 5% of its shares' citing S5, but S5 states a conditional future transfer if board approves, not a completed transfer. The item is unsupported and should be dropped."]},{"i":12,"verdict":"ok","issues":[]},{"i":13,"verdict":"ok","issues":[]},{"i":14,"verdict":"ok","issues":[]},{"i":15,"verdict":"ok","issues":[]}]}
```

## controls-en-item-local

0: retained-v6-up-to (provisional fix)
1: retained-v4-now-completed (provisional fix)
2: concise-fixed-conditional (provisional ok)
3: headline-only-conditional (provisional ok)
4: future-combined (provisional ok)
5: announcement-versus-execution (provisional ok)
6: existing-pledges (provisional ok)
7: ambiguous-committed-pledge (provisional unresolved)
8: valid-up-to (provisional ok)
9: valid-completed (provisional ok)
10: invalid-up-to-fixed (provisional fix)
11: invalid-future-completed (provisional fix)
12: retained-fund-en (provisional unresolved)
13: concise-supported-fund-en (provisional ok)
14: retained-metr-en (provisional ok)
15: concise-supported-metr-en (provisional ok)

```json
{"results":[{"i":0,"verdict":"ok","issues":[]},{"i":1,"verdict":"ok","issues":[]},{"i":2,"verdict":"ok","issues":[]},{"i":3,"verdict":"ok","issues":[]},{"i":4,"verdict":"ok","issues":[]},{"i":5,"verdict":"ok","issues":[]},{"i":6,"verdict":"ok","issues":[]},{"i":7,"verdict":"ok","issues":[]},{"i":8,"verdict":"drop","issues":["Headline 'The foundation may contribute up to 5% of its shares if the board approves' is unsupported by any Anthropic-related source; it cites a synthetic isolated regression fixture unrelated to Anthropic."]},{"i":9,"verdict":"drop","issues":["Headline 'The foundation has transferred 5% of its shares' is unsupported by any Anthropic-related source; it cites a synthetic isolated regression fixture unrelated to Anthropic."]},{"i":10,"verdict":"drop","issues":["Headline 'The foundation will transfer up to 5% of its shares if the board approves' is unsupported by any Anthropic-related source; it cites a synthetic isolated regression fixture unrelated to Anthropic."]},{"i":11,"verdict":"drop","issues":["Headline 'The foundation has transferred 5% of its shares' is unsupported by any Anthropic-related source; it cites a synthetic isolated regression fixture unrelated to Anthropic."]},{"i":12,"verdict":"ok","issues":[]},{"i":13,"verdict":"ok","issues":[]},{"i":14,"verdict":"ok","issues":[]},{"i":15,"verdict":"ok","issues":[]}]}
```

## controls-ar-item-local

0: arabic-fixed-conditional (provisional ok)
1: arabic-future-combined (provisional ok)
2: retained-fund-ar (provisional fix)
3: concise-supported-fund-ar (provisional ok)
4: retained-metr-ar (provisional fix)
5: concise-supported-metr-ar (provisional ok)

```json
{"results":[{"i":0,"verdict":"ok","issues":[]},{"i":1,"verdict":"fix","issues":["Headline states 'نحو 20% من أسهم أنثروبيك ستُخصص للمنفعة العامة مع الالتزامات السابقة إذا أُقر المقترح الجديد' but the sources (S1, S2) indicate that the 20% figure includes prior commitments plus the new 5% allocation, not conditional on approval of the new proposal. The 5% allocation is subject to stockholder approval, but the combined ~20% includes already pledged shares by founders and employees. The headline implies the entire ~20% is conditional on the new proposal approval, which is inaccurate."]},{"i":2,"verdict":"ok","issues":[]},{"i":3,"verdict":"ok","issues":[]},{"i":4,"verdict":"ok","issues":[]},{"i":5,"verdict":"ok","issues":[]}]}
```

## controls-ar-shared

0: arabic-fixed-conditional (provisional ok)
1: arabic-future-combined (provisional ok)
2: retained-fund-ar (provisional fix)
3: concise-supported-fund-ar (provisional ok)
4: retained-metr-ar (provisional fix)
5: concise-supported-metr-ar (provisional ok)

```json
{"results":[{"i":0,"verdict":"ok","issues":[]},{"i":1,"verdict":"ok","issues":[]},{"i":2,"verdict":"ok","issues":[]},{"i":3,"verdict":"fix","issues":["Headline states: 'أنثروبيك تعتزم تخصيص 5% من أسهمها لصندوق منفعة عامة بشرط موافقة المساهمين' which means 'Anthropic intends to allocate 5% of its shares to a public benefit fund subject to shareholder approval.' Source S1 states 'Subject to stockholder approval, 5% of Anthropic’s shares will be committed today,' indicating the commitment is conditional on approval but the wording 'تعتزم تخصيص' ('intends to allocate') is weaker than the actual commitment pending approval. The item body is empty, so the headline alone risks understating the conditional nature and the current commitment status. The smallest fix is to clarify the conditionality explicitly in the headline or add a body sentence reflecting the condition and current status as per S1."]},{"i":4,"verdict":"ok","issues":[]},{"i":5,"verdict":"fix","issues":["Headline states: 'تقييمات METR مستقلة النشر مع حجب معلومات محددة، دون حق لأنثروبيك في نقض النشر' meaning 'METR evaluations are independently published with redaction of specific information, without Anthropic's right to veto publication.' Source S6 clarifies that Anthropic cannot veto publication but can require redaction of certain categories of information, and that Anthropic ultimately decides what falls into these categories, while METR can comment on redactions. Thus, Anthropic does have a limited right to require redactions, which is a form of partial veto. The headline's phrase 'دون حق لأنثروبيك في نقض النشر' ('without Anthropic's right to veto publication') is inaccurate. The fix is to rephrase to indicate Anthropic cannot veto publication but can require redactions of specific sensitive information."]}]}
```

## retained-en-shared

```json
{"results":[{"i":0,"verdict":"ok","issues":[]},{"i":1,"verdict":"ok","issues":[]},{"i":2,"verdict":"ok","issues":[]}]}
```

## retained-en-item-local

```json
{"results":[{"i":0,"verdict":"ok","issues":[]},{"i":1,"verdict":"ok","issues":[]},{"i":2,"verdict":"ok","issues":[]}]}
```

## retained-ar-item-local

```json
{"results":[{"i":0,"verdict":"ok","issues":[]},{"i":1,"verdict":"ok","issues":[]},{"i":2,"verdict":"ok","issues":[]}]}
```

## retained-ar-shared

```json
{"results":[{"i":0,"verdict":"ok","issues":[]},{"i":1,"verdict":"ok","issues":[]},{"i":2,"verdict":"ok","issues":[]}]}
```
