package config

import (
	"os"
	"strconv"
)

type Config struct {
	Port             string
	DatabaseURL      string
	RedisURL         string
	PythonBin        string
	ParserScriptPath string
	ScheduleDataPath string
	AutoSeed         bool
}

func Load() *Config {
	return &Config{
		Port:             getEnv("PORT", "8080"),
		DatabaseURL:      getEnv("DATABASE_URL", ""),
		RedisURL:         getEnv("REDIS_URL", "redis://localhost:6379/0"),
		PythonBin:        getEnv("PYTHON_BIN", "python3"),
		ParserScriptPath: getEnv("PARSER_SCRIPT_PATH", "../scripts/timacad_parser.py"),
		ScheduleDataPath: getEnv("SCHEDULE_DATA_PATH", "../public/data/official-schedule.json"),
		AutoSeed:         getEnvBool("AUTO_SEED", false),
	}
}

func getEnv(key, defaultVal string) string {
	if val, ok := os.LookupEnv(key); ok && val != "" {
		return val
	}
	return defaultVal
}

func getEnvBool(key string, defaultVal bool) bool {
	if val, ok := os.LookupEnv(key); ok && val != "" {
		parsed, err := strconv.ParseBool(val)
		if err == nil {
			return parsed
		}
	}
	return defaultVal
}
