resource "aws_s3_bucket" "t212scraper" {
  bucket = "t212scraper"
}

resource "aws_s3_object" "deployment_package" {
  bucket = aws_s3_bucket.t212scraper.bucket
  key    = "deploymentPackage.zip"
  source = "../.serverless/t212scraper.zip"
  etag   = filemd5("../.serverless/t212scraper.zip")
}
