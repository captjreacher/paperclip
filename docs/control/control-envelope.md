# Control Envelope (control.v1)

## Purpose

The control envelope ensures every issue is anchored to a defined objective and validated before closure.

## Schema

```json
{
  "control": {
    "schema_version": "control.v1",
    "constitution_version": "1.0",
    "objective_id": "string",
    "objective_summary": "string",
    "brand_context": {
      "brand": "string",
      "product": "string",
      "positioning": "string"
    },
    "allowed_context": ["string"],
    "forbidden_context": ["string"],
    "required_output_elements": ["string"],
    "required_terms": ["string"],
    "forbidden_terms_or_patterns": ["string"],
    "validation": {
      "required": true,
      "closure_gate": true,
      "minimum_score": 0.85
    }
  }
}
```

## Rules

- Must be present at issue creation.
- Must propagate to all downstream events.
- Must be used by QA agent for validation.

## Principle

Context defines knowledge.
Control defines truth.
