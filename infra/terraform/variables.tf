variable "aws_region" {
  description = "AWS region for the production stack."
  type        = string
  default     = "ap-south-1"
}

variable "name_prefix" {
  description = "Short lowercase prefix used for resource names."
  type        = string
  default     = "kloudlab"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,15}$", var.name_prefix))
    error_message = "name_prefix must be 3-16 lowercase letters, digits, or hyphens, and start with a letter."
  }
}

variable "eks_kubernetes_version" {
  description = "EKS Kubernetes version supported in the chosen region. Pin it and upgrade deliberately."
  type        = string

  validation {
    condition     = can(regex("^[0-9]+[.][0-9]+$", var.eks_kubernetes_version))
    error_message = "Set eks_kubernetes_version to a supported major.minor version, such as 1.xx."
  }
}

variable "vpc_cidr" {
  description = "New production VPC CIDR. Must not overlap networks that will connect to this VPC."
  type        = string
  default     = "10.40.0.0/16"
}

variable "cluster_admin_role_arn" {
  description = "IAM role ARN for the human operator who administers this EKS cluster. Use an IAM role ARN, not an STS assumed-role session ARN."
  type        = string
}

variable "cluster_public_access_cidrs" {
  description = "Public IPv4 CIDRs allowed to reach the EKS Kubernetes API. Set this to the operator/VPN egress IP range; do not use 0.0.0.0/0."
  type        = list(string)

  validation {
    condition     = length(var.cluster_public_access_cidrs) > 0 && !contains(var.cluster_public_access_cidrs, "0.0.0.0/0") && alltrue([for cidr in var.cluster_public_access_cidrs : can(cidrhost(cidr, 0))])
    error_message = "Provide at least one valid, restricted IPv4 CIDR for EKS API access."
  }
}

variable "cognito_domain_prefix" {
  description = "Globally unique prefix for the Cognito hosted UI domain."
  type        = string
}

variable "cognito_callback_urls" {
  description = "HTTPS callback URLs for the deployed frontend. Localhost may be included for local development."
  type        = list(string)
}

variable "cognito_logout_urls" {
  description = "HTTPS logout URLs for the deployed frontend. Localhost may be included for local development."
  type        = list(string)
}

variable "github_repository" {
  description = "GitHub owner/repository allowed to push application images using OIDC, for example owner/kloudlab."
  type        = string
}

variable "platform_instance_types" {
  description = "On-demand EC2 types for the always-on API/platform node group."
  type        = list(string)
  default     = ["t3.medium"]
}

variable "platform_desired_size" {
  type    = number
  default = 2
}

variable "platform_min_size" {
  type    = number
  default = 2
}

variable "platform_max_size" {
  type    = number
  default = 4
}

variable "lab_instance_types" {
  description = "On-demand EC2 types for guided lab workloads. These nodes are tainted for lab pods."
  type        = list(string)
  default     = ["t3.large"]
}

variable "lab_desired_size" {
  description = "Baseline lab capacity so guided workloads can schedule. This node remains billed while provisioned."
  type        = number
  default     = 1
}

variable "lab_min_size" {
  type    = number
  default = 1
}

variable "lab_max_size" {
  type    = number
  default = 6
}
