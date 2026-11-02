# Contributing to Conversational Analytics

Thanks for taking the time to look at this project. Issues and pull requests are
welcome.

## Reporting bugs

Please include your OS, Node version, pnpm version, and Python version, plus the
steps needed to reproduce the problem. If the issue is backend-specific, include
the relevant traceback from `uv run task api`.

## Suggesting changes

1. Open an issue first for anything larger than a small fix, so we can agree on
   the approach before you write code.
2. Keep pull requests focused. Unrelated refactors make review harder.
3. Match the surrounding style — Biome for TypeScript, Ruff for Python. Running
   the commands below should produce no diff.

## Before you open a pull request

The project intentionally has no automated test suite, so the checks below plus
a manual pass are the review criteria.

```bash
# Backend
cd packages/server
uv run ruff check .
uv run ruff format --check .

# Frontend
cd ../..
pnpm lint:client
pnpm type-check:client
pnpm --filter client build
```

Then exercise the affected flow manually — import, insight/question CRUD, an
analysis run and cancel, the dashboard, both chat scopes, and stream stop.

## Guidelines

- Never commit `.env` or any real credentials. `.env.template` files are the
  only environment files that belong in the repo.
- Use synthetic data for anything you add under `Conversations/`.
- No authentication exists by design; this is a local-only tool. Do not expose
  it to a public network as-is.