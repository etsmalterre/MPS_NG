# Authentication & Permissions

## Authentication (cookie-based picker)

Replaces the legacy WinDev hostname → user lookup. Browsers cannot read the client hostname, so we use a **fullscreen first-visit picker** that lists every user from `utilisateur` (deduped by `(prenom, nom)` to one tile per person) and stores the picked `IDutilisateur` in a signed HttpOnly cookie. Subsequent visits are zero-click.

- **Cookie helpers**: `apps/api/src/lib/auth.ts` — `signUserId`, `verifyUserCookie`, `attachUser()` middleware (best-effort: attaches `req.userId` and `req.adminId`, never 401s), `requireAdmin(req, res)` route guard, `isEffectiveAdmin(req)` helper, `isAdminUtilisateur(u)` (currently hardcoded to Vincent Malterre).
- **Cookies**: `mps_uid` (current acting user) + `mps_uid_admin` (original admin user — persists across switches so an admin can always switch back). Both signed with HMAC-SHA256 + `AUTH_COOKIE_SECRET` (env var, required at runtime; lazy-read because ESM imports hoist before `dotenv.config()`).
- **Routes**: `apps/api/src/routes/auth.ts` — `GET /api/auth/users` (deduped picker list, public), `GET /api/auth/me` (current user + `isAdmin` flag), `POST /api/auth/login` (sets both cookies; admin cookie persists if already present, else established only when picked user is admin), `POST /api/auth/logout` (clears `mps_uid` only, **preserves `mps_uid_admin`** so admins return to admin mode after the next pick).
- **Frontend context**: `apps/web/src/contexts/UserContext.tsx` — `useUser()` hook + `canSwitchUser(user)` helper (checks `user.isAdmin === true`).
- **First-visit picker**: `apps/web/src/components/auth/UserPicker.tsx` — fullscreen takeover with the gold Malterre header. `UserPickerGate` mounts inside `main.tsx` between `UserProvider` and `RouterProvider`.
- **Sidebar/header**: User info + initials avatar lives in the **top-right header** popover (avatar uses `bg-gold` + `text-gold-foreground`). The sidebar has NO user chip. The avatar popover shows the name + a "Changer d'utilisateur" button **only when `canSwitchUser(user)` is true** (admin-only — Vincent).
- **Effective vs session admin**: `isAdmin` (session-level, admin cookie present) is true even when an admin impersonates another user — keeps the "Changer d'utilisateur" button visible. `isEffectiveAdmin` (`req.userId === req.adminId`) is **false during impersonation** — this is what gates permission bypasses, the Settings menu, and the `requireAdmin` middleware. Impersonation = "see exactly what they see".
- **CORS**: `index.ts` reads `CORS_ORIGIN` env var (comma-separated origin list), passes to `cors({ origin: [...], credentials: true })`. **Cannot be `*` with credentials.** Default dev = `http://localhost:5174`.

## Permissions (per-user, JSON-backed)

Per-user action permissions managed from the admin-only **Settings → Utilisateurs** screen. **Default closed** — non-admins with no permission record cannot perform gated actions. **Effective admins (Vincent acting as himself, NOT impersonating)** bypass all checks automatically.

- **Storage**: `apps/api/data/permissions.json` (gitignored). Shape: `{ version: 1, users: { [IDutilisateur]: PermissionKey[] } }`. Created lazily on first write, cached in memory at module load, atomic writes via `.tmp` + rename.
- **⚠️ TODO migration**: Once the data migration phase is complete, move this to a real DB table. `apps/api/src/lib/permissions.ts` has a `// TODO migration:` comment at the top.
- **Catalog**: `apps/api/src/lib/permission-keys.ts` exports `PERMISSION_KEYS = [{ key, label, description, category }]`. **Adding a new gated action requires 3 edits**: (1) append to `PERMISSION_KEYS`, (2) gate the API route via `userHasPermission(req.userId, isEffectiveAdmin(req), 'key')`, (3) hide the UI element via `useHasPermission('key')`.
- **Currently gated**: `create_stock_fil` only. The **`POST /api/stock/fil`** endpoint and the **"Nouveau" button** in `FournisseursStock.tsx` are both gated.
- **Lib helpers**: `apps/api/src/lib/permissions.ts` — `loadPermissions`, `getUserPermissions`, `setUserPermissions`, `userHasPermission(userId, isEffectiveAdmin, key)` (admin bypass inside), `getAllPermissions`.
- **Routes**: `apps/api/src/routes/permissions.ts` — `GET /me` (returns `{ isAdmin, isEffectiveAdmin, granted }`), `GET /keys` (catalog), `GET /users` (admin-only), `PUT /users/:id` (admin-only).
- **Frontend context**: `apps/web/src/contexts/PermissionsContext.tsx` — `usePermissions()` exposes `granted`, `isAdmin`, `isEffectiveAdmin`, `has(key)`, `refresh()`. `useHasPermission('key')` is the convenience hook for gated UI. **`has()` uses `isEffectiveAdmin` for bypass — admins who impersonate lose their bypass**, matching the "see as user X" UX.
- **Admin guard**: `requireAdmin` middleware checks `isEffectiveAdmin(req)` (NOT just `req.adminId !== undefined`). Sidebar `visibleSettings` filter and the `SettingsUtilisateurs` page guard both use `isEffectiveAdmin` from `usePermissions()` — when Vincent impersonates someone, the Settings menu vanishes and direct URL hits redirect to `/`.
- **adminOnly submenu flag**: `SubMenuItem.adminOnly?: boolean` in `apps/web/src/config/navigation.ts`. Sidebar filters them out when `!isEffectiveAdmin`. Settings menu hides entirely when no submenus remain.
