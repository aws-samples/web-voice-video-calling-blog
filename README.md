# Securely pass customer context using Amazon Connect in-app, web, and video calling

## Introduction
This project deploys a sample use case of a customer initiating web and video calls from a webpage. The website also demonstrates how to transfer customer information to agents using Amazon Connect in-app, web, and video calling.


## Architecture
![Architecture Diagram](./architecture.png)


1. Customer accesses website hosted in Amazon CloudFront
1. Static Website content is accessed on Amazon S3 (through Amazon CloudFront)
1. When Customer submits form in the static website, attributes are sent to AWS Lambda via API gateway.
1. The AWS Lambda issues JSON Web Tokens (JWTs) for new requests. AWS Lambda gets the authentication credentials from AWS Systems Manager Parameter
1. Load Amazon Connect Communication Widget. The Communication Widget JavaScript that you embed on the websites enables customers to voice and video call with agents.
1. Customer and Agent are connected.


## Prerequisites

- An AWS account with administrator access to following services – Amazon Connect, Amazon API Gateway, AWS Lambda, AWS CloudFormation, Amazon CloudFront
- An Amazon Connect Instance
- AWS CLI setup in your local environment
- AWS Cloud Development Kit (CDK)


## Installation

1. Install AWS CDK (skip if you already installed) and Bootstrap CDK environment

    ```bash
    npm -g install typescript
    npm -g install aws-cdk
    cdk bootstrap aws://ACCOUNT_ID/AWS_REGION
    ```

1. Using Git, clone the repository from GitHub.

    ```bash
    git clone https://github.com/aws-samples/web-voice-video-calling-blog.git
    ```

1. Install the dependencies for the CDK project and AWS Lambda functions

    ```bash
    mkdir -p lambda-layers/jwt-layer/nodejs
    npm install jsonwebtoken --prefix lambda-layers/jwt-layer/nodejs
    npm install
    ```

1. Deploy the CDK project using your AWS CLI profile. This will deploy the necessary resources in Amazon CloudFront, Amazon API Gateway, AWS Lambda and AWS System Manager for your project.

    ```bash
    cdk deploy
    ```

    (cdk version 2.127.0 is used for this project. If upgrade required, run `npm install -g aws-cdk --force`)

1. Once the CDK deployment has finished, navigate to `Outputs` under this stack, note down the values for Amazon API Gateway endpoint and the Amazon CloudFront website url.

    `AcWebCallingStack.Endpoint8024A810 = https://aaaaaaaa.execute-api.<region>.amazonaws.com/prod/` (Your Amazon API Gateway)

    `AcWebCallingStack.websiteURL =  https://aaaaaa.cloudfront.net` (Your Amazon CloudFront  website url)

## Usage
After the stack is deployed, please follow the steps outlined in blog post [**Securely pass customer context to agents using Amazon Connect in-app, web, and video calling**](https://aws.amazon.com/blogs/contact-center/securely-pass-the-customer-information-to-agent-using-amazon-connect-in-app-web-and-video-calling/)

## Clean up
From the root directory of the source code, run:
```
cdk destroy
```

## Security
See [CONTRIBUTING](CONTRIBUTING.md#security-issue-notifications) for more information.

## License
This project is licensed under the MIT-0 License. See the [LICENSE](LICENSE) file.
