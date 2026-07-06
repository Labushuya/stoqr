import type { User, Session } from 'better-auth'

declare global {
  namespace App {
    interface Locals {
      user: User | null
      session: Session | null
    }
    interface PageData {
      user: User | null
    }
  }
}

export {}
