'use client'
/**
 * Mounted by the overlaid root layout. Installing the fetch shim at module
 * evaluation (not in an effect) matters: child effects — server-status.tsx's
 * first poll — run before a parent's effect would.
 */
import { useEffect } from 'react'
import { installFetchShim } from './fetch-shim'
import { ensureWorker } from './transport'

if (typeof window !== 'undefined') installFetchShim()

export default function DemoBoot() {
  useEffect(() => { ensureWorker() }, [])
  return null
}
