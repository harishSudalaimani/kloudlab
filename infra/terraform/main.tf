data "aws_availability_zones" "available" {
  state = "available"
}

data "aws_caller_identity" "current" {}
data "aws_partition" "current" {}

locals {
  prefix       = var.name_prefix
  cluster_name = "${local.prefix}-prod-eks"
  azs          = slice(data.aws_availability_zones.available.names, 0, 2)
  subnets = {
    for index, az in local.azs : az => {
      public_cidr  = cidrsubnet(var.vpc_cidr, 4, index)
      private_cidr = cidrsubnet(var.vpc_cidr, 4, index + 8)
    }
  }
}

resource "aws_vpc" "prod" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true
  tags                 = { Name = "${local.prefix}-prod-vpc" }
}

resource "aws_internet_gateway" "prod" {
  vpc_id = aws_vpc.prod.id
  tags   = { Name = "${local.prefix}-prod-igw" }
}

resource "aws_subnet" "public" {
  for_each                = local.subnets
  vpc_id                  = aws_vpc.prod.id
  availability_zone       = each.key
  cidr_block              = each.value.public_cidr
  map_public_ip_on_launch = true
  tags = {
    Name                                          = "${local.prefix}-prod-public-${each.key}"
    "kubernetes.io/role/elb"                      = "1"
    "kubernetes.io/cluster/${local.cluster_name}" = "shared"
  }
}

resource "aws_subnet" "private" {
  for_each                = local.subnets
  vpc_id                  = aws_vpc.prod.id
  availability_zone       = each.key
  cidr_block              = each.value.private_cidr
  map_public_ip_on_launch = false
  tags = {
    Name                                          = "${local.prefix}-prod-private-${each.key}"
    "kubernetes.io/role/internal-elb"             = "1"
    "kubernetes.io/cluster/${local.cluster_name}" = "shared"
  }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.prod.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.prod.id
  }
  tags = { Name = "${local.prefix}-prod-public" }
}

resource "aws_route_table_association" "public" {
  for_each       = aws_subnet.public
  subnet_id      = each.value.id
  route_table_id = aws_route_table.public.id
}

resource "aws_eip" "nat" {
  domain     = "vpc"
  depends_on = [aws_internet_gateway.prod]
  tags       = { Name = "${local.prefix}-prod-nat" }
}

resource "aws_nat_gateway" "prod" {
  allocation_id = aws_eip.nat.id
  subnet_id     = values(aws_subnet.public)[0].id
  depends_on    = [aws_internet_gateway.prod]
  tags          = { Name = "${local.prefix}-prod-nat" }
}

resource "aws_route_table" "private" {
  for_each = local.subnets
  vpc_id   = aws_vpc.prod.id
  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.prod.id
  }
  tags = { Name = "${local.prefix}-prod-private-${each.key}" }
}

resource "aws_route_table_association" "private" {
  for_each       = aws_subnet.private
  subnet_id      = each.value.id
  route_table_id = aws_route_table.private[each.key].id
}

resource "aws_kms_key" "eks" {
  description             = "KloudLab EKS Kubernetes secret encryption"
  enable_key_rotation     = true
  deletion_window_in_days = 30
  tags                    = { Name = "${local.prefix}-prod-eks-secrets" }
}

resource "aws_kms_alias" "eks" {
  name          = "alias/${local.prefix}-prod-eks-secrets"
  target_key_id = aws_kms_key.eks.key_id
}

resource "aws_cloudwatch_log_group" "eks" {
  name              = "/aws/eks/${local.cluster_name}/cluster"
  retention_in_days = 30
}

resource "aws_iam_role" "eks_cluster" {
  name = "${local.prefix}-prod-eks-cluster"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "eks.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "eks_cluster" {
  role       = aws_iam_role.eks_cluster.name
  policy_arn = "arn:${data.aws_partition.current.partition}:iam::aws:policy/AmazonEKSClusterPolicy"
}

resource "aws_eks_cluster" "prod" {
  name     = local.cluster_name
  role_arn = aws_iam_role.eks_cluster.arn
  version  = var.eks_kubernetes_version

  access_config {
    authentication_mode                         = "API"
    bootstrap_cluster_creator_admin_permissions = false
  }

  vpc_config {
    subnet_ids              = values(aws_subnet.private)[*].id
    endpoint_private_access = true
    endpoint_public_access  = true
    public_access_cidrs     = var.cluster_public_access_cidrs
  }

  encryption_config {
    provider { key_arn = aws_kms_key.eks.arn }
    resources = ["secrets"]
  }

  enabled_cluster_log_types = ["api", "audit", "authenticator", "controllerManager", "scheduler"]
  depends_on                = [aws_iam_role_policy_attachment.eks_cluster, aws_cloudwatch_log_group.eks]
  tags                      = { Name = local.cluster_name }
}

resource "aws_eks_access_entry" "operator" {
  cluster_name      = aws_eks_cluster.prod.name
  principal_arn     = var.cluster_admin_role_arn
  type              = "STANDARD"
  kubernetes_groups = []
}

resource "aws_eks_access_policy_association" "operator_admin" {
  cluster_name  = aws_eks_cluster.prod.name
  principal_arn = aws_eks_access_entry.operator.principal_arn
  policy_arn    = "arn:${data.aws_partition.current.partition}:eks::aws:cluster-access-policy/AmazonEKSClusterAdminPolicy"
  access_scope { type = "cluster" }
}

resource "aws_iam_role" "eks_nodes" {
  name = "${local.prefix}-prod-eks-nodes"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "eks_worker" {
  role       = aws_iam_role.eks_nodes.name
  policy_arn = "arn:${data.aws_partition.current.partition}:iam::aws:policy/AmazonEKSWorkerNodePolicy"
}

resource "aws_iam_role_policy_attachment" "eks_ecr_read" {
  role       = aws_iam_role.eks_nodes.name
  policy_arn = "arn:${data.aws_partition.current.partition}:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly"
}

locals {
  baseline_node_groups = {
    platform = {
      instance_types = var.platform_instance_types
      desired_size   = var.platform_desired_size
      min_size       = var.platform_min_size
      max_size       = var.platform_max_size
    }
    backend = {
      instance_types = var.backend_instance_types
      desired_size   = var.backend_desired_size
      min_size       = var.backend_min_size
      max_size       = var.backend_max_size
    }
    observability = {
      instance_types = var.observability_instance_types
      desired_size   = var.observability_desired_size
      min_size       = var.observability_min_size
      max_size       = var.observability_max_size
    }
  }
}

resource "aws_eks_node_group" "baseline" {
  for_each        = local.baseline_node_groups
  cluster_name    = aws_eks_cluster.prod.name
  node_group_name = "${local.prefix}-prod-${each.key}"
  node_role_arn   = aws_iam_role.eks_nodes.arn
  subnet_ids      = values(aws_subnet.private)[*].id
  instance_types  = each.value.instance_types
  capacity_type   = "ON_DEMAND"
  disk_size       = 50

  scaling_config {
    desired_size = each.value.desired_size
    min_size     = each.value.min_size
    max_size     = each.value.max_size
  }

  update_config { max_unavailable = 1 }
  labels = { workload = each.key }
  depends_on = [
    aws_iam_role_policy_attachment.eks_worker,
    aws_iam_role_policy_attachment.eks_ecr_read,
    aws_eks_addon.vpc_cni,
  ]
  tags = { Name = "${local.prefix}-prod-${each.key}" }
}

resource "aws_eks_addon" "required" {
  for_each     = toset(["coredns", "kube-proxy"])
  cluster_name = aws_eks_cluster.prod.name
  addon_name   = each.key
  preserve     = true
  depends_on   = [aws_eks_node_group.baseline]
}

resource "aws_dynamodb_table" "sessions" {
  name                        = "${local.prefix}-prod-sessions"
  billing_mode                = "PAY_PER_REQUEST"
  hash_key                    = "PK"
  range_key                   = "SK"
  deletion_protection_enabled = true

  attribute {
    name = "PK"
    type = "S"
  }
  attribute {
    name = "SK"
    type = "S"
  }
  attribute {
    name = "GSI1PK"
    type = "S"
  }
  attribute {
    name = "GSI1SK"
    type = "S"
  }

  global_secondary_index {
    name            = "GSI1"
    hash_key        = "GSI1PK"
    range_key       = "GSI1SK"
    projection_type = "ALL"
  }

  ttl {
    attribute_name = "ttlEpoch"
    enabled        = true
  }
  point_in_time_recovery { enabled = true }
  server_side_encryption {
    enabled = true
  }
  tags = { Name = "${local.prefix}-prod-sessions" }
}

resource "aws_cognito_user_pool" "students" {
  name                     = "${local.prefix}-prod-students"
  auto_verified_attributes = ["email"]
  username_attributes      = ["email"]
  mfa_configuration        = "OPTIONAL"
  deletion_protection      = "ACTIVE"

  password_policy {
    minimum_length                   = 12
    require_lowercase                = true
    require_numbers                  = true
    require_symbols                  = true
    require_uppercase                = true
    temporary_password_validity_days = 7
  }
  tags = { Name = "${local.prefix}-prod-students" }
}

resource "aws_cognito_user_pool_client" "web" {
  name                                 = "${local.prefix}-prod-web"
  user_pool_id                         = aws_cognito_user_pool.students.id
  generate_secret                      = false
  prevent_user_existence_errors        = "ENABLED"
  enable_token_revocation              = true
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = ["openid", "email"]
  supported_identity_providers         = ["COGNITO"]
  callback_urls                        = var.cognito_callback_urls
  logout_urls                          = var.cognito_logout_urls
  explicit_auth_flows                  = ["ALLOW_REFRESH_TOKEN_AUTH"]
  access_token_validity                = 15
  id_token_validity                    = 60
  refresh_token_validity               = 30

  token_validity_units {
    access_token  = "minutes"
    id_token      = "minutes"
    refresh_token = "days"
  }
}

resource "aws_cognito_user_pool_domain" "students" {
  domain       = var.cognito_domain_prefix
  user_pool_id = aws_cognito_user_pool.students.id
}

resource "aws_iam_openid_connect_provider" "eks" {
  url             = aws_eks_cluster.prod.identity[0].oidc[0].issuer
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = ["9e99a48a9960b14926bb7f3b02e22da0afd10df6"]
}

resource "aws_iam_role" "vpc_cni" {
  name = "${local.prefix}-prod-vpc-cni"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = aws_iam_openid_connect_provider.eks.arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "${replace(aws_eks_cluster.prod.identity[0].oidc[0].issuer, "https://", "")}:aud" = "sts.amazonaws.com"
          "${replace(aws_eks_cluster.prod.identity[0].oidc[0].issuer, "https://", "")}:sub" = "system:serviceaccount:kube-system:aws-node"
        }
      }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "vpc_cni" {
  role       = aws_iam_role.vpc_cni.name
  policy_arn = "arn:${data.aws_partition.current.partition}:iam::aws:policy/AmazonEKS_CNI_Policy"
}

resource "aws_eks_addon" "vpc_cni" {
  cluster_name             = aws_eks_cluster.prod.name
  addon_name               = "vpc-cni"
  service_account_role_arn = aws_iam_role.vpc_cni.arn
  preserve                 = true
  depends_on               = [aws_iam_role_policy_attachment.vpc_cni]
}

resource "aws_iam_role" "api" {
  name = "${local.prefix}-prod-api"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = aws_iam_openid_connect_provider.eks.arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "${replace(aws_eks_cluster.prod.identity[0].oidc[0].issuer, "https://", "")}:aud" = "sts.amazonaws.com"
          "${replace(aws_eks_cluster.prod.identity[0].oidc[0].issuer, "https://", "")}:sub" = "system:serviceaccount:kloudlab-system:kloudlab-api"
        }
      }
    }]
  })
}

resource "aws_iam_role_policy" "api_sessions" {
  name = "${local.prefix}-prod-api-sessions"
  role = aws_iam_role.api.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:Query"]
      Resource = [aws_dynamodb_table.sessions.arn, "${aws_dynamodb_table.sessions.arn}/index/GSI1"]
    }]
  })
}

resource "aws_ecr_repository" "api" {
  name                 = "${local.prefix}/api"
  image_tag_mutability = "IMMUTABLE"
  image_scanning_configuration { scan_on_push = true }
  encryption_configuration { encryption_type = "AES256" }
  force_delete = false
}

resource "aws_ecr_lifecycle_policy" "api" {
  repository = aws_ecr_repository.api.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep the 30 most recently pushed application images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 30
      }
      action = { type = "expire" }
    }]
  })
}

resource "aws_ecr_repository" "web" {
  name                 = "${local.prefix}/web"
  image_tag_mutability = "IMMUTABLE"
  image_scanning_configuration { scan_on_push = true }
  encryption_configuration { encryption_type = "AES256" }
  force_delete = false
}

resource "aws_iam_openid_connect_provider" "github" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]
}

resource "aws_iam_role" "github_actions" {
  name = "${local.prefix}-prod-github-actions"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = aws_iam_openid_connect_provider.github.arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          "token.actions.githubusercontent.com:sub" = "repo:${var.github_repository}:ref:refs/heads/main"
        }
      }
    }]
  })
}

resource "aws_iam_role_policy" "github_ecr_push" {
  name = "${local.prefix}-prod-ecr-push"
  role = aws_iam_role.github_actions.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["ecr:GetAuthorizationToken"]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "ecr:BatchCheckLayerAvailability",
          "ecr:CompleteLayerUpload",
          "ecr:InitiateLayerUpload",
          "ecr:PutImage",
          "ecr:UploadLayerPart",
        ]
        Resource = [aws_ecr_repository.api.arn, aws_ecr_repository.web.arn]
      }
    ]
  })
}

resource "aws_ecr_lifecycle_policy" "web" {
  repository = aws_ecr_repository.web.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep the 30 most recently pushed application images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 30
      }
      action = { type = "expire" }
    }]
  })
}

resource "aws_eks_access_entry" "karpenter_nodes" {
  cluster_name  = aws_eks_cluster.prod.name
  principal_arn = aws_iam_role.karpenter_node.arn
  type          = "EC2_LINUX"
}

resource "aws_iam_role" "karpenter_node" {
  name = "${local.prefix}-prod-karpenter-node"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "karpenter_node" {
  for_each = toset([
    "AmazonEKS_CNI_Policy",
    "AmazonEKSWorkerNodePolicy",
    "AmazonEC2ContainerRegistryPullOnly",
    "AmazonSSMManagedInstanceCore",
  ])
  role       = aws_iam_role.karpenter_node.name
  policy_arn = "arn:${data.aws_partition.current.partition}:iam::aws:policy/${each.key}"
}

resource "aws_iam_role" "karpenter_controller" {
  name = "${local.prefix}-prod-karpenter-controller"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = aws_iam_openid_connect_provider.eks.arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "${replace(aws_eks_cluster.prod.identity[0].oidc[0].issuer, "https://", "")}:aud" = "sts.amazonaws.com"
          "${replace(aws_eks_cluster.prod.identity[0].oidc[0].issuer, "https://", "")}:sub" = "system:serviceaccount:kube-system:karpenter"
        }
      }
    }]
  })
}

resource "aws_sqs_queue" "karpenter_interruptions" {
  name                      = local.cluster_name
  message_retention_seconds = 300
  sqs_managed_sse_enabled   = true
  tags                      = { Name = "${local.cluster_name}-interruptions" }
}

resource "aws_cloudwatch_event_rule" "karpenter_spot_interruption" {
  name        = "${local.cluster_name}-spot-interruption"
  description = "Forward EC2 Spot interruption notices to Karpenter."
  event_pattern = jsonencode({
    source      = ["aws.ec2"]
    detail-type = ["EC2 Spot Instance Interruption Warning"]
  })
}

resource "aws_cloudwatch_event_rule" "karpenter_rebalance" {
  name        = "${local.cluster_name}-rebalance"
  description = "Forward EC2 rebalance recommendations to Karpenter."
  event_pattern = jsonencode({
    source      = ["aws.ec2"]
    detail-type = ["EC2 Instance Rebalance Recommendation"]
  })
}

resource "aws_cloudwatch_event_rule" "karpenter_instance_state" {
  name        = "${local.cluster_name}-instance-state"
  description = "Forward EC2 state changes to Karpenter."
  event_pattern = jsonencode({
    source      = ["aws.ec2"]
    detail-type = ["EC2 Instance State-change Notification"]
  })
}

resource "aws_cloudwatch_event_rule" "karpenter_health" {
  name        = "${local.cluster_name}-health"
  description = "Forward AWS Health events to Karpenter."
  event_pattern = jsonencode({
    source      = ["aws.health"]
    detail-type = ["AWS Health Event"]
    detail      = { service = ["EC2"] }
  })
}

resource "aws_cloudwatch_event_target" "karpenter_interruptions" {
  for_each = {
    spot      = aws_cloudwatch_event_rule.karpenter_spot_interruption.name
    rebalance = aws_cloudwatch_event_rule.karpenter_rebalance.name
    state     = aws_cloudwatch_event_rule.karpenter_instance_state.name
    health    = aws_cloudwatch_event_rule.karpenter_health.name
  }
  rule      = each.value
  target_id = "karpenter-interruption-queue"
  arn       = aws_sqs_queue.karpenter_interruptions.arn
}

resource "aws_sqs_queue_policy" "karpenter_interruptions" {
  queue_url = aws_sqs_queue.karpenter_interruptions.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Principal = { Service = "events.amazonaws.com" }
        Action    = "sqs:SendMessage"
        Resource  = aws_sqs_queue.karpenter_interruptions.arn
        Condition = { ArnEquals = { "aws:SourceArn" = aws_cloudwatch_event_rule.karpenter_spot_interruption.arn } }
      },
      {
        Effect    = "Allow"
        Principal = { Service = "events.amazonaws.com" }
        Action    = "sqs:SendMessage"
        Resource  = aws_sqs_queue.karpenter_interruptions.arn
        Condition = { ArnEquals = { "aws:SourceArn" = aws_cloudwatch_event_rule.karpenter_rebalance.arn } }
      },
      {
        Effect    = "Allow"
        Principal = { Service = "events.amazonaws.com" }
        Action    = "sqs:SendMessage"
        Resource  = aws_sqs_queue.karpenter_interruptions.arn
        Condition = { ArnEquals = { "aws:SourceArn" = aws_cloudwatch_event_rule.karpenter_instance_state.arn } }
      },
      {
        Effect    = "Allow"
        Principal = { Service = "events.amazonaws.com" }
        Action    = "sqs:SendMessage"
        Resource  = aws_sqs_queue.karpenter_interruptions.arn
        Condition = { ArnEquals = { "aws:SourceArn" = aws_cloudwatch_event_rule.karpenter_health.arn } }
      },
      {
        Effect    = "Deny"
        Principal = "*"
        Action    = "sqs:*"
        Resource  = aws_sqs_queue.karpenter_interruptions.arn
        Condition = { Bool = { "aws:SecureTransport" = "false" } }
      },
    ]
  })
}

resource "aws_iam_role_policy" "karpenter_controller" {
  name = "${local.prefix}-prod-karpenter-controller"
  role = aws_iam_role.karpenter_controller.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "RegionalResourceDiscovery"
        Effect = "Allow"
        Action = [
          "ec2:DescribeAvailabilityZones", "ec2:DescribeCapacityReservations", "ec2:DescribeImages",
          "ec2:DescribeInstances", "ec2:DescribeInstanceStatus", "ec2:DescribeInstanceTypeOfferings",
          "ec2:DescribeInstanceTypes", "ec2:DescribeLaunchTemplates", "ec2:DescribePlacementGroups",
          "ec2:DescribeSecurityGroups", "ec2:DescribeSpotPriceHistory", "ec2:DescribeSubnets", "ec2:DescribeVpcs",
        ]
        Resource  = "*"
        Condition = { StringEquals = { "aws:RequestedRegion" = var.aws_region } }
      },
      {
        Sid      = "ReadEksAmiParameters"
        Effect   = "Allow"
        Action   = "ssm:GetParameter"
        Resource = "arn:${data.aws_partition.current.partition}:ssm:${var.aws_region}::parameter/aws/service/*"
      },
      {
        Sid      = "ReadEc2Pricing"
        Effect   = "Allow"
        Action   = "pricing:GetProducts"
        Resource = "*"
      },
      {
        Sid      = "DescribeThisCluster"
        Effect   = "Allow"
        Action   = "eks:DescribeCluster"
        Resource = aws_eks_cluster.prod.arn
      },
      {
        Sid    = "ReadLaunchDependencies"
        Effect = "Allow"
        Action = ["ec2:RunInstances", "ec2:CreateFleet"]
        Resource = [
          "arn:${data.aws_partition.current.partition}:ec2:${var.aws_region}::image/*",
          "arn:${data.aws_partition.current.partition}:ec2:${var.aws_region}::snapshot/*",
          "arn:${data.aws_partition.current.partition}:ec2:${var.aws_region}:${data.aws_caller_identity.current.account_id}:security-group/*",
          "arn:${data.aws_partition.current.partition}:ec2:${var.aws_region}:${data.aws_caller_identity.current.account_id}:subnet/*",
          "arn:${data.aws_partition.current.partition}:ec2:${var.aws_region}:${data.aws_caller_identity.current.account_id}:capacity-reservation/*",
          "arn:${data.aws_partition.current.partition}:ec2:${var.aws_region}:${data.aws_caller_identity.current.account_id}:placement-group/*",
        ]
      },
      {
        Sid      = "UseKarpenterLaunchTemplates"
        Effect   = "Allow"
        Action   = ["ec2:RunInstances", "ec2:CreateFleet"]
        Resource = "arn:${data.aws_partition.current.partition}:ec2:${var.aws_region}:${data.aws_caller_identity.current.account_id}:launch-template/*"
        Condition = {
          StringEquals = { "aws:ResourceTag/kubernetes.io/cluster/${local.cluster_name}" = "owned" }
          StringLike   = { "aws:ResourceTag/karpenter.sh/nodepool" = "*" }
        }
      },
      {
        Sid    = "CreateTaggedKarpenterCapacity"
        Effect = "Allow"
        Action = ["ec2:RunInstances", "ec2:CreateFleet", "ec2:CreateLaunchTemplate"]
        Resource = [
          "arn:${data.aws_partition.current.partition}:ec2:${var.aws_region}:${data.aws_caller_identity.current.account_id}:fleet/*",
          "arn:${data.aws_partition.current.partition}:ec2:${var.aws_region}:${data.aws_caller_identity.current.account_id}:instance/*",
          "arn:${data.aws_partition.current.partition}:ec2:${var.aws_region}:${data.aws_caller_identity.current.account_id}:volume/*",
          "arn:${data.aws_partition.current.partition}:ec2:${var.aws_region}:${data.aws_caller_identity.current.account_id}:network-interface/*",
          "arn:${data.aws_partition.current.partition}:ec2:${var.aws_region}:${data.aws_caller_identity.current.account_id}:launch-template/*",
          "arn:${data.aws_partition.current.partition}:ec2:${var.aws_region}:${data.aws_caller_identity.current.account_id}:spot-instances-request/*",
        ]
        Condition = {
          StringEquals = {
            "aws:RequestTag/kubernetes.io/cluster/${local.cluster_name}" = "owned"
            "aws:RequestTag/eks:eks-cluster-name"                        = local.cluster_name
          }
          StringLike = { "aws:RequestTag/karpenter.sh/nodepool" = "*" }
        }
      },
      {
        Sid    = "TagCapacityOnCreation"
        Effect = "Allow"
        Action = "ec2:CreateTags"
        Resource = [
          "arn:${data.aws_partition.current.partition}:ec2:${var.aws_region}:${data.aws_caller_identity.current.account_id}:fleet/*",
          "arn:${data.aws_partition.current.partition}:ec2:${var.aws_region}:${data.aws_caller_identity.current.account_id}:instance/*",
          "arn:${data.aws_partition.current.partition}:ec2:${var.aws_region}:${data.aws_caller_identity.current.account_id}:volume/*",
          "arn:${data.aws_partition.current.partition}:ec2:${var.aws_region}:${data.aws_caller_identity.current.account_id}:network-interface/*",
          "arn:${data.aws_partition.current.partition}:ec2:${var.aws_region}:${data.aws_caller_identity.current.account_id}:launch-template/*",
          "arn:${data.aws_partition.current.partition}:ec2:${var.aws_region}:${data.aws_caller_identity.current.account_id}:spot-instances-request/*",
        ]
        Condition = {
          StringEquals = {
            "aws:RequestTag/kubernetes.io/cluster/${local.cluster_name}" = "owned"
            "aws:RequestTag/eks:eks-cluster-name"                        = local.cluster_name
            "ec2:CreateAction"                                           = ["RunInstances", "CreateFleet", "CreateLaunchTemplate"]
          }
          StringLike = { "aws:RequestTag/karpenter.sh/nodepool" = "*" }
        }
      },
      {
        Sid      = "TagKarpenterInstances"
        Effect   = "Allow"
        Action   = "ec2:CreateTags"
        Resource = "arn:${data.aws_partition.current.partition}:ec2:${var.aws_region}:${data.aws_caller_identity.current.account_id}:instance/*"
        Condition = {
          StringEquals                = { "aws:ResourceTag/kubernetes.io/cluster/${local.cluster_name}" = "owned" }
          StringEqualsIfExists        = { "aws:RequestTag/eks:eks-cluster-name" = local.cluster_name }
          StringLike                  = { "aws:ResourceTag/karpenter.sh/nodepool" = "*" }
          "ForAllValues:StringEquals" = { "aws:TagKeys" = ["eks:eks-cluster-name", "karpenter.sh/nodeclaim", "Name"] }
        }
      },
      {
        Sid    = "DeleteKarpenterCapacity"
        Effect = "Allow"
        Action = ["ec2:TerminateInstances", "ec2:RebootInstances", "ec2:DeleteLaunchTemplate"]
        Resource = [
          "arn:${data.aws_partition.current.partition}:ec2:${var.aws_region}:${data.aws_caller_identity.current.account_id}:instance/*",
          "arn:${data.aws_partition.current.partition}:ec2:${var.aws_region}:${data.aws_caller_identity.current.account_id}:launch-template/*",
        ]
        Condition = {
          StringEquals = { "aws:ResourceTag/kubernetes.io/cluster/${local.cluster_name}" = "owned" }
          StringLike   = { "aws:ResourceTag/karpenter.sh/nodepool" = "*" }
        }
      },
      {
        Sid       = "PassKarpenterNodeRole"
        Effect    = "Allow"
        Action    = "iam:PassRole"
        Resource  = aws_iam_role.karpenter_node.arn
        Condition = { StringEquals = { "iam:PassedToService" = ["ec2.amazonaws.com", "ec2.amazonaws.com.cn"] } }
      },
      {
        Sid      = "CreateTaggedKarpenterInstanceProfiles"
        Effect   = "Allow"
        Action   = "iam:CreateInstanceProfile"
        Resource = "arn:${data.aws_partition.current.partition}:iam::${data.aws_caller_identity.current.account_id}:instance-profile/*"
        Condition = {
          StringEquals = {
            "aws:RequestTag/kubernetes.io/cluster/${local.cluster_name}" = "owned"
            "aws:RequestTag/eks:eks-cluster-name"                        = local.cluster_name
            "aws:RequestTag/topology.kubernetes.io/region"               = var.aws_region
          }
          StringLike = { "aws:RequestTag/karpenter.k8s.aws/ec2nodeclass" = "*" }
        }
      },
      {
        Sid      = "TagKarpenterInstanceProfiles"
        Effect   = "Allow"
        Action   = "iam:TagInstanceProfile"
        Resource = "arn:${data.aws_partition.current.partition}:iam::${data.aws_caller_identity.current.account_id}:instance-profile/*"
        Condition = {
          StringEquals = {
            "aws:ResourceTag/kubernetes.io/cluster/${local.cluster_name}" = "owned"
            "aws:ResourceTag/topology.kubernetes.io/region"               = var.aws_region
            "aws:RequestTag/kubernetes.io/cluster/${local.cluster_name}"  = "owned"
            "aws:RequestTag/eks:eks-cluster-name"                         = local.cluster_name
            "aws:RequestTag/topology.kubernetes.io/region"                = var.aws_region
          }
          StringLike = {
            "aws:ResourceTag/karpenter.k8s.aws/ec2nodeclass" = "*"
            "aws:RequestTag/karpenter.k8s.aws/ec2nodeclass"  = "*"
          }
        }
      },
      {
        Sid      = "ManageKarpenterInstanceProfiles"
        Effect   = "Allow"
        Action   = ["iam:AddRoleToInstanceProfile", "iam:RemoveRoleFromInstanceProfile", "iam:DeleteInstanceProfile"]
        Resource = "arn:${data.aws_partition.current.partition}:iam::${data.aws_caller_identity.current.account_id}:instance-profile/*"
        Condition = {
          StringEquals = {
            "aws:ResourceTag/kubernetes.io/cluster/${local.cluster_name}" = "owned"
            "aws:ResourceTag/topology.kubernetes.io/region"               = var.aws_region
          }
          StringLike = { "aws:ResourceTag/karpenter.k8s.aws/ec2nodeclass" = "*" }
        }
      },
      {
        Sid      = "ReadKarpenterInstanceProfile"
        Effect   = "Allow"
        Action   = "iam:GetInstanceProfile"
        Resource = "arn:${data.aws_partition.current.partition}:iam::${data.aws_caller_identity.current.account_id}:instance-profile/*"
      },
      {
        Sid      = "ListKarpenterInstanceProfiles"
        Effect   = "Allow"
        Action   = "iam:ListInstanceProfiles"
        Resource = "*"
      },
      {
        Sid      = "ReadKarpenterInterruptions"
        Effect   = "Allow"
        Action   = ["sqs:DeleteMessage", "sqs:GetQueueUrl", "sqs:ReceiveMessage"]
        Resource = aws_sqs_queue.karpenter_interruptions.arn
      },
    ]
  })
}

resource "aws_ec2_tag" "karpenter_private_subnets" {
  for_each    = aws_subnet.private
  resource_id = each.value.id
  key         = "karpenter.sh/discovery"
  value       = local.cluster_name
}

resource "aws_ec2_tag" "karpenter_cluster_security_group" {
  resource_id = aws_eks_cluster.prod.vpc_config[0].cluster_security_group_id
  key         = "karpenter.sh/discovery"
  value       = local.cluster_name
}
