# Exact verifier responses — November 3

Frozen source/label cases: quantity-commitment-cases.json. AI-assisted labels, not human gold.

## en / baseline

- **0 — retained-v6-up-to**: expected fix; returned **ok**.
- **1 — retained-v4-now-completed**: expected fix; returned **ok**.
- **2 — concise-fixed-conditional**: expected ok; returned **fix**.
  - The item states 'The commitment is subject to stockholder approval.' but S1 says 'Subject to stockholder approval, 5% of Anthropic’s shares will be committed today,' implying the commitment is announced but conditional, not just proposed. S2 also says 'Anthropic announced today that it’s creating a “public benefit fund” that will give the company “increased flexibility and scale” to support projects for societal good. Anthropic said that it will commit 5% of its shares to the fund — structured as a wholly-owned entity within the company — with the option to contribute an additional 2%...' This indicates the commitment is announced but subject to approval, not merely proposed. The wording should clarify that the commitment is announced but subject to approval, not just proposed.
- **3 — headline-only-conditional**: expected ok; returned **fix**.
  - The item headline states 'Anthropic will commit 5% of its shares to a benefit fund if stockholders approve' but the body is empty. The body should at least mention that the commitment is subject to stockholder approval, as supported by S1 and S2.
- **4 — future-combined**: expected ok; returned **fix**.
  - The headline states 'Roughly 20% of Anthropic shares will be dedicated to public benefit if the new plan is approved' but the body is empty. The body should mention that this 20% includes prior commitments by founders and employees plus the new fund, as supported by S1 and S2.
- **5 — announcement-versus-execution**: expected ok; returned **fix**.
  - The headline states 'Anthropic has announced a proposed 5% share commitment' but the body is only 'Stockholder approval is required.' The headline should say 'committed 5% of shares subject to stockholder approval' or similar, because S1 and S2 say the commitment is announced but conditional, not merely proposed.
- **6 — existing-pledges**: expected ok; returned **fix**.
  - The headline states 'Anthropic founders and employees already pledged equity before the new fund proposal' but the body is empty. The body should mention that co-founders pledged 80% of their equity and about half of employees participate in an equity donation match program, as supported by S1 and S2.
- **7 — ambiguous-committed-pledge**: expected unresolved (excluded); returned **fix**.
  - The headline states 'Anthropic committed 5% of its shares to a benefit fund' but the body says 'The allocation is subject to stockholder approval.' S1 and S2 say the commitment is announced but subject to approval, so 'committed' is too strong without qualification. The headline should say 'Anthropic to commit 5% of its shares subject to stockholder approval' or similar.
- **8 — valid-up-to**: expected ok; returned **ok**.
- **9 — valid-completed**: expected ok; returned **ok**.
- **10 — invalid-up-to-fixed**: expected fix; returned **ok**.
- **11 — invalid-future-completed**: expected fix; returned **fix**.
  - The headline states 'The foundation has transferred 5% of its shares' but S5 says 'The foundation will transfer exactly 5% of its shares if its board approves.' There is no confirmation that the transfer has occurred. The headline should say 'The foundation will transfer 5% of its shares if the board approves.'

## en / quantity-and-commitment

- **0 — retained-v6-up-to**: expected fix; returned **ok**.
- **1 — retained-v4-now-completed**: expected fix; returned **ok**.
- **2 — concise-fixed-conditional**: expected ok; returned **fix**.
  - Anthropic proposes a 5% share commitment to its Public Benefit Fund -> Anthropic proposes to commit 5% of its shares to its Public Benefit Fund, subject to stockholder approval
- **3 — headline-only-conditional**: expected ok; returned **fix**.
  - Anthropic will commit 5% of its shares to a benefit fund if stockholders approve -> Anthropic will propose to commit 5% of its shares to a benefit fund, subject to stockholder approval
- **4 — future-combined**: expected ok; returned **fix**.
  - Roughly 20% of Anthropic shares will be dedicated to public benefit if the new plan is approved -> Roughly 20% of Anthropic shares are expected to be dedicated to public benefit if the new plan is approved
- **5 — announcement-versus-execution**: expected ok; returned **fix**.
  - Anthropic has announced a proposed 5% share commitment -> Anthropic has announced a proposal to commit 5% of its shares
- **6 — existing-pledges**: expected ok; returned **ok**.
- **7 — ambiguous-committed-pledge**: expected unresolved (excluded); returned **fix**.
  - Anthropic committed 5% of its shares to a benefit fund -> Anthropic has proposed to commit 5% of its shares to a benefit fund, subject to stockholder approval
- **8 — valid-up-to**: expected ok; returned **ok**.
- **9 — valid-completed**: expected ok; returned **drop**.
  - The foundation has transferred 5% of its shares -> This is about a fictional foundation, not Anthropic, and is unsupported for Anthropic
- **10 — invalid-up-to-fixed**: expected fix; returned **fix**.
  - The foundation will transfer up to 5% of its shares if the board approves -> The foundation may transfer up to 5% of its shares if the board approves
- **11 — invalid-future-completed**: expected fix; returned **drop**.
  - The foundation has transferred 5% of its shares -> This is about a fictional foundation, not Anthropic, and is unsupported for Anthropic

## ar / baseline

- **0 — arabic-fixed-conditional**: expected ok; returned **ok**.
- **1 — arabic-future-combined**: expected ok; returned **ok**.

## ar / quantity-and-commitment

- **0 — arabic-fixed-conditional**: expected ok; returned **fix**.
  - يبقى التخصيص مشروطاً بموافقة المساهمين -> التخصيص الأولي 5% مشروط بموافقة المساهمين، مع إمكانية إضافة 2% إضافية لكل زيادة 50% في قيمة الشركة، حسب تقدير مجلس الإدارة
- **1 — arabic-future-combined**: expected ok; returned **ok**.
