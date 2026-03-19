# GitHub Environments Setup

## Required environments in GitHub repository settings

### `qa`
- No required reviewers (auto-deploy on push to `qa`)
- Deployment branch: `qa` only

Required secrets:
- `QA_DATABASE_URL`
- `QA_API_URL`
- `QA_DEPLOY_TOKEN`
- `ENCRYPTION_KEY`

### `production`
- Required reviewers: 1 (team lead or senior dev)
- Deployment branch: `main` only
- Wait timer: 0 min (approval is the gate)

Required secrets:
- `PROD_DATABASE_URL`
- `PROD_API_URL`
- `PROD_DEPLOY_TOKEN`
- `ENCRYPTION_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`

## Branch protection rules

### `main`
- Require PR before merging
- Require status checks: `validate`
- Require branches to be up to date
- Restrict pushes: only via PR (no direct push)
- Require linear history: NO (we use merge commits for production)

### `qa`
- Require PR before merging
- Require status checks: `validate`
- Restrict pushes: only via PR or `gw promote`
