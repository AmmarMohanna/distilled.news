# Exact writer qualification comparison outputs

Fresh editor-only generations. Not verified, persisted or published briefings. Original full source evidence is preserved in the unchanged corpus.

## lebanon-roundup-en

### baseline

**Lebanon's state electricity company to cut power to public entities with unpaid bills starting November 2**

The board of Electricité du Liban decided to disconnect electricity supply to government administrations, public institutions, and independent agencies that have failed to pay their dues, effective November 2.

Refs: S14

**Israeli airstrike targets outskirts of Barashit near Kounin in southern Lebanon**



Refs: S10

**Large explosion reported in Qantara, southern Lebanon, attributed to Israeli forces**



Refs: S7

**Israeli regional council announces imminent airstrikes on Lebanese front**

The Upper Galilee Regional Council stated that airstrikes will be launched on the Lebanese front in the coming hours, with explosions and aircraft noise expected throughout the area.

Refs: S13

Raw response:

```json
{
  "items": [
    {
      "headline": "Lebanon's state electricity company to cut power to public entities with unpaid bills starting November 2",
      "body": "The board of Electricité du Liban decided to disconnect electricity supply to government administrations, public institutions, and independent agencies that have failed to pay their dues, effective November 2.",
      "sources": ["S14"],
      "relation": "new",
      "updates": null,
      "importance": 1
    },
    {
      "headline": "Israeli airstrike targets outskirts of Barashit near Kounin in southern Lebanon",
      "body": "",
      "sources": ["S10"],
      "relation": "new",
      "updates": null,
      "importance": 1
    },
    {
      "headline": "Large explosion reported in Qantara, southern Lebanon, attributed to Israeli forces",
      "body": "",
      "sources": ["S7"],
      "relation": "new",
      "updates": null,
      "importance": 1
    },
    {
      "headline": "Israeli regional council announces imminent airstrikes on Lebanese front",
      "body": "The Upper Galilee Regional Council stated that airstrikes will be launched on the Lebanese front in the coming hours, with explosions and aircraft noise expected throughout the area.",
      "sources": ["S13"],
      "relation": "new",
      "updates": null,
      "importance": 1
    }
  ],
  "left_out": [
    {
      "sources": ["S1", "S2", "S6"],
      "why": "off-topic; developments concern Jordan, not Lebanon"
    },
    {
      "sources": ["S3"],
      "why": "repeat; Israeli military drills already reported"
    },
    {
      "sources": ["S4"],
      "why": "off-topic; incident in China unrelated to Lebanon"
    },
    {
      "sources": ["S5"],
      "why": "repeat; Brent crude oil price already reported"
    },
    {
      "sources": ["S8"],
      "why": "repeat; explosion in Qantara already covered"
    },
    {
      "sources": ["S9", "S11", "S15"],
      "why": "off-topic; developments concern Iran, US, and Gulf region, not Lebanon"
    },
    {
      "sources": ["S12"],
      "why": "off-topic; attack in Saudi Arabia unrelated to Lebanon"
    }
  ]
}
```

### qualifications

**Lebanon's state electricity company to cut power to public institutions behind on payments starting November 2**

The board of Electricité du Liban decided to disconnect electricity supply to government departments, public institutions, and independent agencies that have not paid their dues, effective November 2.

Refs: S14

**Israeli airstrike targets outskirts of Baraachit near Kounine in southern Lebanon**



Refs: S10

**Large explosion reported in Qantara, southern Lebanon, attributed to Israeli forces**



Refs: S7

**Israeli regional council announces imminent airstrikes on Lebanese front**

The Upper Galilee Regional Council stated that airstrikes on the Lebanese front will be launched in the coming hours, with explosions and aircraft noise expected throughout the area.

Refs: S13

Raw response:

```json
{
  "items": [
    {
      "headline": "Lebanon's state electricity company to cut power to public institutions behind on payments starting November 2",
      "body": "The board of Electricité du Liban decided to disconnect electricity supply to government departments, public institutions, and independent agencies that have not paid their dues, effective November 2.",
      "sources": ["S14"],
      "relation": "new",
      "updates": null,
      "importance": 1
    },
    {
      "headline": "Israeli airstrike targets outskirts of Baraachit near Kounine in southern Lebanon",
      "body": "",
      "sources": ["S10"],
      "relation": "new",
      "updates": null,
      "importance": 1
    },
    {
      "headline": "Large explosion reported in Qantara, southern Lebanon, attributed to Israeli forces",
      "body": "",
      "sources": ["S7"],
      "relation": "new",
      "updates": null,
      "importance": 1
    },
    {
      "headline": "Israeli regional council announces imminent airstrikes on Lebanese front",
      "body": "The Upper Galilee Regional Council stated that airstrikes on the Lebanese front will be launched in the coming hours, with explosions and aircraft noise expected throughout the area.",
      "sources": ["S13"],
      "relation": "new",
      "updates": null,
      "importance": 1
    }
  ],
  "left_out": [
    {
      "sources": ["S1", "S2", "S6"],
      "why": "repeat; no material change compared to already told item about Karak church attack"
    },
    {
      "sources": ["S3"],
      "why": "repeat; Israeli military drills already covered"
    },
    {
      "sources": ["S4"],
      "why": "off-topic; incident in Beijing not relevant to Lebanon's core developments"
    },
    {
      "sources": ["S5"],
      "why": "repeat; Brent crude oil price already covered"
    },
    {
      "sources": ["S8"],
      "why": "repeat; explosion in Qantara already covered"
    },
    {
      "sources": ["S9", "S11", "S12", "S15"],
      "why": "off-topic; developments do not directly affect Lebanon's politics, economy, security, or public services"
    }
  ]
}
```

## lebanon-roundup-ar

### baseline

**مؤسسة كهرباء لبنان تقرر قطع التيار عن الإدارات والمؤسسات العامة المتخلفة عن الدفع ابتداءً من 2 تشرين الثاني**

مجلس إدارة مؤسسة كهرباء لبنان قرر وقف التغذية بالتيار الكهربائي عن الإدارات والمؤسسات العامة والمصالح المستقلة التي لم تسدد مستحقاتها، وذلك اعتباراً من 2 تشرين الثاني.

Refs: S14

**غارة جوية إسرائيلية استهدفت أطراف بلدة برعشيت جنوب لبنان**

أفادت مصادر عن تنفيذ غارة حربية إسرائيلية استهدفت أطراف بلدة برعشيت باتجاه كونين في جنوب لبنان.

Refs: S10

**تفجير ضخم نفذه الجيش الإسرائيلي في بلدة القنطرة جنوب لبنان**

وقع تفجير كبير في بلدة القنطرة جنوب لبنان ونُسب إلى الجيش الإسرائيلي.

Refs: S7, S8

**المجلس الإقليمي للجليل الأعلى يعلن عن شن غارات جوية على الجبهة اللبنانية خلال الساعات المقبلة**

أعلن المجلس الإقليمي للجليل الأعلى أن غارات جوية ستُشن على الجبهة اللبنانية خلال الساعات القادمة، مع توقع سماع دوي الانفجارات وأصوات الطائرات في المنطقة.

Refs: S13

Raw response:

```json
{
  "items": [
    {
      "headline": "مؤسسة كهرباء لبنان تقرر قطع التيار عن الإدارات والمؤسسات العامة المتخلفة عن الدفع ابتداءً من 2 تشرين الثاني",
      "body": "مجلس إدارة مؤسسة كهرباء لبنان قرر وقف التغذية بالتيار الكهربائي عن الإدارات والمؤسسات العامة والمصالح المستقلة التي لم تسدد مستحقاتها، وذلك اعتباراً من 2 تشرين الثاني.",
      "sources": ["S14"],
      "relation": "new",
      "updates": null,
      "importance": 1
    },
    {
      "headline": "غارة جوية إسرائيلية استهدفت أطراف بلدة برعشيت جنوب لبنان",
      "body": "أفادت مصادر عن تنفيذ غارة حربية إسرائيلية استهدفت أطراف بلدة برعشيت باتجاه كونين في جنوب لبنان.",
      "sources": ["S10"],
      "relation": "new",
      "updates": null,
      "importance": 1
    },
    {
      "headline": "تفجير ضخم نفذه الجيش الإسرائيلي في بلدة القنطرة جنوب لبنان",
      "body": "وقع تفجير كبير في بلدة القنطرة جنوب لبنان ونُسب إلى الجيش الإسرائيلي.",
      "sources": ["S7", "S8"],
      "relation": "new",
      "updates": null,
      "importance": 1
    },
    {
      "headline": "المجلس الإقليمي للجليل الأعلى يعلن عن شن غارات جوية على الجبهة اللبنانية خلال الساعات المقبلة",
      "body": "أعلن المجلس الإقليمي للجليل الأعلى أن غارات جوية ستُشن على الجبهة اللبنانية خلال الساعات القادمة، مع توقع سماع دوي الانفجارات وأصوات الطائرات في المنطقة.",
      "sources": ["S13"],
      "relation": "new",
      "updates": null,
      "importance": 2
    }
  ],
  "left_out": [
    {
      "sources": ["S1", "S2", "S6"],
      "why": "أحداث في الأردن؛ خارج نطاق الاهتمام المباشر بلبنان"
    },
    {
      "sources": ["S3"],
      "why": "تكرار لمناورات الجيش الإسرائيلي سبق إبلاغها"
    },
    {
      "sources": ["S4"],
      "why": "حادثة فردية في الصين؛ ليست ذات أهمية مباشرة للبنان"
    },
    {
      "sources": ["S5"],
      "why": "تكرار لخبر ارتفاع سعر النفط سبق إبلاغه"
    },
    {
      "sources": ["S9", "S11", "S12", "S15"],
      "why": "تطورات تخص إيران والسعودية؛ ليست ذات صلة مباشرة بلبنان"
    }
  ]
}
```

### qualifications

**تفجير ضخم نفذه الجيش الإسرائيلي يهز بلدة القنطرة جنوب لبنان**



Refs: S7

**غارة جوية إسرائيلية استهدفت أطراف بلدة برعشيت باتجاه كونين جنوب لبنان**



Refs: S10

**مؤسسة كهرباء لبنان تقرر قطع التيار عن الإدارات والمؤسسات العامة المتخلفة عن الدفع بدءاً من 2 تشرين الثاني**



Refs: S14

**المجلس الإقليمي للجليل الأعلى يعلن عن نية شن غارات جوية على الجبهة اللبنانية خلال الساعات المقبلة**

سيُسمع دوي الانفجارات وأصوات الطائرات في أنحاء المنطقة.

Refs: S13

Raw response:

```json
{
  "items": [
    {
      "headline": "تفجير ضخم نفذه الجيش الإسرائيلي يهز بلدة القنطرة جنوب لبنان",
      "body": "",
      "sources": ["S7"],
      "relation": "new",
      "updates": null,
      "importance": 1
    },
    {
      "headline": "غارة جوية إسرائيلية استهدفت أطراف بلدة برعشيت باتجاه كونين جنوب لبنان",
      "body": "",
      "sources": ["S10"],
      "relation": "new",
      "updates": null,
      "importance": 1
    },
    {
      "headline": "مؤسسة كهرباء لبنان تقرر قطع التيار عن الإدارات والمؤسسات العامة المتخلفة عن الدفع بدءاً من 2 تشرين الثاني",
      "body": "",
      "sources": ["S14"],
      "relation": "new",
      "updates": null,
      "importance": 1
    },
    {
      "headline": "المجلس الإقليمي للجليل الأعلى يعلن عن نية شن غارات جوية على الجبهة اللبنانية خلال الساعات المقبلة",
      "body": "سيُسمع دوي الانفجارات وأصوات الطائرات في أنحاء المنطقة.",
      "sources": ["S13"],
      "relation": "new",
      "updates": null,
      "importance": 2
    }
  ],
  "left_out": [
    {
      "sources": ["S1", "S2", "S6"],
      "why": "تغطية أحداث إطلاق النار في الكرك بالأردن؛ ليست ذات صلة مباشرة بلبنان"
    },
    {
      "sources": ["S3", "S5"],
      "why": "تكرار أو تأكيد لمعلومات سبق إبلاغها"
    },
    {
      "sources": ["S4"],
      "why": "حدث اجتماعي فردي خارج لبنان"
    },
    {
      "sources": ["S8"],
      "why": "تكرار خبر التفجير في القنطرة"
    },
    {
      "sources": ["S9", "S11", "S12", "S15"],
      "why": "تطورات تخص إيران أو السعودية أو تصريحات دولية؛ ليست ذات صلة مباشرة بلبنان"
    }
  ]
}
```

## ai-multisource-en

### baseline

**Anthropic grants employee-like access to METR for independent AI risk evaluation**

Anthropic has begun providing a team from the nonprofit METR with access to internal tools, systems, and information comparable to its own risk assessment teams, excluding certain sensitive categories. METR will independently publish risk assessments of Anthropic's models and practices, with Anthropic able to require redactions only for predefined confidential information. Anthropic is also working with SecureBio, Accenture, and others as evaluators, with varying levels of access and publication rights. This move follows Anthropic's commitment to the White House Accord on Super Intelligence and aims to strengthen independent oversight of AI safety.

Refs: S1

**Anthropic to commit at least 5% of company shares to new Public Benefit Fund**

Anthropic will allocate 5% of its shares to a newly created Anthropic Public Benefit Fund, with the potential to increase by 2% for every 50% rise in company value, subject to board discretion and stockholder approval. The fund, structured as a wholly-owned LLC, will support projects for societal good and will not be used for lobbying or political giving. Combined with prior equity donation commitments, about 20% of Anthropic shares will be dedicated to public benefit. Further details on governance and milestones will be released in the coming months.

Refs: S3, S4

**Replit makes OpenAI its default AI provider, reducing reliance on Anthropic**

Replit's CEO announced that OpenAI's ChatGPT is now the default model for Replit Agent, citing performance, cost, and partnership factors. While Anthropic models remain available for users to select, this change is expected to significantly reduce Replit's spend with Anthropic, as most users stick with the default. There is disagreement about whether the Anthropic partnership has ended, but Replit confirms model agnosticism and continued access to Anthropic's Claude models.

Refs: S2

Raw response:

```json
{
  "items": [
    {
      "headline": "Anthropic grants employee-like access to METR for independent AI risk evaluation",
      "body": "Anthropic has begun providing a team from the nonprofit METR with access to internal tools, systems, and information comparable to its own risk assessment teams, excluding certain sensitive categories. METR will independently publish risk assessments of Anthropic's models and practices, with Anthropic able to require redactions only for predefined confidential information. Anthropic is also working with SecureBio, Accenture, and others as evaluators, with varying levels of access and publication rights. This move follows Anthropic's commitment to the White House Accord on Super Intelligence and aims to strengthen independent oversight of AI safety.",
      "sources": ["S1"],
      "relation": "new",
      "updates": null,
      "importance": 1
    },
    {
      "headline": "Anthropic to commit at least 5% of company shares to new Public Benefit Fund",
      "body": "Anthropic will allocate 5% of its shares to a newly created Anthropic Public Benefit Fund, with the potential to increase by 2% for every 50% rise in company value, subject to board discretion and stockholder approval. The fund, structured as a wholly-owned LLC, will support projects for societal good and will not be used for lobbying or political giving. Combined with prior equity donation commitments, about 20% of Anthropic shares will be dedicated to public benefit. Further details on governance and milestones will be released in the coming months.",
      "sources": ["S3", "S4"],
      "relation": "new",
      "updates": null,
      "importance": 1
    },
    {
      "headline": "Replit makes OpenAI its default AI provider, reducing reliance on Anthropic",
      "body": "Replit's CEO announced that OpenAI's ChatGPT is now the default model for Replit Agent, citing performance, cost, and partnership factors. While Anthropic models remain available for users to select, this change is expected to significantly reduce Replit's spend with Anthropic, as most users stick with the default. There is disagreement about whether the Anthropic partnership has ended, but Replit confirms model agnosticism and continued access to Anthropic's Claude models.",
      "sources": ["S2"],
      "relation": "new",
      "updates": null,
      "importance": 2
    }
  ],
  "left_out": [
    {
      "sources": ["S4"],
      "why": "repeat; no material change"
    }
  ]
}
```

### qualifications

**Anthropic grants employee-like access to METR for independent AI risk evaluation, with publication rights**

Anthropic has begun providing a team from the nonprofit METR with access to internal tools, systems, and information comparable to its own risk assessment teams, excluding certain sensitive categories. METR will publish its risk assessments and analysis of Anthropic's models and practices; Anthropic cannot veto publication but can require redactions in predefined categories. Anthropic is also working with SecureBio, Accenture, and others as evaluators, with varying levels of access and publication rights. The company is developing a three-tiered access system for evaluators, aiming to embed more independent evaluators over time.

Refs: S1

**Anthropic commits 5% of shares to new Public Benefit Fund, with potential for further increases tied to company growth**

Anthropic will allocate 5% of its shares to the Anthropic Public Benefit Fund, a wholly-owned LLC, subject to stockholder approval. The fund's stake will increase by 2% for every 50% rise in company value above a set baseline, at the board's discretion. The fund is intended to support societal good, including possible large donations or direct distributions, and will not be used for lobbying or political giving. Combined with prior equity donation commitments, about 20% of Anthropic shares will be dedicated to public benefit, with potential for more if valuation milestones are met.

Refs: S3, S4

**Replit makes OpenAI its default AI provider, reducing Anthropic's role but retaining model access**

Replit's CEO announced that OpenAI's ChatGPT is now the default AI model on its platform, citing performance, cost, and partnership factors. Anthropic models remain available, but most users are expected to use the default, likely reducing Replit's spend with Anthropic. The partnership with Anthropic is not entirely ended, and Replit describes itself as model agnostic. Previously, Replit was a top-five customer for Anthropic.

Refs: S2

Raw response:

```json
{
  "items": [
    {
      "headline": "Anthropic grants employee-like access to METR for independent AI risk evaluation, with publication rights",
      "body": "Anthropic has begun providing a team from the nonprofit METR with access to internal tools, systems, and information comparable to its own risk assessment teams, excluding certain sensitive categories. METR will publish its risk assessments and analysis of Anthropic's models and practices; Anthropic cannot veto publication but can require redactions in predefined categories. Anthropic is also working with SecureBio, Accenture, and others as evaluators, with varying levels of access and publication rights. The company is developing a three-tiered access system for evaluators, aiming to embed more independent evaluators over time.",
      "sources": ["S1"],
      "relation": "new",
      "updates": null,
      "importance": 1
    },
    {
      "headline": "Anthropic commits 5% of shares to new Public Benefit Fund, with potential for further increases tied to company growth",
      "body": "Anthropic will allocate 5% of its shares to the Anthropic Public Benefit Fund, a wholly-owned LLC, subject to stockholder approval. The fund's stake will increase by 2% for every 50% rise in company value above a set baseline, at the board's discretion. The fund is intended to support societal good, including possible large donations or direct distributions, and will not be used for lobbying or political giving. Combined with prior equity donation commitments, about 20% of Anthropic shares will be dedicated to public benefit, with potential for more if valuation milestones are met.",
      "sources": ["S3", "S4"],
      "relation": "new",
      "updates": null,
      "importance": 1
    },
    {
      "headline": "Replit makes OpenAI its default AI provider, reducing Anthropic's role but retaining model access",
      "body": "Replit's CEO announced that OpenAI's ChatGPT is now the default AI model on its platform, citing performance, cost, and partnership factors. Anthropic models remain available, but most users are expected to use the default, likely reducing Replit's spend with Anthropic. The partnership with Anthropic is not entirely ended, and Replit describes itself as model agnostic. Previously, Replit was a top-five customer for Anthropic.",
      "sources": ["S2"],
      "relation": "new",
      "updates": null,
      "importance": 2
    }
  ],
  "left_out": [
    {
      "sources": ["S4"],
      "why": "repeat; no material change"
    }
  ]
}
```

## ai-multisource-ar

### baseline

**Anthropic تمنح فريق METR حق الوصول الشبيه بالموظفين لتقييم المخاطر بشكل مستقل**

أعلنت Anthropic أنها بدأت في منح فريق من منظمة METR غير الربحية، التي تقيّم نماذج الذكاء الاصطناعي المتقدمة، حق الوصول الشبيه بالموظفين إلى أنظمتها وأدواتها الداخلية لتقييم المخاطر بشكل مستقل. سيقوم METR بنشر نتائج تقييماته علنًا دون إمكانية Anthropic في الاعتراض على النشر، مع إمكانية طلب حذف معلومات محددة فقط. كما تعمل Anthropic مع SecureBio وAccenture كمقيمين، وتجري محادثات أولية مع منظمات أخرى مثل Hugging Face. تهدف الشركة إلى تطوير ثلاث مستويات من الوصول للمقيمين المستقلين، مع توسيع الشفافية والمساءلة حول سلامة نماذجها.

Refs: S1

**Replit تعتمد OpenAI كشريك افتراضي بدلاً من Anthropic وتقلل من استخدام نماذجها**

أعلن الرئيس التنفيذي لشركة Replit أن الشركة لم تعد تعتمد على Anthropic كشريك رئيسي، وأن OpenAI أصبحت المزود الافتراضي لنماذج الذكاء الاصطناعي في منصتها، وذلك لأسباب تتعلق بالأداء والتكلفة والشراكة. رغم ذلك، لا تزال نماذج Anthropic متاحة للعملاء الذين يختارونها يدويًا، لكن هذا التغيير قد يؤدي إلى تقليص كبير في إنفاق Replit مع Anthropic. هناك تضارب في التصريحات حول استمرار الشراكة، حيث أكد مصدر مطلع أن الشراكة لا تزال قائمة.

Refs: S2

**Anthropic تؤسس صندوق منفعة عامة وتخصص له 5% من أسهمها مع إمكانية زيادة الحصة مع نمو الشركة**

أعلنت Anthropic عن تأسيس صندوق منفعة عامة جديد وتخصيص 5% من أسهمها له، مع إمكانية إضافة 2% إضافية لكل زيادة بنسبة 50% في قيمة الشركة فوق حد معين، وذلك بعد موافقة المساهمين. يهدف الصندوق إلى دعم مشاريع ذات منفعة مجتمعية بمرونة أكبر، مثل التبرعات الكبرى للمنظمات غير الربحية أو التوزيعات المباشرة لفئات محددة. لن تُستخدم أسهم الصندوق في الأنشطة السياسية أو الضغط. مع هذا الإعلان، سيُخصص حوالي 20% من أسهم Anthropic للمنفعة العامة عند احتساب التبرعات السابقة من المؤسسين والموظفين.

Refs: S3

Raw response:

```json
{
  "items": [
    {
      "headline": "Anthropic تمنح فريق METR حق الوصول الشبيه بالموظفين لتقييم المخاطر بشكل مستقل",
      "body": "أعلنت Anthropic أنها بدأت في منح فريق من منظمة METR غير الربحية، التي تقيّم نماذج الذكاء الاصطناعي المتقدمة، حق الوصول الشبيه بالموظفين إلى أنظمتها وأدواتها الداخلية لتقييم المخاطر بشكل مستقل. سيقوم METR بنشر نتائج تقييماته علنًا دون إمكانية Anthropic في الاعتراض على النشر، مع إمكانية طلب حذف معلومات محددة فقط. كما تعمل Anthropic مع SecureBio وAccenture كمقيمين، وتجري محادثات أولية مع منظمات أخرى مثل Hugging Face. تهدف الشركة إلى تطوير ثلاث مستويات من الوصول للمقيمين المستقلين، مع توسيع الشفافية والمساءلة حول سلامة نماذجها.",
      "sources": ["S1"],
      "relation": "new",
      "updates": null,
      "importance": 1
    },
    {
      "headline": "Replit تعتمد OpenAI كشريك افتراضي بدلاً من Anthropic وتقلل من استخدام نماذجها",
      "body": "أعلن الرئيس التنفيذي لشركة Replit أن الشركة لم تعد تعتمد على Anthropic كشريك رئيسي، وأن OpenAI أصبحت المزود الافتراضي لنماذج الذكاء الاصطناعي في منصتها، وذلك لأسباب تتعلق بالأداء والتكلفة والشراكة. رغم ذلك، لا تزال نماذج Anthropic متاحة للعملاء الذين يختارونها يدويًا، لكن هذا التغيير قد يؤدي إلى تقليص كبير في إنفاق Replit مع Anthropic. هناك تضارب في التصريحات حول استمرار الشراكة، حيث أكد مصدر مطلع أن الشراكة لا تزال قائمة.",
      "sources": ["S2"],
      "relation": "new",
      "updates": null,
      "importance": 1
    },
    {
      "headline": "Anthropic تؤسس صندوق منفعة عامة وتخصص له 5% من أسهمها مع إمكانية زيادة الحصة مع نمو الشركة",
      "body": "أعلنت Anthropic عن تأسيس صندوق منفعة عامة جديد وتخصيص 5% من أسهمها له، مع إمكانية إضافة 2% إضافية لكل زيادة بنسبة 50% في قيمة الشركة فوق حد معين، وذلك بعد موافقة المساهمين. يهدف الصندوق إلى دعم مشاريع ذات منفعة مجتمعية بمرونة أكبر، مثل التبرعات الكبرى للمنظمات غير الربحية أو التوزيعات المباشرة لفئات محددة. لن تُستخدم أسهم الصندوق في الأنشطة السياسية أو الضغط. مع هذا الإعلان، سيُخصص حوالي 20% من أسهم Anthropic للمنفعة العامة عند احتساب التبرعات السابقة من المؤسسين والموظفين.",
      "sources": ["S3"],
      "relation": "new",
      "updates": null,
      "importance": 1
    }
  ],
  "left_out": [
    {
      "sources": ["S4"],
      "why": "تكرار؛ لا تغيير جوهري عن S3"
    }
  ]
}
```

### qualifications

**أنثروبيك تمنح فريق METR المستقل وصولاً شبيهاً بالموظفين لتقييم مخاطر الذكاء الاصطناعي**

أعلنت أنثروبيك أنها بدأت منح فريق من منظمة METR غير الربحية وصولاً شبيهاً بالموظفين إلى أنظمتها وأدواتها الداخلية لتقييم مخاطر نماذج الذكاء الاصطناعي المتقدمة لديها. سيقوم فريق METR بنشر نتائج تقييماته بشكل مستقل، ولا تملك أنثروبيك حق الاعتراض على النشر، لكنها تستطيع طلب حذف معلومات محددة ضمن فئات سرية مسبقة التعريف. تشمل الشراكة ستة موظفين من METR، مع استمرار التعاون مع جهات أخرى مثل SecureBio وAccenture في مراحل وصول أقل. تهدف أنثروبيك إلى توسيع عدد المقيمين المستقلين مستقبلاً.

Refs: S1

**أنثروبيك تؤسس صندوق منفعة عامة وتخصص له 5% من أسهمها مع إمكانية زيادة الحصة مع نمو الشركة**

أعلنت أنثروبيك التزامها بتخصيص 5% من أسهمها لصندوق منفعة عامة جديد، مع إضافة 2% إضافية لكل زيادة بنسبة 50% في قيمة الشركة فوق خط أساس محدد، وذلك بعد موافقة المساهمين. سيتيح الصندوق مرونة أكبر لدعم مشاريع ذات منفعة مجتمعية، مثل التبرعات الكبيرة للمنظمات غير الربحية أو التوزيعات المباشرة لفئات محددة. لن تُستخدم أسهم الصندوق في أنشطة الضغط السياسي. مع هذا الإعلان، سيصل إجمالي الأسهم المخصصة للمنفعة العامة إلى نحو 20%، مع إمكانية زيادتها مستقبلاً.

Refs: S3

**Replit تعتمد OpenAI شريكاً افتراضياً بدلاً من أنثروبيك وتبقي نماذجها متاحة للعملاء**

أعلن الرئيس التنفيذي لشركة Replit أن OpenAI أصبحت الشريك الافتراضي لتشغيل Replit Agent بدلاً من أنثروبيك، لأسباب تتعلق بالأداء والتكلفة والشراكة. رغم ذلك، تظل نماذج أنثروبيك متاحة للعملاء الذين يختارونها، لكن التحول قد يقلل بشكل كبير من إنفاق Replit مع أنثروبيك. كان Replit سابقاً من أكبر خمسة عملاء لأنثروبيك.

Refs: S2

Raw response:

```json
{
  "items": [
    {
      "headline": "أنثروبيك تمنح فريق METR المستقل وصولاً شبيهاً بالموظفين لتقييم مخاطر الذكاء الاصطناعي",
      "body": "أعلنت أنثروبيك أنها بدأت منح فريق من منظمة METR غير الربحية وصولاً شبيهاً بالموظفين إلى أنظمتها وأدواتها الداخلية لتقييم مخاطر نماذج الذكاء الاصطناعي المتقدمة لديها. سيقوم فريق METR بنشر نتائج تقييماته بشكل مستقل، ولا تملك أنثروبيك حق الاعتراض على النشر، لكنها تستطيع طلب حذف معلومات محددة ضمن فئات سرية مسبقة التعريف. تشمل الشراكة ستة موظفين من METR، مع استمرار التعاون مع جهات أخرى مثل SecureBio وAccenture في مراحل وصول أقل. تهدف أنثروبيك إلى توسيع عدد المقيمين المستقلين مستقبلاً.",
      "sources": ["S1"],
      "relation": "new",
      "updates": null,
      "importance": 1
    },
    {
      "headline": "أنثروبيك تؤسس صندوق منفعة عامة وتخصص له 5% من أسهمها مع إمكانية زيادة الحصة مع نمو الشركة",
      "body": "أعلنت أنثروبيك التزامها بتخصيص 5% من أسهمها لصندوق منفعة عامة جديد، مع إضافة 2% إضافية لكل زيادة بنسبة 50% في قيمة الشركة فوق خط أساس محدد، وذلك بعد موافقة المساهمين. سيتيح الصندوق مرونة أكبر لدعم مشاريع ذات منفعة مجتمعية، مثل التبرعات الكبيرة للمنظمات غير الربحية أو التوزيعات المباشرة لفئات محددة. لن تُستخدم أسهم الصندوق في أنشطة الضغط السياسي. مع هذا الإعلان، سيصل إجمالي الأسهم المخصصة للمنفعة العامة إلى نحو 20%، مع إمكانية زيادتها مستقبلاً.",
      "sources": ["S3"],
      "relation": "new",
      "updates": null,
      "importance": 1
    },
    {
      "headline": "Replit تعتمد OpenAI شريكاً افتراضياً بدلاً من أنثروبيك وتبقي نماذجها متاحة للعملاء",
      "body": "أعلن الرئيس التنفيذي لشركة Replit أن OpenAI أصبحت الشريك الافتراضي لتشغيل Replit Agent بدلاً من أنثروبيك، لأسباب تتعلق بالأداء والتكلفة والشراكة. رغم ذلك، تظل نماذج أنثروبيك متاحة للعملاء الذين يختارونها، لكن التحول قد يقلل بشكل كبير من إنفاق Replit مع أنثروبيك. كان Replit سابقاً من أكبر خمسة عملاء لأنثروبيك.",
      "sources": ["S2"],
      "relation": "new",
      "updates": null,
      "importance": 2
    }
  ],
  "left_out": [
    {
      "sources": ["S4"],
      "why": "تكرار؛ لا تغيير جوهري عن S3"
    }
  ]
}
```
