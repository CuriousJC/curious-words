#
# Static website hosting for curious-words.
#
# The bucket name is not free choice: an S3 website endpoint is reachable by CNAME
# only when the bucket is named for the host that points at it. `quotes.sherman.
# industries` as a bucket name is what makes these both resolve to the same place:
#
#   http://quotes.sherman.industries.s3-website-us-east-1.amazonaws.com/
#   https://quotes.sherman.industries/
#
# The HTTPS one is Cloudflare's, not S3's. S3 website endpoints serve plain HTTP
# only, so Cloudflare terminates TLS at the edge and talks to the origin over
# HTTP. That requires the zone's SSL mode to be Flexible; Full would fail because
# there is no certificate on the S3 side to validate.
#
resource "aws_s3_bucket" "site" {
  bucket = "quotes.sherman.industries"
}

# Public read is granted by bucket policy below, not by ACLs. Only the policy
# block is opened; ACLs stay blocked.
#
# The older idiom for this was `object_ownership = "BucketOwnerPreferred"` plus
# `acl = "public-read"` on every object. AWS disables ACLs on new buckets by
# default now, and a policy is a single statement covering every object ever
# uploaded rather than a permission re-applied per file -- fewer places for one
# object to end up private by accident. Do not reintroduce the ACL form.
resource "aws_s3_bucket_public_access_block" "site" {
  bucket = aws_s3_bucket.site.id

  block_public_acls       = true
  ignore_public_acls      = true
  block_public_policy     = false
  restrict_public_buckets = false
}

# Anonymous GetObject on the contents of this one bucket. Note the ARN has `/*`:
# it grants reads of objects, not `ListBucket`, so the bucket index is not
# browsable and only paths someone already knows can be fetched.
resource "aws_s3_bucket_policy" "site" {
  bucket = aws_s3_bucket.site.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "PublicReadGetObject"
        Effect    = "Allow"
        Principal = "*"
        Action    = "s3:GetObject"
        Resource  = "${aws_s3_bucket.site.arn}/*"
      }
    ]
  })

  # The public access block must be relaxed before a public policy is accepted.
  # Terraform cannot infer this ordering from the arguments alone.
  depends_on = [aws_s3_bucket_public_access_block.site]
}

resource "aws_s3_bucket_website_configuration" "site" {
  bucket = aws_s3_bucket.site.id

  index_document {
    suffix = "index.html"
  }

  # index.html, not an error page, on purpose. This is a single-page app: if
  # client-side routes are ever added, a visitor loading /quotes/42 directly asks
  # S3 for a key that does not exist, and S3 answers with the error document.
  # Serving index.html there hands the request to the app, which reads the URL and
  # renders the right view.
  #
  # The cost of this is that genuine 404s return HTTP 404 with the app's HTML in
  # the body. For a personal site that is the better trade.
  error_document {
    key = "index.html"
  }
}

locals {
  # S3 stores whatever Content-Type it is told and serves it back verbatim. Get
  # this wrong and the browser refuses the file -- a stylesheet sent as
  # application/octet-stream is ignored, and a module script sent as text/plain is
  # blocked outright.
  mime_types = {
    "css"   = "text/css"
    "html"  = "text/html"
    "ico"   = "image/vnd.microsoft.icon"
    "jpg"   = "image/jpeg"
    "jpeg"  = "image/jpeg"
    "js"    = "application/javascript"
    "json"  = "application/json"
    "map"   = "application/json"
    "png"   = "image/png"
    "svg"   = "image/svg+xml"
    "txt"   = "text/plain"
    "webp"  = "image/webp"
    "woff"  = "font/woff"
    "woff2" = "font/woff2"
  }
}

# One managed object per file in ../dist.
#
# READ THIS BEFORE RUNNING APPLY ANYWHERE BUT CI.
#
# The set of resources here is computed by scanning ../dist on local disk. dist/
# is gitignored build output, so a checkout that has not been built has an empty
# ../dist -- and Terraform reads that as "every object was deleted" and removes
# them from the live bucket. CI always builds before applying, in the same job,
# which is what makes this safe. See the comment at the top of ci.yml.
resource "aws_s3_object" "site" {
  for_each = fileset("../dist/", "**/*.*")

  bucket = aws_s3_bucket.site.id
  key    = each.key
  source = "../dist/${each.key}"

  # The fallback matters. Without it, any extension missing from the map above
  # fails the entire apply rather than uploading with a generic type.
  content_type = lookup(local.mime_types, element(split(".", each.key), length(split(".", each.key)) - 1), "application/octet-stream")

  # Makes the object's content part of its Terraform identity, so an edited file
  # with an unchanged name is still detected and re-uploaded.
  etag = filemd5("../dist/${each.key}")
}
