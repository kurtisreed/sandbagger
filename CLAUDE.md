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

### Setup
```bash
# Install dependencies (only needed once)
npm install
```

### Building for Mobile

```bash
# Clean build directory
npm run clean

# Build for production (includes admin interface)
npm run build

# Build lightweight version (no admin files, smaller app size)
npm run build:user

# Build and sync to mobile platforms (with admin)
npm run sync

# Build and sync without admin files (recommended for user apps)
npm run sync:user
```

### Opening in IDEs

```bash
# Open Android project in Android Studio
npm run open:android

# Open iOS project in Xcode
npm run open:ios
```

### Manual Capacitor Commands

```bash
# Run any Capacitor CLI command directly
npx cap [command]

# Examples:
npx cap sync           # Sync after manual build
npx cap update         # Update Capacitor packages
```

## Project Structure

### Source Files (Root Directory)
- `/` - **SOURCE FILES** (edit these files)
  - Core: index.html, script.js, style.css, manifest.json, service-worker.js
  - Backend: PHP files for authentication, scoring, leaderboards
  - Admin: admin.php, tournament-assign.html, /js/, /css/
- `/api/` - Backend API endpoints (45 PHP files)
- `/icons/` - App icons and PWA icons
- `/images/` - Static image assets
- `/android/`, `/ios/` - Native platform projects (managed by Capacitor)

### Build Output (Generated, DO NOT EDIT)
- `/www/` - **GENERATED BUILD OUTPUT**
  - Created by `npm run build`
  - Synced to platforms by `npx cap sync`
  - **Never edit files here directly** - changes will be overwritten

### Configuration Files
- `package.json` - Node dependencies and build scripts
- `capacitor.config.json` - Capacitor configuration (single source of truth)
- Platform configs at `/android/app/src/main/assets/capacitor.config.json` and `/ios/App/App/capacitor.config.json` are auto-generated

## Development Workflow

### Standard Workflow
1. **Edit source files** in root directory (index.html, script.js, PHP files, etc.)
2. **Build**: `npm run build:user` (or `npm run build` for admin)
3. **Sync**: `npx cap sync` (copies www/ → platforms and updates native projects)
4. **Test**: `npm run open:android` or `npm run open:ios`

### Quick Sync Workflow
Combine build + sync:
```bash
npm run sync:user    # Build and sync user version
npm run sync         # Build and sync with admin
```

### Adding New Files
- Add file to root directory
- Update build script in package.json if it's a new type of file
- Run `npm run build` to copy to www/
- Run `npx cap sync` to sync to platforms

### Important Notes
- ⚠️ **Never edit files in /www/ directly** - they are overwritten on each build
- ⚠️ **Never edit files in platform directories** (android/app/src/main/assets/public/ or ios/App/App/public/) - they are synced from www/
- ✅ **Always edit source files in root directory**
- ✅ **Run build before sync** to ensure changes are copied

## Build Types

### User Build (Lightweight)
```bash
npm run build:user
npm run sync:user
```
- Excludes admin interface (admin.php, /js/, /css/, tournament-assign.html)
- Smaller app size
- **Recommended for mobile apps distributed to users**

### Admin Build (Full)
```bash
npm run build
npm run sync
```
- Includes all features including admin interface
- Larger app size
- **Use for development or admin-specific builds**

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