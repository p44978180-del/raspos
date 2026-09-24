package authz

import _ "embed"

// JSON is the authorization model posted to OpenFGA.
// model.fga is the same model in the readable DSL.
//
//go:embed model.json
var JSON []byte
