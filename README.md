# EduEllen.com — AWS CDK Infrastructure

Static site for **eduellen.com** hosted on S3 + CloudFront using AWS CDK (TypeScript).

## Architecture

```
Browser
  │
  ▼
CloudFront (HTTPS, PriceClass 100 — EU+NA)
  │   ACM certificate (eduellen.com + www.eduellen.com)
  │   Security headers (CSP, HSTS, X-Frame-Options …)
  │   HTTP/2 + HTTP/3
  │
  ▼
S3 Bucket (private, OAC only)
  │
  ▼
Static HTML / CSS / assets

Route 53 → A + AAAA alias records → CloudFront
```

**Monthly cost estimate (low traffic):**
| Resource | Cost |
|---|---|
| S3 storage (1 GB) | ~$0.023 |
| S3 requests (PUT/GET) | ~$0.01 |
| CloudFront data (10 GB) | ~$0.85 |
| CloudFront requests (1M) | ~$0.01 |
| Route 53 hosted zone | $0.50 |
| ACM certificate | Free |
| **Total** | **~$1.40 / month** |

Cost scales linearly with traffic. The PriceClass 100 setting limits edge locations to Europe and North America, which covers the Irish audience and reduces per-GB cost.

## Prerequisites

- Node.js 18+ and npm
- AWS CDK v2: `npm install -g aws-cdk`
- AWS CLI configured: `aws configure` or `aws sso login`
- AWS account **556036327386** with Route 53 hosted zone for `eduellen.com`

## First-time setup

```bash
cd infra
npm install
```

Bootstrap CDK (once per account/region):
```bash
npx cdk bootstrap aws://556036327386/us-east-1
```

## Deploy

```bash
# Preview changes
npx cdk diff

# Deploy (creates/updates all AWS resources)
npx cdk deploy
```

CloudFormation outputs after deploy:
- `DistributionDomain` — use this URL immediately (before DNS cuts over)
- `SiteUrl` — https://eduellen.com (live once DNS propagates)

## Add your website files

Put HTML, CSS, images and other static files in `../website/`.

The CDK deployment copies everything in that folder to S3 and invalidates the CloudFront cache automatically.

```
eduellen/
├── infra/          ← CDK code (this folder)
└── website/        ← Static site files
    ├── index.html
    ├── styles.css
    └── assets/     ← images, fonts (see assets/README.md)
```

## Custom domain not in Route 53 yet?

Set `createDnsRecords: false` in `bin/eduellen.ts`, deploy, then point your registrar's nameservers at Route 53 once you've created the hosted zone. Switch back to `true` and redeploy to issue the certificate and create the DNS records.

## Invalidate cache after a content update

```bash
aws cloudfront create-invalidation \
  --distribution-id <DistributionId from outputs> \
  --paths "/*"
```

Or just run `npx cdk deploy` again — the BucketDeployment construct does it automatically.

## Route structure (Phase 1)

| Path | File |
|---|---|
| `/` | `website/index.html` |
| `/students` | `website/students/index.html` |
| `/resources` | `website/resources/index.html` |
| `/grinds` | `website/grinds/index.html` |
| `/teachers` | `website/teachers/index.html` |
| `/about` | `website/about/index.html` |
| `/insights` | `website/insights/index.html` |

CloudFront returns `index.html` for any unknown path (SPA-compatible error handling).
