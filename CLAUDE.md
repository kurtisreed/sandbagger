# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Sandbagger is a golf tournament scoring and leaderboard application built as a Progressive Web App (PWA) with Capacitor for mobile deployment. It handles live scoring, match tracking, tournament management, and various golf formats.

## Architecture

### Frontend Structure
- **Hybrid Web/Mobile App**: Built with vanilla JavaScript, HTML, and CSS, packaged with Capacitor for iOS and Android
- **Main Entry Point**: `index.html` - Single-page application with tab navigation
- **Core JavaScript**: `script.js` - Handles API calls, UI rendering, and mobile/web detection
- **PWA Features**: Service worker (`service-worker.js`) and web app manifest for installability
- **Styling**: `style.css` with CSS custom properties for team color theming

### Backend Structure
- **PHP API Layer**: RESTful APIs in `/api/` directory for data operations
- **Database**: MySQL database accessed via `db_connect.php` (credentials in file)
- **Session Management**: PHP sessions for authentication (`authenticate.php`, `check_session.php`)
- **Core Entities**: Tournaments, golfers, matches, rounds, courses, holes, scores

### Mobile App Setup
- **Capacitor Configuration**: `capacitor.config.json` - App ID: `com.sandbagger.scoring`
- **Platform Directories**: `/android/` and `/ios/` contain native app shells
- **Build Output**: `/www/` directory contains the built web assets for mobile deployment

## Development Commands

```bash
# Build web assets and copy to www/ directory
npm run build

# Sync web assets to mobile platforms and update native projects  
npm run sync

# Open Android project in Android Studio
npm run open:android

# Open iOS project in Xcode
npm run open:ios
```

## Key Technical Patterns

### API Communication
- **Dynamic Base URL**: `API_BASE_URL` switches between local development and mobile emulator (10.0.2.2)
- **CORS Handling**: Custom headers in `cors_headers.php` for cross-origin requests
- **Error Handling**: Consistent JSON error responses with HTTP status codes

### Data Flow
- **Authentication**: Golfer selection → Round selection → Session establishment
- **Scoring**: Live hole-by-hole score entry with immediate leaderboard updates
- **Match Types**: Support for various golf formats (stroke play, match play, skins, etc.)

### Mobile Considerations
- **Platform Detection**: Uses Capacitor APIs to detect native vs web environment
- **Network Configuration**: Different API endpoints for development vs mobile deployment
- **PWA Features**: Installable web app with offline capabilities

## Database Schema Key Points
- **Tournaments** link to **Formats** and contain multiple **Rounds**
- **Matches** represent groupings of golfers for specific rounds
- **Hole Scores** store individual stroke data linked to golfers and matches
- **Leaderboards** are calculated dynamically from hole scores with handicap adjustments