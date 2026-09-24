package authz

import (
	"context"
	"sync/atomic"

	openfgaclient "github.com/openfga/go-sdk/client"
)

// OpenFGA talks to a running OpenFGA server. Calls counts Check invocations.
type OpenFGA struct {
	api   *openfgaclient.OpenFgaClient
	calls atomic.Int32
}

func Dial(apiURL, storeID, modelID string) (*OpenFGA, error) {
	api, err := openfgaclient.NewSdkClient(&openfgaclient.ClientConfiguration{
		ApiUrl:               apiURL,
		StoreId:              storeID,
		AuthorizationModelId: modelID,
	})
	if err != nil {
		return nil, err
	}
	return &OpenFGA{api: api}, nil
}

func (c *OpenFGA) Calls() int { return int(c.calls.Load()) }

func (c *OpenFGA) Check(ctx context.Context, check Check) (bool, error) {
	c.calls.Add(1)
	response, err := c.api.Check(ctx).Body(openfgaclient.ClientCheckRequest{
		User:     "user:" + check.UserID,
		Relation: check.Relation,
		Object:   check.ObjectType + ":" + check.ObjectID,
	}).Execute()
	if err != nil {
		return false, err
	}
	return response.GetAllowed(), nil
}

func (c *OpenFGA) Write(ctx context.Context, tuples []Tuple) error {
	return c.change(ctx, tuples, true)
}

func (c *OpenFGA) Delete(ctx context.Context, tuples []Tuple) error {
	return c.change(ctx, tuples, false)
}

func (c *OpenFGA) change(ctx context.Context, tuples []Tuple, write bool) error {
	if len(tuples) == 0 {
		return nil
	}
	if write {
		keys := make([]openfgaclient.ClientTupleKey, len(tuples))
		for i, tuple := range tuples {
			keys[i] = openfgaclient.ClientTupleKey{User: tuple.User, Relation: tuple.Relation, Object: tuple.Object}
		}
		_, err := c.api.Write(ctx).Body(openfgaclient.ClientWriteRequest{Writes: keys}).Execute()
		return err
	}
	keys := make([]openfgaclient.ClientTupleKeyWithoutCondition, len(tuples))
	for i, tuple := range tuples {
		keys[i] = openfgaclient.ClientTupleKeyWithoutCondition{User: tuple.User, Relation: tuple.Relation, Object: tuple.Object}
	}
	_, err := c.api.Write(ctx).Body(openfgaclient.ClientWriteRequest{Deletes: keys}).Execute()
	return err
}
