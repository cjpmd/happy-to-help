# Gumption

Gumption (working name) helps early-stage founders run their startup with an AI cofounder, Sol, powered by Claude. Sol does marketing, admin, compliance and simple website builds overnight; founders approve every external action; university and incubator mentors oversee their cohorts.

The product name lives in one place: `src/lib/brand.ts`.

## Documents

- `docs/SPEC.md`: what the product should do
- `docs/PHASES.md`: the delivery plan
- `docs/STATUS.md`: what's done, mocked or missing right now
- `CLAUDE.md`: how we work, and the rules the code must follow

## Run it locally

You need Node.js 22 and npm. This project uses npm only: commit `package-lock.json` and don't add another package manager's lockfile.

```sh
npm ci
npm run dev
```

Checks to run before pushing:

```sh
npx tsc --noEmit
npm test
npm run lint
npm run build
```

## Lovable

The UI was started in [Lovable](https://lovable.dev/projects/f68f0353-2157-41a9-85f3-be3d786a6f70), and commits to `main` sync back to the Lovable editor. Don't edit in Lovable and Claude Code at the same time, and pull before starting work.
