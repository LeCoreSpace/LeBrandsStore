#!/bin/bash
set -e
pnpm install --frozen-lockfile
# Database migrations and seeds are manual, Supabase-only operations.
