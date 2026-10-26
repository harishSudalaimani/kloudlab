// Package dns defines DNS and certificate component contracts.
package dns

import "github.com/pulumi/pulumi/sdk/v3/go/pulumi"

// HostedZoneArgs identifies an existing or separately managed DNS zone.
type HostedZoneArgs struct {
	Name   string
	ZoneID pulumi.StringInput
}

// HostedZone exposes the zone identifier required by records and validation.
type HostedZone interface {
	pulumi.Resource
	ID() pulumi.StringOutput
}

// CertificateArgs describes a certificate request; validation records must be
// created only in the explicitly authorized hosted zone.
type CertificateArgs struct {
	DomainName              pulumi.StringInput
	SubjectAlternativeNames pulumi.StringArrayInput
	HostedZoneID            pulumi.StringInput
}

// Certificate exposes an ARN for gateway integrations.
type Certificate interface {
	pulumi.Resource
	ARN() pulumi.StringOutput
}
