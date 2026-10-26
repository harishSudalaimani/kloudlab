package main

import (
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"

	connectivityprogram "github.com/harishsudalaimani/kloudlab/infra/stacks/connectivity-program"
)

func main() {
	pulumi.Run(connectivityprogram.Run)
}
