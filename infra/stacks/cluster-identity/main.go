package main

import (
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"

	clusterprogram "github.com/harishsudalaimani/kloudlab/infra/stacks/cluster-program"
)

func main() {
	pulumi.Run(func(ctx *pulumi.Context) error {
		return clusterprogram.Run(ctx, "identity")
	})
}
