# cPanel File Deployment Adapter

## Purpose

The cPanel File Deployment Adapter enables Paperclip agents to publish EngageGroovy website files to a cPanel-hosted server without using internal ChatGPT tools. The Git repository becomes the single source of truth, with the `/site` directory serving as the only agent-editable website source folder.

## Overview

```
Agent edits files → /site/** → cPanel deploy adapter → cPanel document root
```

Agents should only modify files in the `/site` directory. The deployment adapter handles uploading those files to the configured cPanel document root via SFTP or FTP/FTPS.

## Required Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `CPANEL_DEPLOY_HOST` | Yes | - | cPanel server hostname or IP address |
| `CPANEL_DEPLOY_PORT` | No | 22 (SFTP), 21 (FTP) | SSH/FTP port number |
| `CPANEL_DEPLOY_USER` | Yes | - | cPanel username |
| `CPANEL_DEPLOY_PASSWORD` | Yes | - | cPanel password or API token |
| `CPANEL_DEPLOY_PROTOCOL` | No | `sftp` | Connection protocol: `sftp`, `ftp`, or `ftps` |
| `CPANEL_DEPLOY_REMOTE_DIR` | Yes | - | Target directory on cPanel |
| `CPANEL_DEPLOY_LOCAL_DIR` | No | `site` | Local source directory |

## Local Source Folder

The adapter reads files from the `/site` directory by default. This is the **only** approved folder for agent-editable website content.

### Expected Structure

```
site/
├── index.html      (required - adapter validates presence)
├── about.html
├── contact.html
├── services.html
├── work.html
├── 404.html
├── assets/
│   ├── css/
│   │   └── style.css
│   ├── js/
│   │   └── main.js
│   └── images/
│       └── logo.png
└── .well-known/   (preserved during deploy)
    └── acme-challenge/
        └── token
```

## Remote Target Folder

The `CPANEL_DEPLOY_REMOTE_DIR` specifies where files are uploaded on cPanel.

### Recommended Targets

- `/home/engaemyx/public_html` - Standard document root
- `/home/engaemyx/engagegroovy.com` - Domain-specific directory

### Safety Restrictions

The adapter **refuses** to deploy to:

- Root directory (`/`)
- System directories (`/home`, `/tmp`, `/var`, `/etc`, `/usr`, etc.)
- Parent directory traversal (`../`, `../../`, etc.)
- Any path that appears to be outside typical web hosting

## Dry Run

Preview changes without making any remote modifications:

```bash
pnpm deploy:cpanel:dry-run
```

The dry run will:
1. Connect to the remote server (read-only)
2. List all files that would be uploaded
3. Show file sizes
4. **Not upload any files**

## Deployment Commands

### Preview (Dry Run)

```bash
pnpm deploy:cpanel:dry-run
# or
pnpm deploy:cpanel --dry-run
```

### Actual Deployment

```bash
pnpm deploy:cpanel
```

### Verbose Output

```bash
pnpm deploy:cpanel --verbose
```

## Agent Guardrails

### What Agents Can Do

- Edit files in `/site/**`
- Run `pnpm deploy:cpanel:dry-run` to preview changes
- Run `pnpm deploy:cpanel` to deploy (after dry-run validation)

### What Agents Cannot Do

- Edit files outside `/site/`
- Deploy directly to cPanel without using the adapter
- Delete remote files (additive upload only)
- Access `.env`, `node_modules`, `.git`, or other sensitive files

### Agent Instructions

```
Agents should only edit website files in the /site directory.
Use "pnpm deploy:cpanel --dry-run" to preview changes before deployment.
Run "pnpm deploy:cpanel" to deploy to cPanel.
```

## Safety Features

### File Exclusion

The adapter automatically excludes these files from upload:

- `.env`, `.env.*`, `package.json`, `package-lock.json`, `pnpm-lock.yaml`
- `.git`, `.gitignore`, `.gitattributes`
- `node_modules/`, `dist/`, `.next/`, `coverage/`
- `.DS_Store`, `Thumbs.db`

### Remote Directory Validation

The adapter validates that `CPANEL_DEPLOY_REMOTE_DIR` is a reasonable web hosting target. Deployment will fail if the path looks unsafe.

### Preserved Directories

The `.well-known/` directory is preserved during deployments to support:
- SSL/TLS certificates (ACME challenges)
- Securitytxt
- Other well-known URIs

### No Deletion

The adapter **never deletes remote files**. It performs additive uploads only. To remove files, manually delete them via cPanel File Manager or FTP.

## Rollback & Backup

### Manual Rollback

If a deployment causes issues:

1. Log into cPanel File Manager
2. Navigate to the target directory
3. Restore from cPanel's backup feature or manually restore files

### Backup Recommendations

- Enable cPanel's automated daily backups
- Use Version Control (Git) in cPanel for additional safety
- Keep local copies in `/site` (version-controlled)

### Recovery Options

1. **cPanel Backups**: Home → Backups → Download Full Backup
2. **File Manager**: Navigate to directory → Download files before overwrite
3. **Git**: Revert to previous commit if files are tracked

## Troubleshooting

### Connection Issues

```
Error: Connection refused
```

- Verify `CPANEL_DEPLOY_HOST` is correct
- Check that `CPANEL_DEPLOY_PORT` matches the server configuration
- Ensure SFTP/SSH is enabled in cPanel

### Authentication Failed

```
Error: Authentication failed
```

- Verify `CPANEL_DEPLOY_USER` and `CPANEL_DEPLOY_PASSWORD`
- For cPanel, use the cPanel password or create an API token

### Permission Denied

```
Error: Permission denied
```

- Ensure the cPanel user has write access to `CPANEL_DEPLOY_REMOTE_DIR`
- Check directory ownership in cPanel File Manager

### Remote Directory Not Found

```
Error: Remote directory does not exist
```

- The adapter will attempt to create the directory automatically
- Verify the path is correct (e.g., `public_html`, not `/public_html`)

## Configuration Example

```bash
# .env file (DO NOT commit this file with real credentials)
CPANEL_DEPLOY_HOST=engagegroovy.com
CPANEL_DEPLOY_PORT=22
CPANEL_DEPLOY_USER=engaemyx
CPANEL_DEPLOY_PASSWORD=your_cpanel_password_or_api_token
CPANEL_DEPLOY_PROTOCOL=sftp
CPANEL_DEPLOY_REMOTE_DIR=public_html
CPANEL_DEPLOY_LOCAL_DIR=site
```

**Important**: Never commit `.env` files with real credentials. Use `.env.example` with placeholder values only.

## Security Considerations

### Credential Management

- Store credentials in environment variables, not in code
- Use cPanel API tokens instead of passwords when possible
- Rotate credentials periodically

### Secret Redaction

The adapter automatically redacts sensitive values in logs:
- Passwords
- Tokens
- API keys

### Log Safety

Logs will show:
- File paths being uploaded
- Connection status
- Error messages (with credentials redacted)

Logs will **never** show:
- Passwords
- Full paths containing sensitive information
- `.env` file contents