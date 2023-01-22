terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 4.16"
    }
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

resource "aws_lambda_function" "T212Scraper" {
  role             = aws_iam_role.iam_for_lambda.arn
  description      = "A web scraper that scrapes data from Trading 212 and writes to Stock Events and Google Sheets"
  filename         = "../dist.zip"
  function_name    = "T212Scraper"
  handler          = "../dist/src/lambda.handler"
  runtime          = "nodejs18.x"
  source_code_hash = filebase64sha256("../dist.zip")
  timeout          = 600

  tags = {
    Name = "T212Scraper"
  }
}
