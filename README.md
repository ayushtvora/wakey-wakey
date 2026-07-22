# Wakey Wakey

A smart alarm clock monorepo for an app-first product.

## Stack

- Mobile app: Expo React Native + TypeScript
- API: Node.js + Express + TypeScript
- Data: MongoDB + Mongoose
- Shared code: TypeScript package for common alarm and challenge types

## Structure

- `apps/mobile` - mobile client shell
- `apps/server` - API server shell
- `packages/shared` - shared types and validation primitives

## Getting Started

1. Install dependencies at the repository root.
2. Run the API server.
3. Run the mobile app.

## Notes

- The server is intended to be the source of truth for user data, schedules, and challenge definitions.
- The mobile app should keep enough local state to trigger the alarm even if the server is temporarily unavailable.
