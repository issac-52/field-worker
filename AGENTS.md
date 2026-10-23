# Field Work Manager — Codex working agreement

## Read first
Read `docs/PROJECT_CONTEXT.md`, `docs/REQUIREMENTS.md`, and `docs/DECISIONS_AND_PORTFOLIO.md` if present. Inspect the **actual working tree** before making implementation claims. Historical documents and earlier starter ZIPs may differ from the current code; current code and verified tests take precedence for implementation status.

## Collaboration
- The developer leads domain modeling, database design, and core business logic. Act as senior reviewer, debugger, and pair programmer.
- Do not implement or refactor core business logic without an explicit request. When asked for a review, report findings and recommended changes, without silently editing files.
- Work on actual project needs; do not introduce hypothetical quizzes or exercises.
- Prefer minimal, comprehensible changes that fit the 2026-11-14 deadline and ~20 users. Avoid speculative microservices, generic abstractions, and infrastructure additions.
- When proposing a design: state rationale, alternatives, trade-offs, and status (proposed/decided/implemented/tested).
- Before changing a Flyway migration, check whether it has already run against any database. Never wipe a DB or run `docker compose down -v` without explicit approval.
- Do not expose or commit credentials, access keys, names/addresses from customer spreadsheets, or photos. Use fictitious sample data for tests, docs, and public portfolio.
- Run relevant tests if possible; report exact commands and results. Do not claim success for unrun tests.

## Testing policy

- When adding features or fixing bugs, create or update relevant tests as part of the same change.
- Verify that existing tests still cover the updated requirements and expected behavior.
- Prefer JUnit 5 for Java business logic tests.
- Test API authorization, input validation, error handling, and expected HTTP responses.
- Test frontend API contracts, state changes, and user interactions where applicable.
- Use fictional test data. Never include real personal information, credentials, or production data in tests.
- Run relevant tests and builds after making changes. Report the exact commands executed and their results.
- Never delete failing tests, weaken assertions, or skip tests solely to make the test suite pass.
- If tests cannot be executed, clearly explain why and identify what remains unverified.
- Do not modify or refactor developer-owned core business logic without explicit approval, even when fixing failing tests.


## Agreed technical direction
- Java 21, Spring Boot 3.5.x, Gradle, Spring Data JPA, PostgreSQL 17, Flyway, Spring Security.
- Package root: `com.meter.fieldwork`; package by feature / modular monolith; local `user`, `auth`, `worksite`, `inspection`, `photo`, `settlement`, `audit`, `excel`, `report`, plus minimal `global`.
- React + Vite + TypeScript mobile-first frontend, Cloudflare Pages hosting, existing private R2 for images, NAVER Maps for map/geocoding.
- AWS EC2 + Docker Compose PostgreSQL in production; Spring profiles (`local`, `prod`) and external secrets.
- `user` package first; domain-specific service/repository, cross-domain APIs only as needed, port/adapter at external storage or HWP boundaries when valuable.
- Grafana Cloud/Actuator are later enhancements, not prerequisites for MVP.

## Documentation discipline
On each **material real** design decision or resolved production/development issue, propose or (if authorized) append an entry to `docs/DECISIONS_AND_PORTFOLIO.md`. Keep decision vs implementation vs validation distinct. Record measurements only when measured. Do not rewrite the developer's choices as AI achievements.

## Suggested response format for code reviews
1. Blocking correctness/security issues (with file:line).
2. Smallest recommended changes and why.
3. Optional improvements clearly labeled.
4. Tests to run.
