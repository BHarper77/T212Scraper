terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 4.16"
    }
  }
  backend "s3" {
    bucket = "t212scraper"
    key    = "terraform.tfstate"
    region = "eu-west-1"
  }

  required_version = ">= 1.2.0"
}

provider "aws" {
  region = "eu-west-1"
}

resource "aws_iam_role" "iam_for_lambda" {
  name = "iam_for_lambda"

  assume_role_policy = jsonencode({
    Version : "2012-10-17",
    Statement : [
      {
        Action : "sts:AssumeRole",
        Principal : {
          Service : "lambda.amazonaws.com"
        },
        Effect : "Allow",
        Sid : ""
      }
    ]
  })
}

resource "aws_s3_bucket" "t212scraper" {
  bucket = "t212scraper"
}

resource "aws_s3_object" "object" {
  bucket = aws_s3_bucket.t212scraper.bucket
  key    = "deploymentPackage.zip"
  source = "../.serverless/t212scraper.zip"
  etag   = filemd5("../.serverless/t212scraper.zip")
}

resource "aws_lambda_function" "T212Scraper" {
  role             = aws_iam_role.iam_for_lambda.arn
  description      = "A web scraper that scrapes data from Trading 212 and writes to Stock Events and Google Sheets"
  function_name    = "T212Scraper"
  handler          = "../.serverless/src/lambda.handler"
  runtime          = "nodejs18.x"
  source_code_hash = filebase64sha256("../.serverless/t212scraper.zip")
  timeout          = 600
  s3_bucket        = aws_s3_bucket.t212scraper.bucket
  s3_key           = "deploymentPackage.zip"

  tags = {
    Name = "T212Scraper"
  }
}
