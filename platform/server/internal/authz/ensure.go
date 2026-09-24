package authz

import (
	"context"
	"encoding/json"

	openfga "github.com/openfga/go-sdk"
	openfgaclient "github.com/openfga/go-sdk/client"

	fgamodel "raspos/platform/server/authz"
)

const StoreName = "timacad"

// Ensure returns a client for the timacad store.
// An empty store id reuses the store named timacad, or creates it.
// An empty model id writes the embedded model and uses the id OpenFGA returns.
func Ensure(ctx context.Context, apiURL, storeID, modelID string) (*OpenFGA, string, string, error) {
	bootstrap, err := openfgaclient.NewSdkClient(&openfgaclient.ClientConfiguration{ApiUrl: apiURL})
	if err != nil {
		return nil, "", "", err
	}
	if storeID == "" {
		name := StoreName
		listed, err := bootstrap.ListStores(ctx).Options(openfgaclient.ClientListStoresOptions{Name: &name}).Execute()
		if err != nil {
			return nil, "", "", err
		}
		stores := listed.GetStores()
		if len(stores) > 0 {
			storeID = stores[0].GetId()
		} else {
			created, err := bootstrap.CreateStore(ctx).Body(openfgaclient.ClientCreateStoreRequest{Name: StoreName}).Execute()
			if err != nil {
				return nil, "", "", err
			}
			storeID = created.GetId()
		}
	}
	if err := bootstrap.SetStoreId(storeID); err != nil {
		return nil, "", "", err
	}
	if modelID == "" {
		var model openfga.WriteAuthorizationModelRequest
		if err := json.Unmarshal(fgamodel.JSON, &model); err != nil {
			return nil, "", "", err
		}
		written, err := bootstrap.WriteAuthorizationModel(ctx).Body(model).Execute()
		if err != nil {
			return nil, "", "", err
		}
		modelID = written.GetAuthorizationModelId()
	}
	client, err := Dial(apiURL, storeID, modelID)
	if err != nil {
		return nil, "", "", err
	}
	return client, storeID, modelID, nil
}
