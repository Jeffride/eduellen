#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { EduEllenStack } from "../lib/eduellen-stack";

const app = new cdk.App();

new EduEllenStack(app, "EduEllenStack", {
  env: {
    account: "556036327386",
    // us-east-1 is required for CloudFront ACM certificates
    region: "us-east-1",
  },
  domainName: "eduellen.com",
  // Set to true once you have the domain in Route 53
  createDnsRecords: true,
});
