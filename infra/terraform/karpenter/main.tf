resource "kubernetes_service_account_v1" "karpenter" {
  metadata {
    name      = "karpenter"
    namespace = "kube-system"
    annotations = {
      "eks.amazonaws.com/role-arn" = var.karpenter_controller_role_arn
    }
  }
}

resource "helm_release" "karpenter" {
  name             = "karpenter"
  namespace        = "kube-system"
  repository       = "oci://public.ecr.aws/karpenter"
  chart            = "karpenter"
  version          = var.karpenter_version
  create_namespace = false
  atomic           = true
  cleanup_on_fail  = true
  wait             = true
  timeout          = 900

  values = [yamlencode({
    serviceAccount = {
      create = false
      name   = kubernetes_service_account_v1.karpenter.metadata[0].name
    }
    settings = {
      clusterName       = var.cluster_name
      interruptionQueue = var.interruption_queue_name
    }
    controller = {
      nodeSelector = { workload = "platform" }
      resources = {
        requests = { cpu = "250m", memory = "512Mi" }
        limits   = { cpu = "500m", memory = "1Gi" }
      }
    }
  })]
}

resource "kubernetes_manifest" "student_labs_node_class" {
  manifest = yamldecode(templatefile("${path.module}/manifests/student-labs-ec2nodeclass.yaml.tftpl", {
    cluster_name   = var.cluster_name
    node_ami_alias = var.node_ami_alias
    node_role_name = var.karpenter_node_role_name
  }))

  depends_on = [helm_release.karpenter]
}

resource "kubernetes_manifest" "student_labs_node_pool" {
  manifest = yamldecode(templatefile("${path.module}/manifests/student-labs-nodepool.yaml.tftpl", {
    instance_type = var.lab_instance_type
    cpu_limit     = var.lab_node_cpu_limit
    memory_limit  = var.lab_node_memory_limit
  }))

  depends_on = [kubernetes_manifest.student_labs_node_class]
}
