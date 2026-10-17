variable "aws_region" {
  type    = string
  default = "ap-south-1"
}

variable "state_bucket_name" {
  description = "Globally unique S3 bucket name dedicated to KloudLab Terraform state."
  type        = string
}
