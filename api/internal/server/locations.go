package server

import (
	"embed"
	"encoding/json"
	"strings"
)

//go:embed data/romania-localities.json
var locationFiles embed.FS
var romanianLocalities = func() map[string]struct{ County, City string } {
	data, err := locationFiles.ReadFile("data/romania-localities.json")
	if err != nil {
		panic(err)
	}
	var counties []struct {
		Name       string `json:"name"`
		Localities []struct {
			ID   string `json:"id"`
			Name string `json:"name"`
		} `json:"localities"`
	}
	if err := json.Unmarshal(data, &counties); err != nil {
		panic(err)
	}
	index := map[string]struct{ County, City string }{}
	for _, county := range counties {
		for _, city := range county.Localities {
			index[city.ID] = struct{ County, City string }{county.Name, city.Name}
		}
	}
	return index
}()

func validateTaskLocation(req CreateTaskRequest) *AppError {
	if req.County == "" && req.LocalityID == "" {
		return nil
	}
	place, ok := romanianLocalities[strings.TrimSpace(req.LocalityID)]
	if !ok || place.County != strings.TrimSpace(req.County) || place.City != strings.TrimSpace(req.City) {
		return invalidInput("Alege județul și localitatea corectă din listă.")
	}
	return nil
}
