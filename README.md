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

## Prerequisites

- Node.js 18+ and npm
- AWS CDK v2: `npm install -g aws-cdk`
- AWS CLI configured: `aws configure` or `aws sso login`
- AWS account **556036327386** with Route 53 hosted zone for `eduellen.com`


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
