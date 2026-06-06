"use client"
import { useState, useEffect, createContext, useContext, useCallback } from "react"
import {
  getAuth, loginAsync, registerAsync, logout,
  type AuthUser, type LoginResult, type RegisterResult
} from "@/lib/auth"

interface AuthContextValue {
  user: AuthUser | null
  loading: boolean
  login: (email: string, password: string) => Promise<LoginResult>
  register: (name: string, email: string, password: string) => Promise<RegisterResult>
  logout: () => void
  refresh: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(() => {
    const state = getAuth()
    setUser(state.user)
  }, [])

  useEffect(() => {
    refresh()
    setLoading(false)
  }, [refresh])

  const handleLogin = useCallback(async (email: string, password: string): Promise<LoginResult> => {
    const result = await loginAsync(email, password)
    if (result.ok && result.user) setUser(result.user)
    return result
  }, [])

  const handleRegister = useCallback(async (name: string, email: string, password: string): Promise<RegisterResult> => {
    const result = await registerAsync(name, email, password)
    if (result.ok && result.user) setUser(result.user)
    return result
  }, [])

  const handleLogout = useCallback(() => {
    logout()
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, login: handleLogin, register: handleRegister, logout: handleLogout, refresh }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}
