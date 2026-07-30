# GitHub MCP Server — Setup & Usage

> Integración del Model Context Protocol (MCP) de GitHub con VS Code Copilot
> Chat para el repositorio `giulianotaliano/pill-o-clock`.

---

## Qué es y qué habilita

El **GitHub MCP Server** conecta directamente a Copilot Chat con la API de
GitHub, permitiendo que el modelo ejecute acciones sobre el repositorio sin
salir del editor:

| Capacidad | Ejemplo de uso |
|---|---|
| **Crear issues** | "Crea un issue para el bug de notificaciones en iOS" |
| **Listar/leer issues** | "¿Cuáles son los issues abiertos?" |
| **Crear branches** | "Crea un branch `fix/notification-race-condition`" |
| **Abrir Pull Requests** | "Abre un PR con estos cambios al branch main" |
| **Buscar código** | "Busca todos los archivos que importan `rescheduleAllNotifications`" |
| **Leer archivos del repo** | "Muéstrame el contenido de `src/store/types.ts` en main" |
| **Labels y milestones** | "Agrega el label `bug` al issue #42" |
| **Actions** | "¿Cuál es el estado del último workflow run?" |
| **Code security** | "¿Hay alertas de seguridad activas?" |
| **Notificaciones** | "¿Qué notificaciones tengo sin leer?" |

---

## Componentes instalados

### 1. Binary — `github-mcp-server` v0.32.0 (oficial de GitHub)
```
C:\Users\giuli\AppData\Local\github-mcp-server\github-mcp-server.exe
```
Descargado de: `github.com/github/github-mcp-server/releases`

### 2. Configuración VS Code — `.vscode/mcp.json`
Registra el servidor MCP con Copilot Chat. Usa `${input:github_token}` para
solicitar el Personal Access Token de forma segura al iniciar (nunca se guarda
en disco).

### 3. Copilot Instructions — `.github/copilot-instructions.md`
Provee contexto específico del proyecto (convenciones, arquitectura, patrones)
a Copilot en cada interacción, mejorando significativamente la precisión de las
respuestas.

---

## Configuración inicial (una sola vez)

### Paso 1 — Generar un GitHub Personal Access Token (PAT)

1. Ve a: **https://github.com/settings/tokens?type=beta** (Fine-grained tokens)
2. Click **"Generate new token"**
3. Configuración recomendada:
   - **Token name:** `pill-o-clock-mcp`
   - **Expiration:** 90 days (o el que prefieras)
   - **Repository access:** Only select repositories → `pill-o-clock`
   - **Permissions:**
     - Repository permissions:
       - `Contents` → Read and write
       - `Issues` → Read and write
       - `Pull requests` → Read and write
       - `Actions` → Read-only
       - `Code scanning alerts` → Read-only
       - `Metadata` → Read-only (se activa automáticamente)
     - Account permissions:
       - `Notifications` → Read-only
4. Click **"Generate token"** y **copia el token** (empieza con `github_pat_...`)

### Paso 2 — Iniciar el servidor MCP en VS Code

1. Abre VS Code en el workspace de `pill-o-clock`
2. Abre Copilot Chat (Ctrl+Shift+I)
3. VS Code debería mostrar un banner o prompt pidiendo el token para el servidor
   "github". Si no aparece automáticamente:
   - Abre la Command Palette (Ctrl+Shift+P)
   - Busca **"MCP: List Servers"** o **"MCP: Start Server"**
   - Selecciona **"github"**
4. Pega el PAT cuando se solicite
5. El servidor inicia y las herramientas MCP quedan disponibles en Chat

### Paso 3 — Verificar la conexión

En Copilot Chat, escribe:
```
Lista los issues abiertos del repo pill-o-clock
```
Si responde con los issues del repo, la integración funciona correctamente.

---

## Toolsets habilitados

La configuración en `.vscode/mcp.json` incluye estos toolsets:

| Toolset | Propósito |
|---|---|
| `default` | Repos, issues, PRs, users, copilot context |
| `actions` | Ver estado de GitHub Actions workflows/runs |
| `code_security` | Alertas de seguridad (Dependabot, code scanning) |
| `labels` | Gestión de labels en issues/PRs |
| `notifications` | Notificaciones de GitHub del usuario |

Para agregar más toolsets, edita el array `args` en `.vscode/mcp.json`. Los
toolsets disponibles son: `actions`, `code_security`, `copilot`, `dependabot`,
`discussions`, `gists`, `git`, `issues`, `labels`, `notifications`, `orgs`,
`projects`, `pull_requests`, `repos`, `secret_protection`,
`security_advisories`, `stargazers`, `users`.

---

## Uso avanzado — Workflows de ejemplo

### Bug → Issue → Fix → PR (ciclo completo)
```
1. "Encuentra el bug de race condition entre closeMissedDoses y markDoseTaken"
2. "Crea un issue describiendo el problema con label 'bug' y prioridad alta"
3. [Copilot implementa el fix]
4. "Abre un PR con estos cambios, referenciando el issue"
```

### Code review automatizado
```
"Revisa el PR #15 y deja comentarios sobre posibles problemas de
 accesibilidad y performance"
```

### Auditoría de seguridad
```
"¿Hay alertas de Dependabot activas? Muestra las críticas primero"
```

---

## Troubleshooting

| Problema | Solución |
|---|---|
| "GITHUB_PERSONAL_ACCESS_TOKEN not set" | VS Code no pasó el token. Recargar ventana (Ctrl+Shift+P → "Reload Window") y re-ingresar el PAT |
| "invalid or expired token" | El token expiró o no tiene los scopes correctos. Generar uno nuevo (Paso 1) |
| Herramientas MCP no aparecen en Chat | Verificar que `.vscode/mcp.json` existe y el server está corriendo (MCP: List Servers) |
| Permiso denegado al crear issues/PRs | El PAT necesita permisos de escritura en Issues y Pull Requests |
| Binary no encontrado | Verificar que existe: `C:\Users\giuli\AppData\Local\github-mcp-server\github-mcp-server.exe` |

---

## Actualización del binario

```powershell
$releases = Invoke-RestMethod -Uri "https://api.github.com/repos/github/github-mcp-server/releases/latest" -Headers @{ "User-Agent" = "PS" }
$asset = $releases.assets | Where-Object { $_.name -eq "github-mcp-server_Windows_x86_64.zip" }
$dir = "$env:LOCALAPPDATA\github-mcp-server"
Invoke-WebRequest -Uri $asset.browser_download_url -OutFile "$dir\update.zip" -UseBasicParsing
Expand-Archive -Path "$dir\update.zip" -DestinationPath $dir -Force
Remove-Item "$dir\update.zip"
& "$dir\github-mcp-server.exe" --version
```

---

## Archivos del proyecto

| Archivo | Propósito |
|---|---|
| `.vscode/mcp.json` | Configuración del MCP server para VS Code |
| `.github/copilot-instructions.md` | Instrucciones de contexto para Copilot |
| `docs/github-mcp-setup.md` | Este documento |
