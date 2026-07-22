// Data layer for the ticket widget. Talks only to the same-origin proxy
// (/api/tickets/*) — reporter identity and the tracker API key are injected
// server-side. Uses a local raw fetch instead of apiFetch because the proxy
// returns French error messages (no_reporter_email, not_configured…) that
// must reach the UI verbatim, and apiFetch discards response bodies.

import { useState, useCallback } from 'react'
import { API_URL } from '@/lib/api'
import type { Ticket, TicketAttachment, TicketCategory, TicketSeverity, TicketStatus } from './types'

async function ticketFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const isForm = options?.body instanceof FormData
  const res = await fetch(`${API_URL}/tickets${path}`, {
    ...options,
    credentials: 'include',
    // Never set Content-Type on multipart — the browser adds the boundary.
    headers: isForm
      ? options?.headers
      : { 'Content-Type': 'application/json', ...options?.headers },
  })
  if (!res.ok) {
    const data = await res.json().catch(() => null)
    const message =
      (data && (data.message || data.detail || data.error)) || `Erreur HTTP ${res.status}`
    const err: Error & { status?: number } = new Error(String(message))
    err.status = res.status
    throw err
  }
  return res.json() as Promise<T>
}

function mapTicket(raw: Record<string, unknown>): Ticket {
  return {
    id: raw.id as string,
    number: typeof raw.number === 'number' ? raw.number : null,
    title: raw.title as string,
    description: raw.description as string,
    severity: raw.severity as TicketSeverity,
    status: raw.status as TicketStatus,
    category: (raw.category as TicketCategory) || 'bug',
    context: (raw.context as string) || null,
    reporter_email: raw.reporter_email as string,
    reporter_name: raw.reporter_name as string,
    created_at: raw.created_at as string,
    comment: (raw.comment as string) || null,
    fixed_in_version: (raw.fixed_in_version as string) || null,
    resolved_at: (raw.resolved_at as string) || null,
    attachments: (raw.attachments as TicketAttachment[]) || [],
  }
}

export interface NewTicket {
  title: string
  description: string
  severity: TicketSeverity
  category: TicketCategory
  context: string | null
}

export function useTickets() {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [listError, setListError] = useState<string | null>(null)

  const fetchMyTickets = useCallback(async () => {
    setIsLoading(true)
    setListError(null)
    try {
      // The proxy scopes the list to the session user's reporter_email.
      const data = await ticketFetch<{ items?: Record<string, unknown>[] }>('')
      setTickets((data.items || []).map(mapTicket))
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Erreur inconnue')
    } finally {
      setIsLoading(false)
    }
  }, [])

  const submitTicket = useCallback(async (data: NewTicket): Promise<Ticket> => {
    setIsSubmitting(true)
    try {
      const created = await ticketFetch<Record<string, unknown>>('', {
        method: 'POST',
        body: JSON.stringify({
          title: data.title,
          description: data.description,
          severity: data.severity,
          category: data.category,
          context: data.context || undefined,
          environment: import.meta.env.DEV ? 'Development' : 'Production',
        }),
      })
      const ticket = mapTicket(created)
      setTickets((prev) => [ticket, ...prev])
      return ticket
    } finally {
      setIsSubmitting(false)
    }
  }, [])

  const fetchTicket = useCallback(async (id: string): Promise<Ticket> => {
    const data = await ticketFetch<Record<string, unknown>>(`/${id}`)
    return mapTicket(data)
  }, [])

  const uploadAttachments = useCallback(async (ticketId: string, files: File[]): Promise<void> => {
    const formData = new FormData()
    for (const file of files) formData.append('files', file)
    await ticketFetch(`/${ticketId}/attachments`, { method: 'POST', body: formData })
  }, [])

  return {
    tickets,
    isLoading,
    isSubmitting,
    listError,
    fetchMyTickets,
    submitTicket,
    fetchTicket,
    uploadAttachments,
  }
}
