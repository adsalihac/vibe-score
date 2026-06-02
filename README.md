# VibeScore

VibeScore is a cinematic developer product that investigates GitHub repositories and generates a forensic investigation report instead of a traditional analytics dashboard.

## Overview

VibeScore analyzes repository structure, code patterns, documentation quality, testing signals, and maintainability indicators to produce a shareable cyber-dossier style report.

## Features

- Single-page forensic experience with mission-control style UI
- GitHub repository URL intake and automated investigation flow
- Default branch, named branch, and pull request scan scopes
- Animated terminal-like live investigation logs
- AST-assisted code pattern analysis
- AI assistance likelihood estimation (never hard certainty)
- Secret hygiene review with redacted token-pattern detection
- Documentation evidence detection and scoring
- Maintainability and architecture review sections
- Technical debt index with contextual findings
- Testing readiness confidence with framework detection
- Risk assessment and final production-readiness verdict
- Prioritized remediation plan with impact, effort, and evidence
- Shareable report card with PNG export and social sharing
- Repo comparison mode with side-by-side deltas
- Explainable findings with evidence references
- Rule packs (Startup, Enterprise, OSS) for weighted scoring
- Historical scan trends with previous-scan deltas and organization snapshots
- CI-ready summary endpoint and scheduled scan workflow snippet
- Export bundle with PDF + JSON downloads
- Public badge for README or dashboard embedding

## Tech Stack

- Next.js 16
- TypeScript
- Tailwind CSS
- Framer Motion
- Prisma
- PostgreSQL
- GitHub API
- Babel parser and traverse for AST analysis

## Getting Started

1. Install dependencies:

```bash
npm install
```

2. Copy environment template:

```bash
cp .env.example .env
```

3. Update .env values, especially DATABASE_URL and optional GIT_TOKEN.

   - DATABASE_URL is required for historical trends, organization snapshots, and badges.

4. Generate Prisma client:

```bash
npx prisma generate
```

5. Run the development server:

```bash
npm run dev
```

6. Open http://localhost:3000.

## Scripts

- npm run dev: Start development server
- npm run lint: Run ESLint
- npm run build: Create production build
- npm run start: Start production server

## Contributions

Contributions are welcome.

1. Fork the repository.
2. Create a feature branch.
3. Make your changes with clear commits.
4. Run lint and build checks before opening a PR.
5. Open a pull request describing the problem and your solution.

### Contribution Guidelines

- Keep UI consistent with the cyber-investigation visual direction.
- Prefer small, focused pull requests.
- Add or update tests where applicable.
- Do not claim deterministic AI detection; keep language probabilistic.

## License

This project is licensed under the MIT License. See the LICENSE file for details.
