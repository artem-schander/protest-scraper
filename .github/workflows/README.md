# GitHub Actions Workflows

This directory contains CI/CD workflows for automated testing.

## Workflows

### 1. `test.yml` - Continuous Integration
**Triggers:** Push or PR to `main` branch
**Purpose:** Run unit and integration tests on every code change

**What it does:**
- ✅ Installs dependencies
- ✅ Builds the project
- ✅ Runs unit tests (`yarn test:unit`)
- ✅ Runs integration tests (`yarn test:integration`)
- ✅ Generates coverage report
- ❌ **Blocks deployment if tests fail** (gate job)

**Status:** Required check - PRs cannot be merged if this fails

### 2. `e2e.yml` - Nightly Parser Validation
**Triggers:** Cron schedule (2 AM UTC daily) + manual dispatch
**Purpose:** Validate parsers against real external APIs

**What it does:**
- 🌐 Runs E2E tests calling **real external APIs**
- 🔍 Detects when upstream sources change structure
- 📝 **Automatically creates GitHub issue** on failure
- 📊 Uploads test results as artifacts (30-day retention)

**Schedule:** Every night at 2:00 AM UTC

## Setup Instructions

### 1. Enable Workflows

1. Push these workflow files to your repository
2. Go to **Settings → Actions → General**
3. Enable "Allow all actions and reusable workflows"

### 2. Configure Branch Protection (Recommended)

To prevent webhook/deployment on test failure:

1. Go to **Settings → Branches → Add branch protection rule**
2. Branch name pattern: `main`
3. Check **"Require status checks to pass before merging"**
4. Search and select: `Test Gate`
5. Check **"Require branches to be up to date before merging"**
6. Save changes

This ensures:
- PRs cannot be merged if tests fail
- Direct pushes to main are blocked if tests fail
- Deployment webhooks won't trigger on failed tests

### 3. Optional: Add Secrets for Notifications

If you want Slack/Discord notifications on E2E failures:

1. Go to **Settings → Secrets and variables → Actions**
2. Add secret: `SLACK_WEBHOOK_URL` (or `DISCORD_WEBHOOK_URL`)
3. Uncomment the notification section in `e2e.yml`

### 4. Manual Workflow Triggers

Both workflows support manual triggers:

1. Go to **Actions** tab
2. Select workflow (Tests or E2E)
3. Click **"Run workflow"**
4. Choose branch and run

## Workflow Status Badges

Add these badges to your README:

```markdown
![Tests](https://github.com/your-username/protest-scraper/workflows/Tests%20(Unit%20+%20Integration)/badge.svg)
![E2E](https://github.com/your-username/protest-scraper/workflows/E2E%20Tests%20(Nightly)/badge.svg)
```

## Monitoring E2E Test Failures

When E2E tests fail:

1. **Automatic issue created** with label `e2e-failure`
2. Check the issue for:
   - Date of failure
   - Link to workflow run
   - Suggested next steps
3. Review workflow logs for specific parser failures
4. Test parsers locally: `yarn test:e2e`
5. Update parser or tests as needed
6. Close the issue once fixed

## Cost Considerations

- **Free tier:** 2,000 minutes/month (Linux runners)
- **Unit/Integration tests:** ~2 min per run
- **E2E tests:** ~3 min per run (30 runs/month = 90 min)
- **Total estimated:** ~100-150 min/month (well within free tier)

## Debugging Workflows

### View logs:
1. Go to **Actions** tab
2. Click on workflow run
3. Click on job name (e.g., "Run Unit and Integration Tests")
4. Expand step to see detailed logs

### Download E2E results:
1. Go to failed E2E workflow run
2. Scroll to **Artifacts** section
3. Download `e2e-results-{run-number}`
4. Open log file to see detailed failure info

## Customization

### Change E2E schedule:
Edit `e2e.yml` cron expression:
```yaml
schedule:
  - cron: '0 2 * * *'  # 2 AM UTC daily
  # - cron: '0 */6 * * *'  # Every 6 hours
  # - cron: '0 0 * * 0'    # Weekly on Sunday
```

### Add more test types:
```yaml
- name: Run performance tests
  run: yarn test:perf

- name: Run security audit
  run: yarn audit
```

### Skip workflow on certain paths:
```yaml
on:
  push:
    paths-ignore:
      - '**.md'
      - 'docs/**'
```
