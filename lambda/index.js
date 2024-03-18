// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

const jwt = require("jsonwebtoken");
const { SSMClient, GetParameterCommand } = require("@aws-sdk/client-ssm");

/**
 * Gets SSM parameter value from AWS SSM service.
 *
 * @async
 * @param {string} paramName - The name of the SSM parameter 
 * @param {boolean} withDecryption - Whether to decrypt the secured parameter
 * @returns {Promise<string|null>} Promise resolving to parameter value or null if lookup failed
 *
 * @example 
 * const connect_secret = await getSSMParameterValue('/Blog/AcWebCalling/AmazonConnect/ConnectSecret', true);
 *
 */
async function getSSMParameterValue(paramName, withDecryption) {

  const client = new SSMClient();
  const params = {
    Name: paramName,
    WithDecryption: withDecryption
  };
  try {
    const command = new GetParameterCommand(params);
    const response = await client.send(command);
    const paramValue = response.Parameter?.Value;
    return paramValue;
  } catch (error) {
    console.log(error);
    return null;
  }
}

/**
 * Lambda function handler to generate token for Amazon Connect chat widget.
 * 
 * @async
 * @param {object} event - Lambda function event
 * @returns {object} - Lambda function response 
 * @returns {number} return.statusCode - HTTP status code
 * @returns {object} return.headers - Response headers
 * @returns {string} return.body - Response body containing generated token
 * reference: https://docs.aws.amazon.com/apigateway/latest/developerguide/how-to-cors.html#apigateway-enable-cors-proxy
 */
exports.handler = async function (event) {
  console.log("request:", JSON.stringify(event, undefined, 2));
  //https://docs.aws.amazon.com/connect/latest/adminguide/add-chat-to-website.html#confirm-and-copy-chat-widget-script
  const widgetId = await getSSMParameterValue(process.env.WIDGET_ID, true);
  var connect_secret = await getSSMParameterValue(process.env.CONNECT_SECRET, true);
  console.log("event.body:", event.body);
  var payload = {
    sub: widgetId
  }
  payload['attributes'] = JSON.parse(event.body);
  var token = jwt.sign(payload, connect_secret, { expiresIn: 3600 });
  var body = {
    event_path: event.path,
    token: token
  }

  return {
    statusCode: 200,
    headers: {
      "Access-Control-Allow-Headers": "Access-Control-Allow-Headers: 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "OPTIONS,POST,GET"
    },
    body: JSON.stringify(body)
  };
}
