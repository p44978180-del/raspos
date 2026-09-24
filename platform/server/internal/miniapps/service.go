package miniapps

import (
	"context"
	"errors"

	"connectrpc.com/connect"

	miniappsv1 "raspos/platform/server/internal/gen/timacad/miniapps/v1"
)

type Service struct {
	Registry Registry
}

func (s *Service) Resolve(ctx context.Context, req *connect.Request[miniappsv1.ResolveRequest]) (*connect.Response[miniappsv1.ResolveResponse], error) {
	if req.Msg.GetAppId() == "" {
		return nil, connect.NewError(connect.CodeInvalidArgument, errors.New("app_id is required"))
	}
	release, err := s.Registry.Resolve(ctx, req.Msg.GetAppId())
	if errors.Is(err, ErrNotPublished) {
		return nil, connect.NewError(connect.CodeNotFound, err)
	}
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(&miniappsv1.ResolveResponse{
		Version: release.Version, BundleSha256: release.BundleSHA256, Signature: release.Signature,
		HostMethods: release.HostMethods,
	}), nil
}
