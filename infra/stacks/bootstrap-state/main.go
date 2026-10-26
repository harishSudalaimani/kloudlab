package main

import (
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"

	stateprogram "github.com/harishsudalaimani/kloudlab/infra/stacks/state-program"
)

func main() {
	pulumi.Run(stateprogram.Run)
}
