---
title: Gemini Local
summary: Gemini CLI local adapter setup and configuration
---

The `gemini_local` adapter runs Google's Gemini CLI locally. It supports session persistence with `--resume`, skills injection, and structured `stream-json` output parsing.

## Prerequisites

- Gemini CLI installed (`gemini` command available)
- `GEMINI_API_KEY` / `GOOGLE_API_KEY` set, or local Gemini CLI Google-account auth configured

For Google Workspace, Gemini Code Assist, Google AI Pro, or Ultra quota, use Gemini CLI's Google-account login path rather than an API key. If the Paperclip server has `GEMINI_API_KEY` in its environment, set this adapter's `authMode` to `google_account`; Paperclip will pass `GOOGLE_GENAI_USE_GCA=true` so Gemini CLI uses the cached Google login / Code Assist entitlement instead of API-key quota. Workspace accounts may also require `googleCloudProject`.

## Configuration Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `cwd` | string | Yes | Working directory for the agent process (absolute path; created automatically if missing when permissions allow) |
| `model` | string | No | Gemini model to use. Defaults to `auto`. |
| `authMode` | string | No | `auto` or `google_account`. `google_account` forces Gemini CLI Google account / Workspace / Code Assist auth. |
| `googleCloudProject` | string | No | Google Cloud project ID passed as `GOOGLE_CLOUD_PROJECT` for Workspace / Code Assist accounts. |
| `promptTemplate` | string | No | Prompt used for all runs |
| `instructionsFilePath` | string | No | Markdown instructions file prepended to the prompt |
| `env` | object | No | Environment variables (supports secret refs) |
| `timeoutSec` | number | No | Process timeout (0 = no timeout) |
| `graceSec` | number | No | Grace period before force-kill |
| `yolo` | boolean | No | Pass `--approval-mode yolo` for unattended operation |
| `extraArgs` | string[] | No | Additional Gemini CLI flags. Do not include prompt text or `-p` / `--prompt`; Paperclip supplies the non-interactive prompt on stdin. |

## Session Persistence

The adapter persists Gemini session IDs between heartbeats. On the next wake, it resumes the existing conversation with `--resume` so the agent retains context.

Session resume is cwd-aware: if the working directory changed since the last run, a fresh session starts instead.

If resume fails with an unknown session error, the adapter automatically retries with a fresh session.

## Skills Injection

The adapter symlinks Paperclip skills into the Gemini global skills directory (`~/.gemini/skills`). Existing user skills are not overwritten.

## Environment Test

Use the "Test Environment" button in the UI to validate the adapter config. It checks:

- Gemini CLI is installed and accessible
- Working directory is absolute and available (auto-created if missing and permitted)
- API key/auth hints (`GEMINI_API_KEY`, `GOOGLE_API_KEY`, or Google-account auth mode)
- A live hello probe (`gemini --output-format stream-json --prompt "Respond with hello."`) to verify CLI readiness

Agent runs invoke Gemini with `--prompt ""` and send the rendered Paperclip prompt on stdin. This avoids Windows command-line quoting and length issues for large multi-line prompts.

## Workspace Setup

Google's Gemini CLI docs state that Workspace and Code Assist accounts can need a `GOOGLE_CLOUD_PROJECT` with the Gemini for Cloud API enabled and appropriate IAM access. In Paperclip, configure:

```json
{
  "authMode": "google_account",
  "googleCloudProject": "your-project-id"
}
```

Then run `gemini auth login` outside Paperclip using the same Workspace account.
