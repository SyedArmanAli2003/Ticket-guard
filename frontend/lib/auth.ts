// ─────────────────────────────────────────────────────────────────────────────
// TicketGuard auth — MongoDB-first, localStorage fallback.
//
// Strategy:
//   1. On login/register, hit the backend /api/auth/* endpoints (MongoDB).
//   2. If the DB is unavailable (status:"not_configured"), fall back to the
//      local credential store so the app keeps working offline / in mock mode.
//   3. The session (AuthUser + token) is always persisted in localStorage for
//      instant hydration on page load — no waterfall on every navigation.
// ─────────────────────────────────────────────────────────────────────────────

import { API, isRealMode } from "./config"

export type UserRole = "user" | "admin"

export interface AuthUser {
  id: string
  email: string
  name: string
  role: UserRole
  avatar?: string
  createdAt: string
}

export interface AuthState {
  user: AuthUser | null
  token: string | null
}

// ── Local fallback credential store (demo accounts always available) ──────────
const DEMO_USERS: (AuthUser & { password: string })[] = [
  {
    id: "admin-001",
    email: "admin@ticketguard.ai",
    name: "TG Admin",
    role: "admin",
    password: "admin123",
    createdAt: new Date().toISOString(),
  },
  {
    id: "user-demo",
    email: "demo@ticketguard.ai",
    name: "Demo User",
    role: "user",
    password: "demo123",
    createdAt: new Date().toISOString(),
  },
]

const STORAGE_KEY = "tg_auth"
const USERS_KEY = "tg_users"

function getStoredUsers(): (AuthUser & { password: string })[] {
  if (typeof window === "undefined") return DEMO_USERS
  try {
    const raw = localStorage.getItem(USERS_KEY)
    if (!raw) {
      localStorage.setItem(USERS_KEY, JSON.stringify(DEMO_USERS))
      return DEMO_USERS
    }
    return JSON.parse(raw)
  } catch {
    return DEMO_USERS
  }
}

function saveUsers(users: (AuthUser & { password: string })[]) {
  if (typeof window === "undefined") return
  localStorage.setItem(USERS_KEY, JSON.stringify(users))
}

// ── Session persistence ───────────────────────────────────────────────────────
export function getAuth(): AuthState {
  if (typeof window === "undefined") return { user: null, token: null }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { user: null, token: null }
    return JSON.parse(raw) as AuthState
  } catch {
    return { user: null, token: null }
  }
}

export function setAuth(state: AuthState) {
  if (typeof window === "undefined") return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

export function clearAuth() {
  if (typeof window === "undefined") return
  localStorage.removeItem(STORAGE_KEY)
}

export function isAdmin(): boolean {
  return getAuth().user?.role === "admin"
}

export function isLoggedIn(): boolean {
  return !!getAuth().user
}

// ── Login result shapes ───────────────────────────────────────────────────────
export interface LoginResult {
  ok: boolean
  user?: AuthUser
  error?: string
}

export interface RegisterResult {
  ok: boolean
  user?: AuthUser
  error?: string
}

// ── MongoDB-first login ───────────────────────────────────────────────────────
export async function loginAsync(email: string, password: string): Promise<LoginResult> {
  // Try real backend first
  if (isRealMode()) {
    try {
      const res = await fetch(API.login(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()
      if (data.status === "ok" && data.user) {
        const user = data.user as AuthUser
        const token = btoa(`${user.id}:${Date.now()}`)
        setAuth({ user, token })
        return { ok: true, user }
      }
      if (data.status === "not_configured") {
        // DB offline — fall through to local
      } else {
        return { ok: false, error: data.error || "Invalid email or password." }
      }
    } catch {
      // Network error — fall through to local
    }
  }
  // Local fallback
  return login(email, password)
}

export async function registerAsync(name: string, email: string, password: string): Promise<RegisterResult> {
  if (isRealMode()) {
    try {
      const res = await fetch(API.register(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      })
      const data = await res.json()
      if (data.status === "ok" && data.user) {
        const user = data.user as AuthUser
        const token = btoa(`${user.id}:${Date.now()}`)
        setAuth({ user, token })
        // Also save locally for offline use
        const users = getStoredUsers()
        if (!users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
          users.push({ ...user, password })
          saveUsers(users)
        }
        return { ok: true, user }
      }
      if (data.status === "not_configured") {
        // DB offline — fall through to local
      } else {
        return { ok: false, error: data.error || "Registration failed." }
      }
    } catch {
      // Network error — fall through to local
    }
  }
  return register(name, email, password)
}

// ── Synchronous local-only fallback (used in mock mode or when DB is down) ───
export function login(email: string, password: string): LoginResult {
  const users = getStoredUsers()
  const found = users.find(
    (u) => u.email.toLowerCase() === email.toLowerCase() && u.password === password
  )
  if (!found) return { ok: false, error: "Invalid email or password." }
  const { password: _pw, ...user } = found
  const token = btoa(`${user.id}:${Date.now()}`)
  setAuth({ user, token })
  return { ok: true, user }
}

export function register(name: string, email: string, password: string): RegisterResult {
  const users = getStoredUsers()
  if (users.find((u) => u.email.toLowerCase() === email.toLowerCase())) {
    return { ok: false, error: "An account with this email already exists." }
  }
  if (password.length < 6) return { ok: false, error: "Password must be at least 6 characters." }
  const newUser: AuthUser & { password: string } = {
    id: `user-${Date.now()}`,
    email,
    name,
    role: "user",
    password,
    createdAt: new Date().toISOString(),
  }
  users.push(newUser)
  saveUsers(users)
  const { password: _pw, ...user } = newUser
  const token = btoa(`${user.id}:${Date.now()}`)
  setAuth({ user, token })
  return { ok: true, user }
}

export function logout() {
  clearAuth()
}

/** Return all users (admin only) */
export function getAllUsers(): AuthUser[] {
  return getStoredUsers().map(({ password: _pw, ...u }) => u)
}
