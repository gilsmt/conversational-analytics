# AGENTS.md

This document provides essential guidance for AI agents contributing to this codebase.

## Project overview

Full-stack application that extracts insights from AI conversations and lets users explore those insights through a chat interface. Built with a Next.js frontend and FastAPI backend, it manages custom insights and qualifying questions, runs LLM-powered analysis on conversation datasets, and provides a scoped chat interface (all conversations vs single) for ad-hoc discovery beyond predefined insights.

## On React components

Always build React components following full `building-components`, `vercel-composition-patterns` and `vercel-react-best-practices` rules.

Every component should be co-located into a single file with its parts, and should use a common, composable interface, making them predictable.

Use the `useTimeout` utility from `@base-ui/utils/useTimeout` instead of `window.setTimeout`, and `useAnimationFrame` from `@base-ui/utils/useAnimationFrame` instead of `requestAnimationFrame`.

Use the `useStableCallback` utility from `@base-ui/utils/useStableCallback` instead of `React.useCallback` if the function is called within an effect or event handler. The utility cannot be used to memoize functions that are called directly in the body of a component (during render), so continue with `React.useCallback` in those scenarios.

Use the `useIsoLayoutEffect` utility from `@base-ui/utils/useIsoLayoutEffect` instead of `React.useLayoutEffect`.

Use the shadow DOM-safe utilities for DOM traversal and event targeting: `contains`, `getTarget`, and `activeElement`. Use the owner utilities `ownerDocument` and `ownerWindow` instead of global `document`/`window` lookups when the code is tied to a DOM node, including realm-sensitive checks such as `instanceof`.

Avoid duplicating logic where necessary: If two components can share logic (such as event handlers), define the logic/handlers in the parent and share it through a context to the child; use the existing context if it exists.

## Use uv run for Python Commands

CRITICAL: Always prefix Python commands with uv run when working in the environment. This ensures:

- The correct Python version (3.14) is used
- All project dependencies are available
- Environment variables are properly loaded
- Commands run in the correct virtual environment context

## Import Organization

- imports at module top: Import statements like from sqlalchemy import update, select should be at the top of the file, not inside methods or functions.
- Follow modular structure: Import models from .models, services from their respective modules, following the established patterns.
- Dependency injection: Use FastAPI's dependency injection system for repositories and services.

Accept domain objects over IDs: Repository methods should prefer accepting domain objects (e.g., Order) instead of just UUIDs when the calling code already has the object.

## Preferred

async def release_payment_lock(self, order: Order, *, flush: bool = False) -> Order:
    return await self.update(order, update_dict={"payment_lock_acquired_at": None}, flush=flush)

## Avoid when object is available

async def release_payment_lock(self, order_id: UUID) -> None:
    # ...
Return updated objects: Repository methods should return updated domain objects to provide the caller with the latest state.

Use flush parameters: Include flush: bool = False parameters for controlling transaction boundaries. It should always be a keyword argument, after * to avoid confusion.

Inherit from RepositoryBase: Follow the established repository inheritance patterns.

## Service Layer Standards

Proper exception handling: Use appropriate HTTP status codes in custom exceptions:
409 for conflicts (e.g., PaymentAlreadyInProgress)
422 for validation errors
404 for not found errors
class PaymentAlreadyInProgress(OrderError):
    def __init__(self, order: Order) -> None:
        self.order = order
        message = f"Payment for order {order.id} is already in progress"
        super().__init__(message, 409)  # Include status code
Meaningful error messages: Include relevant entity IDs and context in error messages for debugging.
Async patterns: Use proper async/await patterns with SQLAlchemy sessions.
Session management: Use dependency injection for database sessions, don't create sessions manually.

## Exception Handling Standards

Inherit from appropriate base classes: Custom exceptions should inherit from domain-specific error classes (e.g., OrderError).
Include HTTP status codes: Pass status codes as the second parameter to the parent constructor for known errors.
Contextual information: Store relevant domain objects as attributes for error handling and logging.
SQLAlchemy & Database Standards
Use ORM patterns consistently: Prefer SQLAlchemy ORM methods over raw SQL.
Session management: Use AsyncSession with proper dependency injection.
Repository patterns: Encapsulate database logic in repository classes inheriting from RepositoryBase.
In most cases, you should never call session.commit() directly in business logic. We have established patterns for that: the API backend automatically commits the session at the end of each request, and background workers commit the session at the end of each task. It avoids to have a database in an inconsistent state in case of exceptions. If you have a session.commit() in your code, it's likely a mistake. Otherwise, please explicitly document why it's necessary.

If you need to ensure that data is flushed to the database, to run constraints or fill server defaults, use session.flush() instead. Bear in mind though that it might not be necessary, as SQLAlchemy automatically flushes pending changes before read operations.
