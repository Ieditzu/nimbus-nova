package main

import (
	"log"
	"net/http"
	"os"

	"github.com/Ieditzu/nimbus-nova/api/internal/server"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	dbPath := os.Getenv("DATABASE_PATH")
	if dbPath == "" {
		dbPath = "nova.db"
	}
	srv, err := server.New(dbPath)
	if err != nil {
		log.Fatal(err)
	}
	defer srv.Close()
	addr := "0.0.0.0:" + port
	log.Fatal(http.ListenAndServe(addr, srv.Handler()))
}
