import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as route53targets from "aws-cdk-lib/aws-route53-targets";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";
import * as path from "path";

export interface EduEllenStackProps extends cdk.StackProps {
  domainName: string;
  /** Set false to skip Route 53 record creation (e.g. domain not yet in R53) */
  createDnsRecords?: boolean;
}

export class EduEllenStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: EduEllenStackProps) {
    super(scope, id, props);

    const { domainName, createDnsRecords = true } = props;
    const wwwDomain = `www.${domainName}`;

    // ── 1. S3 bucket (private – CloudFront OAC only) ─────────────────────────
    const siteBucket = new s3.Bucket(this, "SiteBucket", {
      bucketName: `eduellen-site-${this.account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      versioned: false,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      encryption: s3.BucketEncryption.S3_MANAGED,
    });

    // ── 2. ACM certificate (must be in us-east-1 for CloudFront) ─────────────
    let certificate: acm.ICertificate | undefined;
    let hostedZone: route53.IHostedZone | undefined;

    if (createDnsRecords) {
      hostedZone = route53.HostedZone.fromLookup(this, "HostedZone", {
        domainName,
      });

      certificate = new acm.Certificate(this, "SiteCert", {
        domainName,
        subjectAlternativeNames: [wwwDomain],
        validation: acm.CertificateValidation.fromDns(hostedZone),
      });
    }

    // ── 3. CloudFront Function — rewrite /path/ → /path/index.html ───────────
    const urlRewriteFn = new cloudfront.Function(this, "UrlRewrite", {
      functionName: "eduellen-url-rewrite",
      code: cloudfront.FunctionCode.fromInline(`
function handler(event) {
  var request = event.request;
  var uri = request.uri;
  if (uri.endsWith('/')) {
    request.uri = uri + 'index.html';
  } else if (!uri.includes('.', uri.lastIndexOf('/'))) {
    request.uri = uri + '/index.html';
  }
  return request;
}
      `),
      runtime: cloudfront.FunctionRuntime.JS_2_0,
    });

    // ── 4. CloudFront Origin Access Control ──────────────────────────────────
    const oac = new cloudfront.S3OriginAccessControl(this, "OAC", {
      description: "EduEllen site OAC",
      signing: cloudfront.Signing.SIGV4_NO_OVERRIDE,
    });

    // ── 5. Response headers policies ─────────────────────────────────────────

    // Main site — strict CSP
    const responseHeadersPolicy = new cloudfront.ResponseHeadersPolicy(
      this,
      "SecurityHeaders",
      {
        responseHeadersPolicyName: "EduEllenSecurityHeaders",
        securityHeadersBehavior: {
          contentTypeOptions: { override: true },
          frameOptions: {
            frameOption: cloudfront.HeadersFrameOption.DENY,
            override: true,
          },
          referrerPolicy: {
            referrerPolicy:
              cloudfront.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
            override: true,
          },
          strictTransportSecurity: {
            accessControlMaxAge: cdk.Duration.days(365),
            includeSubdomains: true,
            preload: true,
            override: true,
          },
          xssProtection: { protection: true, modeBlock: true, override: true },
          contentSecurityPolicy: {
            contentSecurityPolicy: [
              "default-src 'self'",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              "img-src 'self' data:",
              "script-src 'self' 'unsafe-inline'",
              "frame-ancestors 'none'",
            ].join("; "),
            override: true,
          },
        },
      }
    );

    // Admin — relaxed CSP to allow Decap CMS + Netlify Identity
    const adminResponseHeadersPolicy = new cloudfront.ResponseHeadersPolicy(
      this,
      "AdminSecurityHeaders",
      {
        responseHeadersPolicyName: "EduEllenAdminSecurityHeaders",
        securityHeadersBehavior: {
          contentTypeOptions: { override: true },
          referrerPolicy: {
            referrerPolicy:
              cloudfront.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
            override: true,
          },
          strictTransportSecurity: {
            accessControlMaxAge: cdk.Duration.days(365),
            includeSubdomains: true,
            preload: true,
            override: true,
          },
          contentSecurityPolicy: {
            contentSecurityPolicy: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com https://identity.netlify.com https://cdn.jsdelivr.net",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com",
              "font-src 'self' https://fonts.gstatic.com https://unpkg.com",
              "connect-src 'self' https://api.github.com https://eloquent-tanuki-5543ea.netlify.app https://identity.netlify.com https://unpkg.com https://raw.githubusercontent.com",
              "img-src 'self' data: blob: https://*.githubusercontent.com https://unpkg.com",
              "frame-src 'self' https://eloquent-tanuki-5543ea.netlify.app",
              "frame-ancestors 'none'",
            ].join("; "),
            override: true,
          },
        },
      }
    );

    // ── 6. CloudFront distribution ────────────────────────────────────────────
    const distribution = new cloudfront.Distribution(this, "Distribution", {
      comment: "EduEllen.com website",
      defaultRootObject: "index.html",
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      domainNames: createDnsRecords ? [domainName, wwwDomain] : undefined,
      certificate: certificate,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(siteBucket, {
          originAccessControl: oac,
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        responseHeadersPolicy,
        compress: true,
        functionAssociations: [
          {
            function: urlRewriteFn,
            eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
          },
        ],
      },
      // /admin/* — relaxed CSP, no caching
      additionalBehaviors: {
        "/admin/*": {
          origin: origins.S3BucketOrigin.withOriginAccessControl(siteBucket, {
            originAccessControl: oac,
          }),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          responseHeadersPolicy: adminResponseHeadersPolicy,
          compress: true,
          functionAssociations: [
            {
              function: urlRewriteFn,
              eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
            },
          ],
        },
      },
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 404,
          responsePagePath: "/404/index.html",
          ttl: cdk.Duration.seconds(10),
        },
        {
          httpStatus: 404,
          responseHttpStatus: 404,
          responsePagePath: "/404/index.html",
          ttl: cdk.Duration.seconds(10),
        },
      ],
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      enableIpv6: true,
    });

    // ── 7. Grant CloudFront OAC permission to read the bucket ─────────────────
    siteBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: "AllowCloudFrontOAC",
        effect: iam.Effect.ALLOW,
        principals: [new iam.ServicePrincipal("cloudfront.amazonaws.com")],
        actions: ["s3:GetObject"],
        resources: [siteBucket.arnForObjects("*")],
        conditions: {
          StringEquals: {
            "AWS:SourceArn": `arn:aws:cloudfront::${this.account}:distribution/${distribution.distributionId}`,
          },
        },
      })
    );

    // ── 8. Deploy website files to S3 ─────────────────────────────────────────
    new s3deploy.BucketDeployment(this, "DeployWebsite", {
      sources: [
        s3deploy.Source.asset(path.join(__dirname, "../../website")),
      ],
      destinationBucket: siteBucket,
      distribution,
      distributionPaths: ["/*"],
      memoryLimit: 256,
      cacheControl: [
        s3deploy.CacheControl.fromString("public, max-age=0, must-revalidate"),
      ],
      prune: true,
    });

    // ── 9. Route 53 DNS records ───────────────────────────────────────────────
    if (createDnsRecords && hostedZone) {
      new route53.ARecord(this, "ApexRecord", {
        zone: hostedZone,
        recordName: domainName,
        target: route53.RecordTarget.fromAlias(
          new route53targets.CloudFrontTarget(distribution)
        ),
      });

      new route53.ARecord(this, "WwwRecord", {
        zone: hostedZone,
        recordName: wwwDomain,
        target: route53.RecordTarget.fromAlias(
          new route53targets.CloudFrontTarget(distribution)
        ),
      });

      new route53.AaaaRecord(this, "ApexRecordV6", {
        zone: hostedZone,
        recordName: domainName,
        target: route53.RecordTarget.fromAlias(
          new route53targets.CloudFrontTarget(distribution)
        ),
      });
    }

    // ── 10. GitHub Actions OIDC role ──────────────────────────────────────────
    const githubOidcProvider = iam.OpenIdConnectProvider.fromOpenIdConnectProviderArn(
      this,
      "GitHubOIDC",
      `arn:aws:iam::${this.account}:oidc-provider/token.actions.githubusercontent.com`
    );

    const githubActionsRole = new iam.Role(this, "GitHubActionsDeployRole", {
      roleName: "GitHubActionsDeployRole",
      assumedBy: new iam.WebIdentityPrincipal(
        githubOidcProvider.openIdConnectProviderArn,
        {
          StringEquals: {
            "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          },
          StringLike: {
            "token.actions.githubusercontent.com:sub":
              "repo:Jeffride/eduellen:ref:refs/heads/master",
          },
        }
      ),
      description: "Role assumed by GitHub Actions to deploy EduEllen",
    });

    githubActionsRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("PowerUserAccess")
    );
    githubActionsRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          "iam:PassRole", "iam:GetRole", "iam:CreateRole",
          "iam:AttachRolePolicy", "iam:PutRolePolicy",
          "iam:DetachRolePolicy", "iam:DeleteRole", "iam:DeleteRolePolicy",
          "iam:TagRole", "iam:UntagRole", "iam:UpdateAssumeRolePolicy",
        ],
        resources: [`arn:aws:iam::${this.account}:role/*`],
      })
    );

    // ── 11. Outputs ───────────────────────────────────────────────────────────
    new cdk.CfnOutput(this, "GitHubActionsRoleArn", {
      value: githubActionsRole.roleArn,
      description: "Paste this into .github/workflows/deploy.yml role-to-assume",
    });

    new cdk.CfnOutput(this, "BucketName", {
      value: siteBucket.bucketName,
      description: "S3 bucket holding site files",
    });

    new cdk.CfnOutput(this, "DistributionId", {
      value: distribution.distributionId,
      description: "CloudFront distribution ID",
    });

    new cdk.CfnOutput(this, "DistributionDomain", {
      value: distribution.distributionDomainName,
      description: "CloudFront domain (use until DNS is live)",
    });

    new cdk.CfnOutput(this, "SiteUrl", {
      value: `https://${domainName}`,
      description: "Live site URL",
    });
  }
}
