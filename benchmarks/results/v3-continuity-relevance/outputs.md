# Exact continuity and relevance outputs

Unpublished editor drafts. No verifier calls. Oil-source text stays private; synthetic controls are labelled in the frozen preflight.

## real-oil-repeat — baseline

No items selected.

Omissions:
```json
[
  {
    "sources": [
      "S1"
    ],
    "why": "repeat of told item"
  }
]
```

## real-oil-repeat — candidate

No items selected.

Omissions:
```json
[
  {
    "sources": [
      "S1"
    ],
    "why": "repeat of told item"
  }
]
```

## synthetic-occurrence-update-correction — baseline

### Second explosion at North Market injures three

Police report a separate explosion at North Market at 10:00 on October 23, injuring three people. This incident is distinct from the October 22 explosion at the same location.

Sources: ["S1"]; relation: new; prior link: null

### Harbor rail service resumes after repairs

The transit authority says Harbor rail service resumed at 10:00 on October 23 after engineers repaired the signalling fault that had suspended service earlier that morning.

Sources: ["S3"]; relation: update; prior link: "prior-service"

### East Bank evacuation figure corrected to fifty residents

The fire service has corrected its earlier East Bank evacuation figure from five residents to fifty, citing a reporting error. This is not fifty additional evacuations.

Sources: ["S4"]; relation: correction; prior link: "prior-evacuation"

Omissions:
```json
[
  {
    "sources": [
      "S2"
    ],
    "why": "repeat of told item"
  }
]
```

## synthetic-occurrence-update-correction — candidate

### Three injured in second North Market explosion

Police report a separate explosion at North Market at 10:00 on October 23, injuring three people. This incident is distinct from the October 22 explosion at the same location.

Sources: ["S1"]; relation: new; prior link: null

### Harbor rail service resumes after repairs

The transit authority says Harbor rail service resumed at 10:00 on October 23 after engineers repaired the signalling fault.

Sources: ["S3"]; relation: update; prior link: "prior-service"

### East Bank evacuation figure corrected to fifty residents

The fire service has corrected its earlier East Bank evacuation figure from five to fifty residents, citing a reporting error.

Sources: ["S4"]; relation: correction; prior link: "prior-evacuation"

Omissions:
```json
[
  {
    "sources": [
      "S2"
    ],
    "why": "repeat of told item"
  }
]
```

## real-lebanon-ambiguous-repeat — baseline

No items selected.

Omissions:
```json
[
  {
    "sources": [
      "S1"
    ],
    "why": "تكرار لما أُبلغ به القارئ سابقاً"
  },
  {
    "sources": [
      "S2"
    ],
    "why": "خارج الموضوع (لا يتعلق بتطورات لبنان)"
  }
]
```

## real-lebanon-ambiguous-repeat — candidate

No items selected.

Omissions:
```json
[
  {
    "sources": [
      "S1"
    ],
    "why": "تكرار لما أُبلغ به القارئ سابقاً"
  },
  {
    "sources": [
      "S2"
    ],
    "why": "خارج الموضوع"
  }
]
```

## real-lebanon-relevance-en — baseline

### Low-flying drone reported over Haret Saida

A drone was reported flying at very low altitude over Haret Saida. No further details were provided.

Sources: ["S4"]; relation: new; prior link: null

Omissions:
```json
[
  {
    "sources": [
      "S1"
    ],
    "why": "off-topic: Israeli political commentary, no direct Lebanon development"
  },
  {
    "sources": [
      "S2"
    ],
    "why": "off-topic: Iran-U.S. drone incident, no Lebanon connection"
  },
  {
    "sources": [
      "S3"
    ],
    "why": "off-topic: Strait of Hormuz and ceasefire statements, no Lebanon-specific development"
  }
]
```

## real-lebanon-relevance-en — candidate

### Low-flying drone reported over Haret Saida

A drone was reported flying at very low altitude over Haret Saida, according to local sources on October 25, 2026.

Sources: ["S4"]; relation: new; prior link: null

Omissions:
```json
[
  {
    "sources": [
      "S1"
    ],
    "why": "off-topic: Israeli political developments without direct Lebanon impact"
  },
  {
    "sources": [
      "S2"
    ],
    "why": "off-topic: Iranian report of US drone downing over Bandar Abbas, no Lebanon link"
  },
  {
    "sources": [
      "S3"
    ],
    "why": "off-topic: statements on Strait of Hormuz and ceasefire, no Lebanon-specific development"
  }
]
```

## real-lebanon-relevance-ar — baseline

### تحليق طائرة مسيّرة على علو منخفض فوق حارة صيدا

أفادت تقارير بتحليق طائرة مسيّرة على علو منخفض جداً فوق منطقة حارة صيدا في لبنان، دون ذكر تفاصيل إضافية عن الجهة أو الأضرار.

Sources: ["S4"]; relation: new; prior link: null

Omissions:
```json
[
  {
    "sources": [
      "S1"
    ],
    "why": "تطور سياسي إسرائيلي داخلي، لا أثر مباشر على لبنان"
  },
  {
    "sources": [
      "S2"
    ],
    "why": "حادث عسكري بين إيران والولايات المتحدة، لا صلة مباشرة بلبنان"
  },
  {
    "sources": [
      "S3"
    ],
    "why": "تصريحات حول مضيق هرمز ووقف إطلاق النار، لا صلة مباشرة بلبنان"
  }
]
```

## real-lebanon-relevance-ar — candidate

### تحليق طائرة مسيّرة على علو منخفض فوق حارة صيدا

أفادت تقارير بتحليق طائرة مسيّرة على علو منخفض جداً فوق منطقة حارة صيدا في لبنان، دون ذكر تفاصيل إضافية عن الجهة أو الأهداف.

Sources: ["S4"]; relation: new; prior link: null

Omissions:
```json
[
  {
    "sources": [
      "S1"
    ],
    "why": "تطور سياسي إسرائيلي داخلي، لا أثر مباشر على لبنان"
  },
  {
    "sources": [
      "S2"
    ],
    "why": "حادث إسقاط طائرة مسيّرة فوق إيران، لا صلة مباشرة بلبنان"
  },
  {
    "sources": [
      "S3"
    ],
    "why": "تصريحات حول مضيق هرمز ووقف إطلاق النار، لا تطور مباشر يخص لبنان"
  }
]
```
