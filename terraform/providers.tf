terraform {
  # Shared state bucket, already in use by the other CuriousJC stacks. Each repo
  # gets its own key so they never touch each other's state.
  #
  # No DynamoDB lock table is configured. With a single operator and CI-only
  # applies there is no concurrent writer to protect against; if a second apply
  # path ever appears, add `dynamodb_table` here first.
  backend "s3" {
    bucket = "curiousjc-tf-state"
    key    = "curiousjc/curious-words"
    region = "us-east-1"
  }

  # 5.x deliberately. This is a brand new bucket with no existing state, so there
  # is nothing to migrate, and 5.x lets public read be expressed as a bucket
  # policy instead of per-object ACLs -- see main.tf. Pinning to an older line
  # would mean writing the legacy ACL form on purpose.
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  required_version = ">= 1.3.0"
}

provider "aws" {
  region = "us-east-1"

  default_tags {
    tags = {
      Environment = "curious-words"
      terraform   = "true"
    }
  }
}
