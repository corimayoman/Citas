# Development Workflow

> One-command workflow for safe, low-friction daily development.

---

## Setup (once per clone)

```bash
bash .workflow/install-hooks.sh
```

This installs Git hooks that enforce branch protection, commit format, and secret detection.

---

## Daily usage

### Start a new request

```bash
gw start feature/add-mfa
gw start fix/login-redirect
gw start fix/GCO-42-booking-bug
gw start hotfix/payment-crash
```

What happens automatically:
- Fetches all remote branches
- Updates the base branch (`qa` for features/fixes, `main` for hotfixes)
- Creates your working branch from the updated base
- Leaves you ready to work

### Push your changes

```bash
gw push
```

What happens automatically:
1. Fetches latest remote state
2. Rebases your branch onto the base branch
3. Runs TypeScript, lint, and tests
4. Shows a summary of commits
5. Asks **once**: "Everything is ready. Push?"

### Check current state

```bash
gw status
```

### Re-sync mid-work (without pushing)

```bash
gw sync
```

---

## Promotion flow

```
feature/xxx  →  qa  →  main
```

### Feature → QA

```bash
gw promote qa
```

Squash-merges your feature branch into `qa`. One clean commit per feature. Triggers QA deployment automatically.

### QA → Production

```bash
gw promote prod
```

Merge-commits `qa` into `main` with a release tag. Triggers production deployment. Requires manual approval in GitHub.

### Hotfix (critical production bug)

```bash
gw start hotfix/payment-crash
# ... fix the bug ...
gw push
gw promote hotfix
```

Merges into `main` AND backports to `qa` automatically.

---

## Branch naming

| Type | Pattern | Base branch |
|------|---------|-------------|
| New feature | `feature/<description>` | `qa` |
| Bug fix | `fix/<description>` | `qa` |
| Critical fix | `hotfix/<description>` | `main` |
| Maintenance | `chore/<description>` | `qa` |
| Documentation | `docs/<description>` | `qa` |

With ticket ID: `feature/GCO-42-add-mfa`, `fix/GCO-99-login-bug`

---

## Commit messages

Follows [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add MFA support
fix: correct login redirect
fix(auth): resolve token expiry edge case
feat(GCO-42): implement booking wizard
chore: update dependencies
hotfix: fix payment crash on null profile
```

The `commit-msg` hook enforces this automatically.

---

## Merge strategy

| Context | Strategy | Reason |
|---------|----------|--------|
| Feature → base (push) | **Rebase** | Clean linear history, no noise |
| Feature → QA (promote) | **Squash merge** | One commit per feature on QA |
| QA → Production | **Merge commit** | Auditable release boundary |
| Hotfix → main/qa | **Merge commit** | Traceable emergency fix |

### Why rebase for daily work?

- Keeps feature branch history linear and readable
- Detects conflicts early (before PR)
- No "Merge branch 'qa' into feature/xxx" noise
- `--force-with-lease` makes it safe (won't overwrite others' work)

---

## Validations (run automatically before push)

| Check | When |
|-------|------|
| TypeScript (backend) | Every push |
| TypeScript (frontend) | Every push |
| Lint | Every push (if configured) |
| Tests | Every push |
| Build | Optional (set `RUN_BUILD=true` in config) |
| Secret detection | Every commit (pre-commit hook) |
| Branch protection | Every commit (pre-commit hook) |
| Commit format | Every commit (commit-msg hook) |

---

## CI/CD

| Event | Pipeline | Result |
|-------|----------|--------|
| Push to any feature branch | `ci.yml` — validate | Must pass before PR |
| PR opened against `qa` or `main` | `ci.yml` — validate + PR title check | Required status check |
| Push to `qa` | `deploy-qa.yml` | Auto-deploy to QA |
| Push to `main` | `deploy-prod.yml` | Deploy to Production (requires approval) |

---

## Safety guards

| Guard | Mechanism |
|-------|-----------|
| No direct commits to `main`/`qa` | `pre-commit` hook + branch protection |
| No force-push to protected branches | `pre-push` hook + branch protection |
| No secrets in commits | `pre-commit` hook scans staged files |
| No stale code | `gw start` always pulls before branching |
| No broken code pushed | `gw push` runs validations before confirming |
| No accidental production deploy | GitHub environment requires manual approval |
| Rebase conflicts caught early | `gw push` rebases before asking for confirmation |

---

## Configuration

Edit `.workflow/config.sh` to adjust:

```bash
RUN_LINT=true
RUN_TESTS=true
RUN_BUILD=false       # enable for stricter push checks
RUN_TYPECHECK=true
MERGE_STRATEGY="rebase"
```

---

## Quick reference

```bash
gw start feature/my-task    # start new work
gw sync                     # update from base mid-work
gw push                     # validate + push (one confirmation)
gw promote qa               # send to QA
gw promote prod             # release to production
gw promote hotfix           # emergency fix to prod + qa
gw status                   # see current state
gw validate                 # run checks only
gw pr                       # open PR (requires GitHub CLI)
```
