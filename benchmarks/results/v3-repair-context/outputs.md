# Exact outputs: repair recheck context and history presentation

Evaluation only; no live publication or notification. Sources and exact requests in summary.json.

## verify-real-correct-repair-baseline

openai/gpt-4.1-mini; $0.0010080; timed request-through-settlement 2.731s.

```json
{
  "results": [
    {
      "i": 0,
      "verdict": "fix",
      "issues": [
        "إسرائيل أقنعت الولايات المتحدة أخيرًا بشن هجوم على إيران -> إسرائيل أقنعت الولايات المتحدة بشن هجوم على إيران"
      ]
    }
  ]
}
```

## verify-real-correct-repair-context

openai/gpt-4.1-mini; $0.0003684; timed request-through-settlement 2.600s.

```json
{
  "results": [
    {
      "i": 0,
      "verdict": "ok",
      "issues": []
    }
  ]
}
```

## verify-heldout-invalid-repairs-baseline

openai/gpt-4.1-mini; $0.0005256; timed request-through-settlement 2.705s.

```json
{
  "results": [
    {
      "i": 0,
      "verdict": "fix",
      "issues": [
        "License granted -> The licensing board plans to review the proposal next month. It has not granted a license."
      ]
    },
    {
      "i": 1,
      "verdict": "fix",
      "issues": [
        "after either the structural inspector or fire authority signs off -> after both the structural inspector and fire authority sign off"
      ]
    }
  ]
}
```

## verify-heldout-invalid-repairs-context

openai/gpt-4.1-mini; $0.0005812; timed request-through-settlement 1.680s.

```json
{
  "results": [
    {
      "i": 0,
      "verdict": "fix",
      "issues": [
        "License granted -> The licensing board plans to review the proposal next month. It has not granted a license."
      ]
    },
    {
      "i": 1,
      "verdict": "fix",
      "issues": [
        "after either the structural inspector or fire authority signs off -> after both the structural inspector and fire authority sign off"
      ]
    }
  ]
}
```

## verify-heldout-valid-repairs-baseline

openai/gpt-4.1-mini; $0.0004612; timed request-through-settlement 1.475s.

```json
{
  "results": [
    {
      "i": 0,
      "verdict": "ok",
      "issues": []
    },
    {
      "i": 1,
      "verdict": "ok",
      "issues": []
    }
  ]
}
```

## verify-heldout-valid-repairs-context

openai/gpt-4.1-mini; $0.0005180; timed request-through-settlement 1.602s.

```json
{
  "results": [
    {
      "i": 0,
      "verdict": "ok",
      "issues": []
    },
    {
      "i": 1,
      "verdict": "ok",
      "issues": []
    }
  ]
}
```

## editor-history-baseline

openai/gpt-4.1; $0.0087760; timed request-through-settlement 1.970s.

```json
{
  "items": [
    {
      "headline": "رئيس الجمهورية جوزاف عون يزور سرايا طرابلس",
      "body": "وصل رئيس الجمهورية العماد جوزاف عون إلى سرايا طرابلس، وصرح وزير الداخلية أحمد الحجار أن وجود الرئيس في المدينة يؤكد اهتمام الدولة بطرابلس.",
      "sources": [
        "S1"
      ],
      "relation": "new",
      "updates": null,
      "importance": 1
    }
  ],
  "left_out": []
}
```

## editor-history-deduplicated

openai/gpt-4.1; $0.0072780; timed request-through-settlement 3.119s.

```json
{
  "items": [
    {
      "headline": "رئيس الجمهورية جوزاف عون يزور سرايا طرابلس",
      "body": "وصل رئيس الجمهورية العماد جوزاف عون إلى سرايا طرابلس، وصرح وزير الداخلية أحمد الحجار أن وجود الرئيس في المدينة يؤكد اهتمام الدولة بطرابلس.",
      "sources": [
        "S1"
      ],
      "relation": "new",
      "updates": null,
      "importance": 1
    }
  ],
  "left_out": []
}
```
