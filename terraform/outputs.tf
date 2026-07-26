# The origin the Cloudflare CNAME should point at. Emitted as an output so the
# value comes from the bucket itself rather than being retyped into a DNS panel
# from memory.
output "website_endpoint" {
  description = "S3 website endpoint. The Cloudflare CNAME for quotes.sherman.industries targets this."
  value       = aws_s3_bucket_website_configuration.site.website_endpoint
}

output "object_count" {
  description = "Number of files uploaded from ../dist on the last apply. A zero here means the build did not run."
  value       = length(aws_s3_object.site)
}
