package main

import (
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"

	networkprogram "github.com/harishsudalaimani/kloudlab/infra/stacks/network-program"
)

func main() {
	pulumi.Run(func(ctx *pulumi.Context) error {
		return networkprogram.Run(ctx, "app")
	})
}
