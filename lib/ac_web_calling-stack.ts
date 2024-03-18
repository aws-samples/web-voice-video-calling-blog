// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront'
import * as path from 'path';
import { Stack, StackProps } from 'aws-cdk-lib';
import { CloudFrontToS3 } from '@aws-solutions-constructs/aws-cloudfront-s3';
import * as s3 from 'aws-cdk-lib/aws-s3'
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment'
import * as ssm from 'aws-cdk-lib/aws-ssm'
import * as logs from 'aws-cdk-lib/aws-logs'
import { NagSuppressions } from 'cdk-nag'
import { AwsSolutionsChecks } from 'cdk-nag'
export class AcWebCallingStack extends cdk.Stack {

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {

    super(scope, id, props);

    // The code that defines your stack goes here

    NagSuppressions.addStackSuppressions(this, [
      {
        id: 'AwsSolutions-S1',
        reason: 'Demonstrate a stack level suppression.'
      },
      {
        id: 'AwsSolutions-IAM5',
        reason: 'Demonstrate a stack level suppression.'
      },
      {
        id: 'AwsSolutions-IAM4',
        reason: 'Demonstrate a stack level suppression.'
      },
      {
        id: 'AwsSolutions-APIG4',
        reason: 'Demonstrate a stack level suppression.'
      },
      {
        id: 'AwsSolutions-COG4',
        reason: 'Demonstrate a stack level suppression.'
      },
      {
        id: 'AwsSolutions-CFR4',
        reason: 'Demonstrate a stack level suppression.'
      },
      {
        id: 'AwsSolutions-L1',
        reason: 'Demonstrate a stack level suppression.'
      },
      {
        id: 'AwsSolutions-APIG2',
        reason: 'Demonstrate a stack level suppression.'
      },

    ])

    const SSM_WIDGET_ID='/Blog/AcWebCalling/AmazonConnect/WidgetId'
    const SSM_CONNECT_SECRET='/Blog/AcWebCalling/AmazonConnect/ConnectSecret'
    // Cretae SSM Parameters
    // Create a new SSM Parameter holding a String
    const param_widget = new ssm.StringParameter(this, 'StringParameterWidget', {
      description: 'WidgetId from Communications widget script',
      parameterName: SSM_WIDGET_ID,
      stringValue: 'Your WidgetId',
      allowedPattern: '.*',
    });
    const param_connect_secret = new ssm.StringParameter(this, 'StringParameterSecret', {
      description: 'CONNECT_SECRET is the security key provided by Amazon Connect - communications widget security keys',
      parameterName: SSM_CONNECT_SECRET,
      stringValue: 'Your CONNECT_SECRET',
      allowedPattern: '.*',
    });

    // Create a Lambda Layer
    const jwtLayer = new lambda.LayerVersion(this, 'JwtLayer', {
      //code: lambda.Code.fromAsset(path.join(__dirname, 'lambda-layers/jwt-layer')),
      code: lambda.Code.fromAsset('lambda-layers/jwt-layer'),
      compatibleRuntimes: [lambda.Runtime.NODEJS_20_X], // Choose the appropriate runtime version
      description: 'JWT Layer for JSON Web Tokens',
    });

    // defines an AWS Lambda resource
    const jwt_fn = new lambda.Function(this, 'JWTHandler', {
      runtime: lambda.Runtime.NODEJS_20_X,    // execution environment
      code: lambda.Code.fromAsset('lambda'),  // code loaded from "lambda" directory
      handler: 'index.handler',               // file is "index", function is "handler"
      layers: [jwtLayer],
      timeout: cdk.Duration.seconds(10),      // Set your desired timeout.
      environment: {
        WIDGET_ID: SSM_WIDGET_ID,
        CONNECT_SECRET: SSM_CONNECT_SECRET,
      }
    });
    // Suppress rule for AWSLambdaBasicExecutionRole
    NagSuppressions.addResourceSuppressions(
      jwt_fn,
      [
        {
          id: 'AwsSolutions-IAM4',
          reason: 'Suppress AwsSolutions-IAM4 for AWSLambdaBasicExecutionRole',
          appliesTo: [
            'Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole',
          ],
        },
      ],
      true,
    );
    param_widget.grantRead(jwt_fn);
    param_connect_secret.grantRead(jwt_fn);

    const logGroup = new logs.LogGroup(this, "ApiGatewayAccessLogs");
    // defines an API Gateway REST API resource backed by our "jwt" function.
    const api=new apigateway.LambdaRestApi(this, 'Endpoint', {
  
      restApiName: 'ac_web_calling_cdk_api',
      cloudWatchRole: true,
      deployOptions: {
        stageName: 'prod',
        accessLogDestination: new apigateway.LogGroupLogDestination(logGroup),
        accessLogFormat: apigateway.AccessLogFormat.clf(),
        loggingLevel: apigateway.MethodLoggingLevel.ERROR,
        dataTraceEnabled: true,
        tracingEnabled: true,
        metricsEnabled: true,
      },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: apigateway.Cors.DEFAULT_HEADERS,
      },
      handler: jwt_fn,
      proxy: true
    });

    //https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_apigateway-readme.html
    const api_endpoint=`https://${api.restApiId}.execute-api.${this.region}.amazonaws.com/prod`;

    const {
      s3Bucket,
      cloudFrontWebDistribution,
      } = new CloudFrontToS3(this, 'CloudFrontToS3', {insertHttpSecurityHeaders:false, cloudFrontDistributionProps: {
                defaultBehavior: {
                  cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED //change this to CACHING_OPTIMIZED for production workloads
          },
          bucketProps: {
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            autoDeleteObjects: true
          }
        }
      });

    new cdk.CfnOutput(this, 'websiteURL', {
      value: 'https://' + cloudFrontWebDistribution.domainName
    });

    // read the index.html and replace the API_ENDPOINT

    const deployment = new s3deploy.BucketDeployment(this, 'DeployWebsite', {
      sources: [s3deploy.Source.asset(path.join(__dirname, '../website'))],
      destinationBucket: s3Bucket as s3.IBucket,
    });
  }
}
