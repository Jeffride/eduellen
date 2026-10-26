# EduEllen CMS Setup Guide

Ellen manages resources at **eduellen.com/admin** — no GitHub account needed.

## How it works

```
Ellen visits eduellen.com/admin
    ↓
Logs in with her email + password (Netlify Identity — free)
    ↓
Fills in a form: title, subject, file upload, price, description
    ↓
Clicks Publish → file committed to GitHub via API
    ↓
GitHub Actions runs → cdk deploy → site updated within ~3 minutes
```

---

## One-time setup (you do this, not Ellen)

### 1. Enable Netlify Identity on your site

Netlify Identity works as a standalone auth service even though your site is on AWS.

1. Go to [app.netlify.com](https://app.netlify.com)
2. Click **Add new site → Deploy manually** (upload a placeholder HTML file)
3. In **Site settings → Identity**, click **Enable Identity**
4. Under **Registration**, set to **Invite only** (so only Ellen can register)
5. Copy your **Netlify site URL** (e.g. `https://random-name.netlify.app`)
6. In `website/admin/config.yml`, update `identity_url` to match

### 2. Set up GitHub OIDC for Actions (no stored AWS keys)

After `cdk deploy`, the stack outputs a `GitHubActionsRoleArn`. Then:

1. In **GitHub → EduEllen repo → Settings → Secrets and variables → Actions**, add:
   - `AWS_ROLE_ARN` = the ARN from the CDK output

2. In AWS Console → IAM → Identity providers, verify
   `token.actions.githubusercontent.com` exists (CDK creates it via the stack).

### 3. Update config.yml

Edit `website/admin/config.yml`:
```yaml
backend:
  repo: Jeffride/EduEllen   # ← your exact GitHub username/repo
  base_url: https://your-netlify-site.netlify.app  # ← from step 1
```

### 4. Invite Ellen

In Netlify Identity → **Invite users** → enter Ellen's email.
She gets an email, sets her password, and can log in at `eduellen.com/admin`.

---

## What Ellen sees

When she logs in at `/admin` she can:

| Action | What it does |
|---|---|
| Create a Resource | Fills in title, subject, level, description, uploads PDF + cover image, sets free/paid |
| Set status to Draft | Saves to GitHub but not shown on the site |
| Set status to Published | Triggers a deploy — live within ~3 min |
| Edit Site Settings | Updates contact email, social links |

---

## Resource fields

| Field | Required | Notes |
|---|---|---|
| Title | Yes | Shown on resource cards |
| Subject | Yes | Geography / Business / Maths / Economics |
| Audience | Yes | Students / Teachers / Both |
| Level | No | e.g. Leaving Cert Higher |
| Description | Yes | Short honest description |
| Free or Paid | Yes | Toggle |
| Price | No | e.g. €3.99 — only if paid |
| Preview image | No | JPG/PNG shown on card |
| Resource file | No | PDF — add download gating before commerce goes live |
| Curriculum | No | e.g. Irish Leaving Certificate |
| Status | Yes | Draft or Published |

---

## Adding resources to the site

The `website/content/resources/` folder holds JSON files — one per resource.
The `website/resources/index.html` page needs to be updated to read these files
dynamically (Phase 2 — requires a build step or a small JS loader).

For Phase 1, Ellen can publish resources and they will be available as direct
file links. The resource catalogue page can be updated manually or wired to
a static site generator (e.g. Eleventy, Astro) in Phase 2.

---

## Paid downloads (Phase 2)

Before charging for resources:
1. Move files out of the public `assets/uploads` folder into a private S3 prefix
2. Add a Lambda function that generates presigned S3 URLs on successful payment
3. Integrate Stripe or a similar payment provider
4. Never expose the direct S3 URL in frontend code

See the handoff README for the phased delivery plan.
