// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import { Capture, Match, Template } from 'aws-cdk-lib/assertions';
import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as AcWebCalling from '../lib/ac_web_calling-stack';


test('Lambda Function Created', () => {
  const app = new cdk.App();
  const stack = new AcWebCalling.AcWebCallingStack(app, 'MyTestStack');
  const template = Template.fromStack(stack);   
  template.hasResourceProperties('AWS::Lambda::Function', {
    Environment: {
        Variables: {
            WIDGET_ID: {
                Ref: Match.anyValue(),
            }
        }
        }
    });
    });
