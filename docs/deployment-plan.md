# Protest Service Hosting & Deployment Plan

This document outlines hosting and deployment options for the Protest Service API and scraper, along with recommended infrastructure, automation, and operational practices.

## 1. Application Overview

The project is a Node.js + Express API with automated protest scrapers, TypeScript build step, and MongoDB database. It ships with Docker support (`Dockerfile`) and a Docker Compose stack that runs the API container plus MongoDB. Key runtime requirements are:

- Node.js 20 runtime to execute the compiled server (`dist/server.js`).
- MongoDB 7 database.
- Environment variables for Mongo connection, JWT secret, and auth configuration.
- Ability to run scheduled scraper/import commands (`npm run import`, `npm run scrape`).

## 2. Deployment Goals

1. Reliable public API hosting (port 3000).
2. Managed MongoDB with backups and monitoring.
3. Automated build & deploy pipeline on pushes to main branch.
4. Scheduled job to execute scraper/import to keep data fresh.
5. Observability (logs, error alerts) and secrets management.

## 3. Hosting Options

### Option A – Managed Container Platform (Recommended)

Use a service such as **Render**, **Railway**, or **Fly.io** to run the API container, paired with MongoDB Atlas.

- **Build & Deploy**: Push to GitHub; platform builds using `Dockerfile` and runs `node dist/server.js` (already defined in the Docker image).
- **Database**: Provision MongoDB Atlas cluster; configure `MONGODB_URI` secret.
- **Secrets**: Set `JWT_SECRET`, `JWT_EXPIRES_IN`, and OAuth credentials in platform secrets UI.
- **Scaling**: Start with 1 instance (0.5–1 CPU, 512–1024MB RAM). Enable auto-restart on failure.
- **Cron/Scheduler**:
  - Render/Railway: create a "cron job" resource that runs `npm run import -- --days 40` nightly.
  - Fly.io: deploy a discrete app for cron using `flyctl launch` and schedule with Fly Machines or GitHub Actions workflow.
- **Pros**: Simple operations, HTTPS & custom domain support, metrics, auto deploys.
- **Cons**: Monthly cost (~$10–25 for app + db), vendor lock-in.

### Option B – Kubernetes / Self-managed Cloud

Run both API and MongoDB on a Kubernetes cluster (e.g., DigitalOcean, AWS EKS, GKE).

- Use Docker image from the repo.
- Deploy API as a Deployment + Service; configure HorizontalPodAutoscaler if needed.
- MongoDB as StatefulSet with persistent volume or use Atlas to avoid self-managing state.
- CronJob resource executes scraper container on schedule (`npm run import`).
- Requires CI/CD to build/push images (GitHub Actions -> container registry).
- Pros: Flexibility, multi-service support, can run scrapers as separate pods.
- Cons: Significant ops overhead.

### Option C – Docker Compose on VM

Use `docker-compose.yml` on a VM (e.g., Hetzner, DigitalOcean droplet).

- Install Docker & Docker Compose on Ubuntu.
- Copy repository and run `docker compose up -d --build`.
- Use `systemd` or cron to ensure Compose restarts on reboot and to run `docker compose run --rm api npm run import` nightly.
- Set up reverse proxy (NGINX + Caddy) for HTTPS.
- Pros: Low cost.
- Cons: Manual maintenance, must handle security updates, monitoring, and backups.

## 4. Recommended Production Setup (Option A)

1. **Repository & Branching**
   - Main branch triggers CI pipeline.
   - Use GitHub Actions for lint/test (`npm test`).

2. **CI/CD Pipeline**
   - Workflow steps:
     1. Checkout
     2. Install dependencies (`npm ci`)
     3. Run tests (`npm test`)
     4. Build TypeScript (`npm run build`)
     5. Build Docker image, push to registry (optional if platform builds from Dockerfile).
     6. Trigger deployment via platform integration (Render deploy hook / Railway service auto deploy).

3. **Infrastructure**
   - **API Service**: Single container using Dockerfile; scale vertically as load grows.
   - **MongoDB**: Atlas M0/M2 cluster with IP whitelist pointing to platform's outbound IPs.
   - **Storage**: Use Atlas backups; optionally export to S3.
   - **Environment variables** (set in platform dashboard):
     - `MONGODB_URI`
     - `JWT_SECRET`
     - `JWT_EXPIRES_IN`
     - OAuth-related secrets (Google, Apple) if needed.
     - `PORT=3000` (platform may inject automatically).

4. **Cron / Background Jobs**
   - Schedule nightly `npm run import -- --days 40` to refresh data.
   - Optionally schedule hourly `npm run scrape` to update file exports if still required.
   - Jobs run using same container image with command override.

5. **Logging & Monitoring**
   - Enable platform log drains to services like Logtail or Datadog.
   - Configure health checks on `/api/protests?days=1` endpoint.
   - Set alerts for high error rates or failed cron jobs.

6. **Security**
   - Enforce HTTPS via platform-managed TLS certificates.
   - Rotate JWT secrets and OAuth credentials periodically.
   - Configure CORS in the API to only allow trusted origins.
   - Monitor dependencies with Dependabot and `npm audit`.

7. **Disaster Recovery**
   - Use MongoDB Atlas continuous backups.
   - Export protests collection weekly to object storage as JSON.
   - Document recovery steps (restore DB, redeploy container, re-seed environment variables).

## 5. Development & Staging

- Create a staging environment mirroring production (separate Atlas cluster, smaller instance).
- Use Git branches to deploy to staging before merging to main.
- Run integration tests against staging DB snapshot.

## 6. Future Enhancements

- Implement CI/CD pipeline defined in roadmap (GitHub Actions) for automated testing and deployments.
- Add infrastructure-as-code (Terraform) to manage cloud resources reproducibly.
- Introduce message queue (e.g., BullMQ with Redis) if scraper volume grows and needs asynchronous processing.
- Evaluate serverless cron (GitHub Actions schedule, Cloudflare Workers Cron) for scraping to reduce costs.

---

This plan provides a pragmatic path to production for the Protest Service while keeping operations maintainable and secure.
