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
  for_each   = local.subnets
  domain     = "vpc"
  depends_on = [aws_internet_gateway.prod]
  tags       = { Name = "${local.prefix}-prod-nat-${each.key}" }
}

resource "aws_nat_gateway" "prod" {
  for_each      = local.subnets
  allocation_id = aws_eip.nat[each.key].id
  subnet_id     = aws_subnet.public[each.key].id
  depends_on    = [aws_internet_gateway.prod]
  tags          = { Name = "${local.prefix}-prod-nat-${each.key}" }
}

resource "aws_route_table" "private" {
  for_each = local.subnets
  vpc_id   = aws_vpc.prod.id
  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.prod[each.key].id
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

resource "aws_eks_node_group" "platform" {
  cluster_name    = aws_eks_cluster.prod.name
  node_group_name = "${local.prefix}-prod-platform"
  node_role_arn   = aws_iam_role.eks_nodes.arn
  subnet_ids      = values(aws_subnet.private)[*].id
  instance_types  = var.platform_instance_types
  capacity_type   = "ON_DEMAND"
  disk_size       = 40

  scaling_config {
    desired_size = var.platform_desired_size
    min_size     = var.platform_min_size
    max_size     = var.platform_max_size
  }

  update_config { max_unavailable = 1 }
  labels = { workload = "platform" }
  depends_on = [
    aws_iam_role_policy_attachment.eks_worker,
    aws_iam_role_policy_attachment.eks_ecr_read,
    aws_eks_addon.vpc_cni,
  ]
  tags = { Name = "${local.prefix}-prod-platform" }
}

resource "aws_eks_node_group" "labs" {
  cluster_name    = aws_eks_cluster.prod.name
  node_group_name = "${local.prefix}-prod-labs"
  node_role_arn   = aws_iam_role.eks_nodes.arn
  subnet_ids      = values(aws_subnet.private)[*].id
  instance_types  = var.lab_instance_types
  capacity_type   = "ON_DEMAND"
  disk_size       = 50

  scaling_config {
    desired_size = var.lab_desired_size
    min_size     = var.lab_min_size
    max_size     = var.lab_max_size
  }

  update_config { max_unavailable = 1 }
  labels = { workload = "student-labs" }
  taint {
    key    = "workload"
    value  = "student-labs"
    effect = "NO_SCHEDULE"
  }
  depends_on = [
    aws_iam_role_policy_attachment.eks_worker,
    aws_iam_role_policy_attachment.eks_ecr_read,
    aws_eks_addon.vpc_cni,
  ]
  tags = { Name = "${local.prefix}-prod-labs" }
}

resource "aws_eks_addon" "required" {
  for_each     = toset(["coredns", "kube-proxy"])
  cluster_name = aws_eks_cluster.prod.name
  addon_name   = each.key
  preserve     = true
  depends_on = [
    aws_eks_node_group.platform,
    aws_eks_node_group.labs,
  ]
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
