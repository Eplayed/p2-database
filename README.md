# Noah Game Data Platform

This repository integrates data crawlers and processors for Noah's game data services, including Path of Exile 2 (PoE2) ladder data, crafting data, and economy data.

## Project Structure

```text
noah-game-data/
├── config/                 # Centralized configuration
│   ├── env-config.js       # Environment variables management
│   └── oss-config.json     # OSS credentials (git-ignored)
├── data/                   # Local data storage (git-ignored)
├── scripts/                # Utility scripts
├── src/
│   ├── common/             # Shared modules
│   │   ├── oss/            # OSS Uploader
│   │   └── dictionaries/   # Shared translation dictionaries
│   ├── crawlers/           # Dynamic data crawlers
│   │   └── poe2-ladder/    # PoE2 Ladder & Build crawlers
│   └── processors/         # Static data processors
│       ├── poe2-crafting/  # Crafting data processing
│       ├── poe2-price-mgr/ # Price history management
│       └── wow-data/       # WoW asset downloader
└── package.json            # Unified dependencies and scripts
```

## Quick Start

### 1. Installation

```bash
npm install
```

### 2. Configuration

1.  Copy `config/oss-config.json.example` to `config/oss-config.json`.
2.  Fill in your Aliyun OSS credentials.

```json
{
  "region": "oss-cn-hangzhou",
  "accessKeyId": "YOUR_ID",
  "accessKeySecret": "YOUR_SECRET",
  "bucket": "your-bucket",
  "folder": "poe2"
}
```

### 3. Usage

Run crawlers and processors using npm scripts:

```bash
# Crawl PoE2 Ladder Data (Production Mode)
npm run crawl:ladder

# Crawl PoE2 Ladder Data (Dev Mode - with headful browser)
npm run crawl:ladder:dev

# Build and Upload Crafting Data
npm run build:crafting
```

## Modules

### PoE2 Ladder (`src/crawlers/poe2-ladder`)
Crawls character builds from poe.ninja, takes screenshots of skill trees, and uploads data to OSS.

### PoE2 Crafting (`src/processors/poe2-crafting`)
Processes crafting mods and base items, generating JSON data for the mini-program.

## License

Private Repository.
