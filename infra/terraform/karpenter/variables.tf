variable "aws_region" {
  description = "Region hosting the EKS cluster."
  type        = string
  default     = "ap-south-1"
}

variable "cluster_name" {
  description = "Must match the EKS cluster created by ../main.tf."
  type        = string
  default     = "kloudlab-prod-eks"
}

variable "karpenter_controller_role_arn" {
  description = "IRSA role ARN output by the main Terraform root."
  type        = string
}

variable "karpenter_node_role_name" {
  description = "EC2 node role name output by the main Terraform root."
  type        = string
}

variable "interruption_queue_name" {
  description = "SQS queue name output by the main Terraform root."
  type        = string
  default     = "kloudlab-prod-eks"
}

variable "karpenter_version" {
  description = "Karpenter chart version, kept aligned with the chosen EKS version."
  type        = string
  default     = "1.15.0"
}

variable "node_ami_alias" {
  description = "Amazon Linux 2023 EKS AMI alias consumed by the EC2NodeClass. Pin a release for controlled AMI rollouts."
  type        = string
  default     = "al2023@latest"
}

variable "lab_instance_type" {
  description = "The only instance type allowed for disposable student lab nodes."
  type        = string
  default     = "m8a.large"

  validation {
    condition     = var.lab_instance_type == "m8a.large"
    error_message = "This first production pool is intentionally limited to m8a.large."
  }
}

variable "lab_node_cpu_limit" {
  description = "Maximum aggregate CPU Karpenter may provision for student labs (32 vCPU = at most 16 m8a.large nodes)."
  type        = string
  default     = "32"
}

variable "lab_node_memory_limit" {
  description = "Maximum aggregate memory Karpenter may provision for student labs."
  type        = string
  default     = "128Gi"
}
