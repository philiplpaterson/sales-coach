import { useEffect, useState } from "react"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { Loader2, Search } from "lucide-react"
import axios from "axios"

import { OpenAPI } from "@/client"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export const Route = createFileRoute("/_layout/history")({
  component: CallHistory,
  head: () => ({
    meta: [{ title: "Call History - Sales Coach" }],
  }),
})

type CallSessionRow = {
  id: string
  persona: string
  created_at: string
  duration_seconds: number | null
  status: string
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return "-"
  const mins = Math.floor(seconds / 60)
  const secs = Math.round(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, "0")}`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

function getStatusBadge(
  status: string,
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "done":
      return "default"
    case "analyzing":
    case "active":
    case "completed":
      return "secondary"
    case "error":
      return "destructive"
    default:
      return "outline"
  }
}

function CallHistory() {
  const [calls, setCalls] = useState<CallSessionRow[]>([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    const fetchCalls = async () => {
      try {
        const token = localStorage.getItem("access_token") || ""
        const res = await axios.get(
          `${OpenAPI.BASE}/api/v1/calls/?limit=100`,
          { headers: { Authorization: `Bearer ${token}` } },
        )
        setCalls(res.data.data)
      } catch {
        // ignore
      } finally {
        setLoading(false)
      }
    }
    fetchCalls()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Call History</h1>
        <p className="text-muted-foreground">
          Review your past practice calls and coaching reports
        </p>
      </div>

      {calls.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center py-12">
          <div className="rounded-full bg-muted p-4 mb-4">
            <Search className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold">
            No practice calls yet
          </h3>
          <p className="text-muted-foreground">
            Start a practice call to see your history here
          </p>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Persona</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {calls.map((call) => (
                <TableRow
                  key={call.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => {
                    if (call.status === "done") {
                      navigate({ to: "/practice" })
                    }
                  }}
                >
                  <TableCell>{formatDate(call.created_at)}</TableCell>
                  <TableCell className="capitalize">
                    {call.persona.replace(/_/g, " ")}
                  </TableCell>
                  <TableCell>{formatDuration(call.duration_seconds)}</TableCell>
                  <TableCell>
                    <Badge variant={getStatusBadge(call.status)}>
                      {call.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
