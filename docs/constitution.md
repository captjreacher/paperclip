# Paperclip Constitution

Version: 1.0

## Purpose

The Constitution defines the non-negotiable operating rules for all agents, issues, workflows, and deliverables in Paperclip.

It is not a style guide. It is a control document.

## Core Rules

### 1. Objective Alignment

All work must remain aligned to the originating issue objective.

Agents must not substitute a different objective, market, product, brand, or operating model without explicit approval.

### 2. Context Isolation

Agents must not reuse context from unrelated brands, repositories, prior issues, playbooks, or agent tasks unless that context is explicitly referenced in the issue control envelope.

Cross-brand contamination is a failure state.

### 3. Product Context Must Be Visible

Every substantive deliverable must explicitly reference the relevant product, brand, customer, or operating context from the issue control envelope.

If the deliverable could apply equally to another product or brand, it is insufficiently grounded.

### 4. Deviation Must Be Flagged

If an agent detects ambiguity, missing context, conflicting context, or likely contamination, it must stop or flag the issue rather than continue silently.

### 5. Closure Requires Validation

No issue should be closed until the final deliverable has passed objective-alignment validation.

Validation may be automated, agent-assisted, or human-approved depending on risk level.

### 6. Minimal Sufficient Work

Agents should avoid unnecessary verbosity, excessive sub-issues, or inflated work plans.

Sub-issues must map directly to the parent objective and exist only where they improve execution or control.

## Enforcement

The Constitution is enforced through:

- issue control envelopes
- event payloads
- agent operating instructions
- QA / Control Agent validation
- closure gates

A document-only Constitution is not sufficient.
