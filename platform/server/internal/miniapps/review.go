package miniapps

import (
	"context"
	"crypto/ed25519"
	"time"

	"go.temporal.io/sdk/temporal"
	"go.temporal.io/sdk/workflow"
)

const ReviewSignal = "review"

type Submission struct {
	ManifestJSON []byte
	Bundle       []byte
}

type Checked struct {
	AppID   string
	Version string
}

type Activities struct {
	Registry  Registry
	Publisher ed25519.PublicKey
}

func (a *Activities) CheckMiniapp(ctx context.Context, submission Submission) (Checked, error) {
	if len(submission.Bundle) == 0 || len(submission.Bundle) > MaxBundleBytes {
		return Checked{}, temporal.NewNonRetryableApplicationError("bundle size is invalid", "invalid", nil)
	}
	manifest, err := Parse(submission.ManifestJSON)
	if err != nil {
		return Checked{}, temporal.NewNonRetryableApplicationError(err.Error(), "invalid", err)
	}
	if err := Verify(a.Publisher, manifest, submission.Bundle); err != nil {
		return Checked{}, temporal.NewNonRetryableApplicationError(err.Error(), "unsigned", err)
	}
	if err := a.Registry.StoreBundle(ctx, manifest.BundleSHA256, submission.Bundle); err != nil {
		return Checked{}, err
	}
	if err := a.Registry.InsertReview(ctx, manifest); err != nil {
		return Checked{}, err
	}
	return Checked{AppID: manifest.ID, Version: manifest.Version}, nil
}

func (a *Activities) SetMiniappStatus(ctx context.Context, appID, version, status string) error {
	if status != "published" && status != "rejected" {
		return temporal.NewNonRetryableApplicationError("review decision is invalid", "invalid", nil)
	}
	return a.Registry.SetStatus(ctx, appID, version, status)
}

// ReviewMiniapp checks the bundle, then waits for an approve or reject signal.
func ReviewMiniapp(ctx workflow.Context, submission Submission) error {
	ctx = workflow.WithActivityOptions(ctx, workflow.ActivityOptions{
		StartToCloseTimeout: 2 * time.Minute,
		RetryPolicy:         &temporal.RetryPolicy{MaximumAttempts: 1},
	})
	var checked Checked
	if err := workflow.ExecuteActivity(ctx, "CheckMiniapp", submission).Get(ctx, &checked); err != nil {
		return err
	}
	var decision string
	workflow.GetSignalChannel(ctx, ReviewSignal).Receive(ctx, &decision)
	status := "rejected"
	if decision == "approve" {
		status = "published"
	}
	return workflow.ExecuteActivity(ctx, "SetMiniappStatus", checked.AppID, checked.Version, status).Get(ctx, nil)
}
