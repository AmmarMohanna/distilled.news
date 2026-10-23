# Exact editor outputs — warning-selection comparison

Evaluation drafts only; not verified or published editions. Real corpus and synthetic controls are labelled separately. Source refs resolve through the exact request saved in summary.json.

## editor-real-baseline-en

Model: openai/gpt-4.1. Cost: $0.008066. Request-through-settlement elapsed: 3.578s.

### Electricité du Liban to cut power to public entities with unpaid bills from November 2

The board of Electricité du Liban decided to cut electricity supply to government administrations, public institutions, and independent agencies that have not paid their dues, starting November 2.

Sources: S4. Relation: new.

### Israeli regional council announces imminent airstrikes on Lebanese front

The Upper Galilee Regional Council stated it will launch airstrikes on the Lebanese front in the coming hours, warning that explosions and aircraft noise will be heard in the area.

Sources: S3. Relation: new.

Omissions:

- S1: off-topic: US-Iran speculation, no direct Lebanon impact
- S2: off-topic: attack in Saudi Arabia, no Lebanon connection

## editor-real-candidate-en

Model: openai/gpt-4.1. Cost: $0.008124. Request-through-settlement elapsed: 3.547s.

### Electricité du Liban to cut power to public entities with unpaid bills from November 2

The board of Electricité du Liban decided to cut electricity supply to government administrations, public institutions, and independent agencies that have failed to pay their dues, starting November 2.

Sources: S4. Relation: new.

### Israeli regional council announces imminent airstrikes on Lebanese front

The Upper Galilee Regional Council stated it will launch airstrikes on the Lebanese front in the coming hours, warning that explosions and aircraft noise will be heard in the area.

Sources: S3. Relation: new.

Omissions:

- S1: off-topic
- S2: off-topic

## editor-real-baseline-ar

Model: openai/gpt-4.1. Cost: $0.008322. Request-through-settlement elapsed: 4.720s.

### مؤسسة كهرباء لبنان تقرر قطع التيار عن الإدارات المتخلفة عن السداد

قرر مجلس إدارة مؤسسة كهرباء لبنان قطع التغذية بالتيار الكهربائي عن الإدارات والمؤسسات العامة والمصالح المستقلة التي لم تسدد مستحقاتها، وذلك اعتبارًا من 2 تشرين الثاني.

Sources: S4. Relation: new.

### المجلس الإقليمي للجليل الأعلى يعلن عن غارات جوية مرتقبة على الجبهة اللبنانية

أعلن المجلس الإقليمي للجليل الأعلى أنه سيتم شن غارات جوية على الجبهة اللبنانية خلال الساعات المقبلة، مع توقع سماع دوي الانفجارات وأصوات الطائرات في المنطقة.

Sources: S3. Relation: new.

Omissions:

- S1: لا يوجد تطور مباشر أو قرار جديد يخص لبنان
- S2: خارج نطاق لبنان

## editor-real-candidate-ar

Model: openai/gpt-4.1. Cost: $0.008540. Request-through-settlement elapsed: 2.915s.

### مؤسسة كهرباء لبنان تقرر قطع التيار عن الإدارات المتخلفة عن السداد

قرر مجلس إدارة مؤسسة كهرباء لبنان قطع التغذية بالتيار الكهربائي عن الإدارات والمؤسسات العامة والمصالح المستقلة التي لم تسدد مستحقاتها، وذلك اعتباراً من 2 تشرين الثاني.

Sources: S4. Relation: new.

### المجلس الإقليمي للجليل الأعلى يعلن عن غارات جوية مرتقبة على الجبهة اللبنانية

أعلن المجلس الإقليمي للجليل الأعلى أنه سيشن غارات جوية على الجبهة اللبنانية خلال الساعات المقبلة، مع توقع سماع دوي الانفجارات وأصوات الطائرات في أنحاء المنطقة.

Sources: S3. Relation: new.

Omissions:

- S1: لا صلة مباشرة أو تطور مؤكد يخص لبنان
- S2: خارج نطاق لبنان

## editor-controls-baseline-en

Model: openai/gpt-4.1. Cost: $0.005538. Request-through-settlement elapsed: 4.905s.

### Evacuation order corrected: quarry neighbourhood not included

Emergency management corrected its evacuation order, stating the quarry neighbourhood is not subject to evacuation. The riverbank and station neighbourhoods remain under evacuation.

Sources: S3. Relation: correction of evac.

### Hillside access road may collapse; residents urged to avoid it

The Riverton fire service warned that the hillside access road may collapse overnight after heavy rain and urged residents to avoid it until engineers inspect the area.

Sources: S1. Relation: new.

Omissions:

- S2: superseded by correction in S3
- S4: repeat of told item
- S5: routine, not public safety or service
- S6: off-topic speculation

## editor-controls-candidate-en

Model: openai/gpt-4.1. Cost: $0.006172. Request-through-settlement elapsed: 3.162s.

### Evacuation order corrected: quarry neighbourhood not included

Emergency management corrected its evacuation order, stating the quarry neighbourhood is not subject to evacuation. The riverbank and station neighbourhoods remain under the order.

Sources: S3. Relation: correction of evac.

### Fire service warns hillside access road may collapse

The Riverton fire service warned the hillside access road may collapse overnight after heavy rain and urged residents to avoid it until engineers inspect.

Sources: S1. Relation: new.

Omissions:

- S2: corrected by S3
- S4: repeat of told item
- S5: routine
- S6: off-topic

## editor-controls-baseline-ar

Model: openai/gpt-4.1. Cost: $0.006450. Request-through-settlement elapsed: 3.322s.

### تحديث أمر الإخلاء: الحي النهري ومحطة القطار فقط

أعلنت إدارة الطوارئ أن أمر الإخلاء يشمل الآن حي النهر ومحطة القطار فقط، بعد تصحيح إشعار سابق كان قد شمل حي المحجر بالخطأ.

Sources: S3. Relation: update of evac.

### تحذير من انهيار طريق التل في ريفرتون

حذرت خدمة الإطفاء في ريفرتون من احتمال انهيار طريق التل بعد الأمطار الغزيرة، ودعت السكان لتجنبه حتى انتهاء الفحص الهندسي.

Sources: S1. Relation: new.

Omissions:

- S2: تغطيها تصحيح S3
- S4: تكرار إشعار سابق
- S5: نشاط روتيني غير متعلق بالسلامة العامة
- S6: تعليق غير موثوق وغير مرتبط بريفرتون

## editor-controls-candidate-ar

Model: openai/gpt-4.1. Cost: $0.006588. Request-through-settlement elapsed: 3.498s.

### تحديث أمر الإخلاء: الحي النهري ومحطة القطار فقط

أعلنت إدارة الطوارئ تصحيحًا لأمر الإخلاء: يشمل الآن حي النهر ومحطة القطار فقط، بينما أُزيل حي المحجر من القائمة.

Sources: S3. Relation: update of evac.

### تحذير من احتمال انهيار طريق التل في ريفرتون

حذرت خدمة الإطفاء من احتمال انهيار طريق التل بعد الأمطار الغزيرة، ودعت السكان لتجنبه حتى انتهاء الفحص الهندسي.

Sources: S1. Relation: new.

Omissions:

- S2: تغطيها تصحيح S3
- S4: تكرار إشعار سابق
- S5: حدث روتيني غير متعلق بالسلامة العامة
- S6: تعليق غير موثوق وغير مرتبط بريفرتون

