import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cr from 'aws-cdk-lib/custom-resources';
import { NagSuppressions } from 'cdk-nag';
import * as path from 'path';

export class AcWebCallingStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    this.addNagSuppressions();
    const ssmParameters = this.createSSMParameters();
    const jwtFunction = this.createJWTFunction(ssmParameters);
    const api = this.createAPIGateway(jwtFunction);
    const { s3Bucket, logBucket, distribution } = this.createCloudFrontDistribution();

    this.deployWebsiteContent(s3Bucket, distribution);

    new cdk.CfnOutput(this, 'websiteURL', {
      value: `https://${distribution.domainName}`
    });

    new cdk.CfnOutput(this, 'cloudFrontLogBucket', {
      value: logBucket.bucketName,
      description: 'CloudFront Log Bucket Name',
    });
  }

  private addNagSuppressions() {
    const suppressions = [
      { id: 'AwsSolutions-S1', reason: 'S3 bucket does not need server access logs for this demo.' },
      { id: 'AwsSolutions-IAM5', reason: 'IAM role uses AWSLambdaBasicExecutionRole which is required for Lambda function execution for this demo.' },
      { id: 'AwsSolutions-IAM4', reason: 'IAM role uses managed policies for simplicity in this demo.' },
      { id: 'AwsSolutions-APIG4', reason: 'API Gateway does not require authorization for this public demo endpoint.' },
      { id: 'AwsSolutions-COG4', reason: 'Cognito is not used in this stack.' },
      { id: 'AwsSolutions-CFR4', reason: 'CloudFront default root object is not required for this distribution.' },
      { id: 'AwsSolutions-L1', reason: 'Lambda function does not require the latest runtime for this demo.' },
      { id: 'AwsSolutions-APIG2', reason: 'API Gateway request validation is not required for this simple demo endpoint.' },
      { id: 'AwsSolutions-CFR1', reason: 'CloudFront distribution uses default domain name for demonstration purposes.' },
      { id: 'AwsSolutions-CFR2', reason: 'WAF is not required for this distribution as it\'s a demo without specific security requirements.' },
      { id: 'AwsSolutions-APIG3', reason: 'WAF is not required for this API Gateway as it\'s a demo without specific security requirements.' },
      {id: 'CdkNagValidationFailure', reason: 'Lambda runtime is determined dynamically at deployment time.' }
    ];

    NagSuppressions.addStackSuppressions(this, suppressions);
  }

  private createSSMParameters() {
    const SSM_WIDGET_ID = '/Blog/AcWebCalling/AmazonConnect/WidgetId';
    const SSM_CONNECT_SECRET = '/Blog/AcWebCalling/AmazonConnect/ConnectSecret';

    const paramWidget = new ssm.StringParameter(this, 'StringParameterWidget', {
      description: 'WidgetId from Communications widget script',
      parameterName: SSM_WIDGET_ID,
      stringValue: 'Your WidgetId',
      allowedPattern: '.*',
    });

    const paramConnectSecret = new ssm.StringParameter(this, 'StringParameterSecret', {
      description: 'CONNECT_SECRET is the security key provided by Amazon Connect - communications widget security keys',
      parameterName: SSM_CONNECT_SECRET,
      stringValue: 'Your CONNECT_SECRET',
      allowedPattern: '.*',
    });

    return { paramWidget, paramConnectSecret, SSM_WIDGET_ID, SSM_CONNECT_SECRET };
  }

  private createJWTFunction(ssmParameters: any) {
    const jwtLayer = new lambda.LayerVersion(this, 'JwtLayer', {
      code: lambda.Code.fromAsset('lambda-layers/jwt-layer'),
      compatibleRuntimes: [lambda.Runtime.NODEJS_20_X],
      description: 'JWT Layer for JSON Web Tokens',
    });

    const jwtFn = new lambda.Function(this, 'JWTHandler', {
      runtime: lambda.Runtime.NODEJS_20_X,
      code: lambda.Code.fromAsset('lambda'),
      handler: 'index.handler',
      layers: [jwtLayer],
      timeout: cdk.Duration.seconds(10),
      environment: {
        WIDGET_ID: ssmParameters.SSM_WIDGET_ID,
        CONNECT_SECRET: ssmParameters.SSM_CONNECT_SECRET,
      }
    });

    NagSuppressions.addResourceSuppressions(
      jwtFn,
      [{
        id: 'AwsSolutions-IAM4',
        reason: 'Suppress AwsSolutions-IAM4 for AWSLambdaBasicExecutionRole',
        appliesTo: ['Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'],
      }],
      true,
    );

    ssmParameters.paramWidget.grantRead(jwtFn);
    ssmParameters.paramConnectSecret.grantRead(jwtFn);

    return jwtFn;
  }

  private createAPIGateway(jwtFn: lambda.Function) {
    const logGroup = new logs.LogGroup(this, "ApiGatewayAccessLogs");

    return new apigateway.LambdaRestApi(this, 'Endpoint', {
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
      handler: jwtFn,
      proxy: true
    });
  }

  private createCloudFrontDistribution() {
    const s3Bucket = new s3.Bucket(this, 'WebsiteBucket', {
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
    });
  
    const logBucket = new s3.Bucket(this, 'CloudFrontLogsBucket', {
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      objectOwnership: s3.ObjectOwnership.OBJECT_WRITER,
    });
  
    this.setLogBucketAcl(logBucket);
  
    const originAccessControl = new cloudfront.S3OriginAccessControl(this, 'MyOAC', {
      signing: cloudfront.Signing.SIGV4_NO_OVERRIDE
    });
  
    const s3Origin = origins.S3BucketOrigin.withOriginAccessControl(s3Bucket, { originAccessControl });
  
    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      defaultBehavior: { 
        origin: s3Origin,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
      },
      defaultRootObject: 'index.html', // Set the default root object
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.minutes(30),
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.minutes(30),
        },
      ],
      logBucket: logBucket,
      logFilePrefix: 'cloudfront-logs/',
      logIncludesCookies: true,
    });
  
    this.addS3BucketPolicy(s3Bucket, distribution);
  
    return { s3Bucket, logBucket, distribution };
  }  

  private addS3BucketPolicy(s3Bucket: s3.Bucket, distribution: cloudfront.Distribution) {
    s3Bucket.addToResourcePolicy(new iam.PolicyStatement({
      actions: ['s3:GetObject'],
      resources: [s3Bucket.arnForObjects('*')],
      principals: [new iam.ServicePrincipal('cloudfront.amazonaws.com')],
      conditions: {
        StringEquals: {
          'AWS:SourceArn': `arn:aws:cloudfront::${this.account}:distribution/${distribution.distributionId}`
        }
      }
    }));
  }

  private setLogBucketAcl(logBucket: s3.Bucket) {
    new cr.AwsCustomResource(this, 'SetBucketAcl', {
      onUpdate: {
        service: 'S3',
        action: 'putBucketAcl',
        parameters: {
          Bucket: logBucket.bucketName,
          ACL: 'log-delivery-write'
        },
        physicalResourceId: cr.PhysicalResourceId.of(Date.now().toString())
      },
      policy: cr.AwsCustomResourcePolicy.fromSdkCalls({
        resources: [logBucket.bucketArn]
      })
    });
  }
  
  private deployWebsiteContent(s3Bucket: s3.Bucket, distribution: cloudfront.Distribution) {
    new s3deploy.BucketDeployment(this, 'DeployWebsite', {
      sources: [s3deploy.Source.asset(path.join(__dirname, '../website'))],
      destinationBucket: s3Bucket,
      distribution: distribution,
      distributionPaths: ['/*'],
    });
  }
}
