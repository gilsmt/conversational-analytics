# Security Policy

## Supported versions

This project is a portfolio/demo application and is not actively maintained. Fixes
are applied to the latest revision on the default branch only.

## Reporting a vulnerability

Please do not open a public issue for security problems.

Instead, use GitHub's private reporting form
(`Security` → `Report a vulnerability`) on this repository. Include:

- what the issue is and which component is affected
- steps to reproduce
- the impact you believe it has

You can expect an acknowledgement within a few days. Because this is an
unmaintained portfolio project, a fix may not be possible — if so, the report
will be acknowledged and documented.

## Scope and known limitations

These are design decisions, not vulnerabilities, but they are worth knowing:

- **No authentication or authorization.** Every API route under `/api/v1` is
  open to anyone who can reach the server. There are no users, roles, or
  per-workspace isolation.
- **Wildcard CORS.** The API allows any origin.
- **LLM prompt injection.** Transcript content is sent to Gemini for analysis and
  for chat tool context. A malicious transcript could influence the model's
  output. All Gemini tools exposed to the model are read-only.
- **Bound to `127.0.0.1` by default.** The dev server listens on loopback, which
  keeps it off the local network. Do not change this to `0.0.0.0` unless you put
  authentication in front of it.

Run this locally only.