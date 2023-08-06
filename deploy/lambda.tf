data "aws_iam_policy_document" "t212scraper_policy" {
  statement {
    actions = [
      "logs:CreateLogGroup",
      "logs:CreateLogStream",
      "logs:PutLogEvents"
    ]
    resources = ["arn:aws:logs:*:*:*"]
  }
}

data "aws_iam_policy_document" "t212scraper_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "t212scraper_role" {
  name               = "T212Scraper"
  assume_role_policy = data.aws_iam_policy_document.t212scraper_assume_role.json
}

resource "aws_iam_role_policy" "t212scraper_policy" {
  name   = "T212Scraper"
  role   = aws_iam_role.t212scraper_role.id
  policy = data.aws_iam_policy_document.t212scraper_policy.json
}

resource "aws_lambda_function" "T212Scraper" {
  role             = aws_iam_role.t212scraper_role.arn
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
