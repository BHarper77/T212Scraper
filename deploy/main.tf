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

resource "aws_lambda_function" "T212Scraper" {
  role             = aws_iam_role.iam_for_lambda.arn
  description      = "A web scraper that scrapes data from Trading 212 and writes to Stock Events and Google Sheets"
  filename         = "../.serverless/t212scraper.zip"
  function_name    = "T212Scraper"
  handler          = "../.serverless/src/lambda.handler"
  runtime          = "nodejs18.x"
  source_code_hash = filebase64sha256("../.serverless/t212scraper.zip")
  timeout          = 600
  layers           = [aws_lambda_layer_version.chromium.arn]

  tags = {
    Name = "T212Scraper"
  }
}

resource "aws_lambda_layer_version" "chromium" {
  filename         = "../layers/node_modules.zip"
  layer_name       = "chromium"
  source_code_hash = filebase64sha256("../layers/node_modules.zip")

  compatible_runtimes = ["nodejs18.x"]
}

resource "aws_s3_bucket" "t212scraper" {
  bucket = "t212scraper"
}
